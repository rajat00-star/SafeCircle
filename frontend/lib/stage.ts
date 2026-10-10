// Minimal shared WebGL stage for the smaller scenes (page backdrops, result sculpture).
// Handles renderer setup, a studio environment for glass, resize, visibility-paused animation,
// on-demand drawing for reduced motion, and full disposal.
import type * as T from "three";
import { pickTier, prefersReducedMotion, type Tier } from "./gfx";

export type Stage = {
  THREE: typeof import("three");
  tier: Exclude<Tier, "fallback">;
  reduced: boolean;
  renderer: T.WebGLRenderer;
  scene: T.Scene;
  camera: T.PerspectiveCamera;
  /** Ask for a single frame (used for reduced motion and state changes). */
  requestDraw: () => void;
  dispose: () => void;
};

export async function createStage(el: HTMLElement, opts: {
  fov?: number; z?: number; onFrame: (t: number, dt: number) => void; onFail: () => void; transparent?: boolean;
}): Promise<Stage | null> {
  const tier = pickTier();
  if (tier === "fallback") { opts.onFail(); return null; }
  const reduced = prefersReducedMotion();
  const THREE = await import("three");
  let renderer: T.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: opts.transparent ?? true, powerPreference: "low-power" });
  } catch { opts.onFail(); return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === "high" ? 2 : 1.25));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute("aria-hidden", "true");
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, 1, 0.1, 100);
  camera.position.set(0, 0, opts.z ?? 6);

  const env = new THREE.Scene();
  env.background = new THREE.Color(0x030206);
  const panel = (w: number, h: number, c: number, k: number, p: [number, number, number], r: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...p); m.rotation.set(...r); env.add(m);
  };
  panel(8, 1.2, 0xffffff, 1.6, [0, 5, 0], [Math.PI / 2, 0, 0]);
  panel(1.4, 7, 0x8f6bff, 2.4, [-5, 0, 0], [0, Math.PI / 2, 0]);
  panel(1.4, 7, 0x4fe3ff, 1.8, [5, 0, 0], [0, -Math.PI / 2, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(env, 0.04);
  scene.environment = envRT.texture;
  env.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as T.Material).dispose(); } });

  const resize = () => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();

  const clock = new THREE.Clock();
  let t = 0, raf = 0, running = false, visible = false, queued = false;
  const frame = () => {
    raf = 0;
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    t += dt; opts.onFrame(t, dt); renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (reduced || running || !visible || document.hidden) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
  const requestDraw = () => {
    if (running || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; opts.onFrame(reduced ? 4 : t, 0.016); renderer.render(scene, camera); });
  };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { start(); requestDraw(); } else stop(); });
  io.observe(el);
  const onVis = () => (document.hidden ? stop() : start());
  const onResize = () => { resize(); requestDraw(); };
  const onLost = (e: Event) => { e.preventDefault(); stop(); opts.onFail(); };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);
  renderer.domElement.addEventListener("webglcontextlost", onLost);

  return {
    THREE, tier, reduced, renderer, scene, camera, requestDraw,
    dispose: () => {
      stop(); io.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      scene.traverse((o) => {
        const m = o as T.Mesh;
        m.geometry?.dispose();
        const mat = m.material as T.Material | T.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
      envRT.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
