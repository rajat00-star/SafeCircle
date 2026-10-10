"use client";
import { useEffect, useRef, useState } from "react";
import type * as T from "three";

/*
  The hero sculpture: an iridescent glass ring with a chrome gyroscope ring inside it, hanging on a
  figure-8 thread of light inside a slow particle cloud. Real-time WebGL (three.js), loaded lazily
  so the analysis tool is interactive before any 3D code downloads.

  Rendering tiers
  - "high": transmission glass, bloom, ~1800 particles, DPR up to 2.
  - "low":  (few cores / little memory / small screen) no transmission pass, no bloom, fewer particles, DPR <= 1.25.
  - fallback: no WebGL, Save-Data, or a lost context -> a static CSS sculpture.
  Reduced motion renders still frames only (no animation loop). The loop also pauses when the hero is
  off-screen or the tab is hidden, and drops to the cheaper path if frames get slow.
*/

type Tier = "high" | "low";

function pickTier(): Tier | "fallback" {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return "fallback";
  try {
    const c = document.createElement("canvas");
    if (!(c.getContext("webgl2") || c.getContext("webgl"))) return "fallback";
  } catch {
    return "fallback";
  }
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  if (cores <= 4 || mem <= 4 || window.innerWidth < 760) return "low";
  return "high";
}

export default function HeroScene() {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const tier = pickTier();
    if (tier === "fallback") { setFallback(true); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const { EffectComposer } = await import("three/examples/jsm/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/examples/jsm/postprocessing/RenderPass.js");
      const { UnrealBloomPass } = await import("three/examples/jsm/postprocessing/UnrealBloomPass.js");
      const { OutputPass } = await import("three/examples/jsm/postprocessing/OutputPass.js");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: tier === "high", alpha: false, powerPreference: "high-performance" });
      } catch {
        setFallback(true);
        return;
      }
      let dprCap = tier === "high" ? 2 : 1.25;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
      renderer.setClearColor(0x060609, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.92;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute("aria-hidden", "true");
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060609); // opaque, so the glass has a real scene to refract
      scene.fog = new THREE.FogExp2(0x07060c, 0.045);
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 0, 8);

      // --- Studio environment for reflections: dark room with a few soft light panels.
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x040307);
      const panel = (w: number, h: number, color: number, intensity: number, pos: [number, number, number], rot: [number, number, number]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
        m.position.set(...pos); m.rotation.set(...rot); envScene.add(m);
      };
      panel(10, 1.4, 0xffffff, 1.8, [0, 5, -1], [Math.PI / 2, 0, 0]);       // soft top light
      panel(1.6, 8, 0x8f6bff, 4.0, [-6, 0, 0], [0, Math.PI / 2, 0]);         // violet strip, left
      panel(1.4, 7, 0x8fe6ff, 3.2, [6, 0.5, -1], [0, -Math.PI / 2, 0]);
      panel(0.8, 5, 0xff5cb8, 1.6, [-3, 2, -6], [0, 0.4, 0]);                 // pink rim accent      // icy strip, right
      panel(6, 0.5, 0xffd9a8, 1.1, [0, -3, -6], [0, 0, 0]);                  // faint warm rim, back
      panel(3, 3, 0x5cebb0, 0.35, [2, -5, 3], [-Math.PI / 2, 0, 0]);         // hint of mint from below
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(envScene, 0.03);
      scene.environment = envRT.texture;
      envScene.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as T.Material).dispose(); } });

      // --- Backdrop: soft violet/teal fog glow behind the sculpture.
      const backdropMat = new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          varying vec2 vUv; uniform float uTime;
          void main(){
            vec2 p = vUv - 0.5;
            float v = pow(smoothstep(0.5, 0.0, length((p - vec2(0.06, 0.04)) * vec2(1.0, 1.5))), 1.6);
            float t = smoothstep(0.6, 0.0, length(p - vec2(-0.2 + 0.03*sin(uTime*0.1), -0.18)));
            vec3 col = vec3(0.24, 0.16, 0.50) * v * 0.45 + vec3(0.15, 0.24, 0.21) * t * 0.55;
            gl_FragColor = vec4(vec3(0.0235, 0.0235, 0.035) + col * 0.5, 1.0);
          }`,
      });
      const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), backdropMat);
      backdrop.position.z = -8;
      scene.add(backdrop);

      // --- Sculpture
      const sculpture = new THREE.Group();
      scene.add(sculpture);
      const ringGroup = new THREE.Group();
      sculpture.add(ringGroup);

      const seg = tier === "high" ? [160, 320] : [64, 160];
      const glass = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.0, roughness: 0.02,
        transmission: tier === "high" ? 1 : 0, thickness: 0.6, ior: 1.4,
        transparent: tier !== "high", opacity: tier === "high" ? 1 : 0.38,
        iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [120, 900],
        clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.1, specularIntensity: 1, dispersion: 4,
        attenuationColor: new THREE.Color(0xe4dcff), attenuationDistance: 3.5,
      });
      const glassRing = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.34, seg[0] / 4, seg[1]), glass);
      ringGroup.add(glassRing);

      const chrome = new THREE.MeshPhysicalMaterial({
        color: 0xdedcea, metalness: 1, roughness: 0.14, iridescence: 0.55, iridescenceIOR: 1.6,
        iridescenceThicknessRange: [300, 700], envMapIntensity: 1.35, clearcoat: 0.6,
      });
      const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 24, seg[1] / 2), chrome);
      innerRing.rotation.x = Math.PI / 2.4;
      ringGroup.add(innerRing);
      const innerRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.028, 16, seg[1] / 2), chrome);
      innerRing2.rotation.y = Math.PI / 2.2;
      ringGroup.add(innerRing2);

      // Core: a small luminous point at the centre (it blooms on the high tier).
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe9e2ff).multiplyScalar(2.2) }));
      ringGroup.add(core);

      // Figure-8 thread of light the ring hangs on, plus a pendant line rising out of frame.
      const lemniscate: InstanceType<typeof THREE.Vector3>[] = [];
      for (let i = 0; i < 200; i++) {
        const t = (i / 200) * Math.PI * 2;
        const d = 1 + Math.sin(t) ** 2;
        lemniscate.push(new THREE.Vector3((2.6 * Math.cos(t)) / d, 0.18 * Math.sin(t * 2), (2.6 * Math.sin(t) * Math.cos(t)) / d));
      }
      const threadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcdbfff).multiplyScalar(tier === "high" ? 2.0 : 1.2), transparent: true, opacity: 0.85, fog: true });
      const thread = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lemniscate, true), 400, 0.008, 8, true), threadMat);
      thread.position.y = -1.75;
      thread.rotation.x = 0.12;
      sculpture.add(thread);
      const pendant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 8, 6), threadMat);
      pendant.position.y = 1.32 + 0.34 + 4;
      sculpture.add(pendant);

      // --- Particle cloud (GPU-animated; colour accents are sparse).
      const N = tier === "high" ? 1800 : 650;
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seed = new Float32Array(N);
      const palette = [[0.86, 0.85, 0.95], [0.68, 0.58, 1.0], [0.65, 0.86, 1.0], [1.0, 0.82, 0.45], [1.0, 0.55, 0.75], [0.45, 0.92, 0.75]];
      for (let i = 0; i < N; i++) {
        const r = 2.2 + Math.pow(Math.random(), 0.7) * 5.5, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 1.5;
        const roll = Math.random();
        const c = palette[roll < 0.62 ? 0 : roll < 0.82 ? 1 : roll < 0.9 ? 2 : roll < 0.95 ? 3 : roll < 0.98 ? 4 : 5];
        col.set(c, i * 3);
        seed[i] = Math.random();
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      pGeo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
      const pMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uBurst: { value: reduced ? 0 : 1 }, uPx: { value: renderer.getPixelRatio() } },
        vertexShader: `
          attribute vec3 color; attribute float seed; varying vec3 vCol; varying float vA;
          uniform float uTime; uniform float uBurst; uniform float uPx;
          void main(){
            vec3 p = position;
            float s = seed * 6.2831;
            p += vec3(sin(uTime*0.15 + s), cos(uTime*0.12 + s*1.3), sin(uTime*0.1 + s*0.7)) * 0.18;
            p *= 1.0 + uBurst * (2.2 + seed * 2.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float tw = 0.6 + 0.4 * sin(uTime * (0.6 + seed) + s);
            gl_PointSize = (1.2 + seed * 2.4) * uPx * (9.0 / -mv.z) * (1.0 + uBurst * 1.5);
            vCol = mix(color, vec3(1.0, 0.8, 0.36), clamp(uBurst * 1.3, 0.0, 0.9)); vA = tw * (1.0 + uBurst * 0.6);
          }`,
        fragmentShader: `
          varying vec3 vCol; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vCol, a * vA * 0.9); }`,
      });
      const points = new THREE.Points(pGeo, pMat);
      scene.add(points);

      // Vertical dotted strand of light beside the ring (from the reference intro).
      const SN = 90, sPos = new Float32Array(SN * 3), sCol = new Float32Array(SN * 3), sSeed = new Float32Array(SN);
      for (let i = 0; i < SN; i++) {
        const y = -3.2 + (i / SN) * 7.5;
        sPos.set([2.15 + Math.sin(y * 1.7) * 0.05, y, 0.2 + Math.cos(y * 1.3) * 0.05], i * 3);
        sCol.set([0.92, 0.9, 1.0], i * 3);
        sSeed[i] = (i * 0.618) % 1;
      }
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
      sGeo.setAttribute("color", new THREE.BufferAttribute(sCol, 3));
      sGeo.setAttribute("seed", new THREE.BufferAttribute(sSeed, 1));
      const strand = new THREE.Points(sGeo, pMat);
      sculpture.add(strand);

      // --- Post-processing (high tier only)
      let composer: InstanceType<typeof EffectComposer> | null = null;
      let bloom: InstanceType<typeof UnrealBloomPass> | null = null;
      const buildComposer = () => {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.5, 0.94);
        composer.addPass(bloom);
        composer.addPass(new OutputPass());
      };
      if (tier === "high") buildComposer();

      // --- Layout
      let wide = true;
      const resize = () => {
        const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
        wide = w >= 900;
        renderer.setSize(w, h, false);
        composer?.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        pMat.uniforms.uPx.value = renderer.getPixelRatio();
      };
      resize();

      // --- Interaction state
      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const onPointer = (e: PointerEvent) => {
        pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
      let scrollP = 0, scrollT = 0;
      const onScroll = () => { scrollT = Math.min(1.4, window.scrollY / Math.max(1, el.clientHeight)); };
      onScroll();

      const clock = new THREE.Clock();
      let elapsed = 0, raf = 0, running = false, visible = true;
      let slowFrames = 0, sampled = 0, degraded = tier !== "high";

      const place = (t: number) => {
        // Composition: ring sits right of centre on wide screens, above the headline on narrow ones.
        const baseX = wide ? 0.55 : 0.45, baseY = wide ? 0.3 : 1.9, scale = wide ? 0.82 : 0.56;
        scrollP += (scrollT - scrollP) * (reduced ? 1 : 0.08);
        pointer.x += (pointer.tx - pointer.x) * 0.05;
        pointer.y += (pointer.ty - pointer.y) * 0.05;
        sculpture.position.set(baseX - scrollP * 0.9, baseY + Math.sin(t * 0.6) * 0.06 + scrollP * 1.6, -scrollP * 1.2);
        sculpture.scale.setScalar(scale);
        ringGroup.rotation.set(0.35 + Math.sin(t * 0.4) * 0.1 + pointer.y * 0.25 + scrollP * 0.8, t * 0.18 + pointer.x * 0.35, -0.25 + Math.sin(t * 0.3) * 0.05);
        innerRing.rotation.z = t * 0.5;
        innerRing2.rotation.x = -t * 0.38;
        thread.rotation.y = t * 0.06;
        points.rotation.y = t * 0.02 + pointer.x * 0.05;
        camera.position.set(pointer.x * 0.25 + scrollP * 0.6, -pointer.y * 0.15, 8 - scrollP * 2.4);
        camera.lookAt(scrollP * 0.4, scrollP * 0.3, 0);
        backdropMat.uniforms.uTime.value = t;
        pMat.uniforms.uTime.value = t;
      };
      const draw = () => { if (composer && !degraded) composer.render(); else renderer.render(scene, camera); };

      const frame = () => {
        raf = 0;
        if (!running) return;
        const dt = Math.min(clock.getDelta(), 0.1);
        elapsed += dt;
        pMat.uniforms.uBurst.value = Math.max(0, 1 - elapsed / 2.4) ** 3; // particle burst clears into the hero
        place(elapsed);
        draw();
        // Frame-time watchdog: if the device struggles, drop bloom and resolution once.
        if (!degraded && elapsed > 1.5 && sampled < 120) {
          sampled++;
          if (dt > 0.026) slowFrames++;
          if (sampled === 120 && slowFrames > 50) {
            degraded = true; dprCap = 1;
            renderer.setPixelRatio(1); resize();
          }
        }
        raf = requestAnimationFrame(frame);
      };
      const start = () => {
        if (reduced || running || !visible || document.hidden) return;
        running = true; clock.getDelta(); raf = requestAnimationFrame(frame);
      };
      const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
      const still = () => { place(reduced ? 6 : elapsed); draw(); };

      const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); else stop(); }, { threshold: 0 });
      io.observe(el);
      const onVis = () => (document.hidden ? stop() : start());
      const onResize = () => { resize(); if (!running) still(); };
      const onReducedScroll = () => { onScroll(); if (reduced) still(); };
      const onLost = (e: Event) => { e.preventDefault(); stop(); setFallback(true); };

      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onReducedScroll, { passive: true });
      if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      renderer.domElement.addEventListener("webglcontextlost", onLost);

      still();
      el.dataset.ready = "true";
      start();

      cleanup = () => {
        stop();
        io.disconnect();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onReducedScroll);
        window.removeEventListener("pointermove", onPointer);
        document.removeEventListener("visibilitychange", onVis);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        scene.traverse((o) => {
          const m = o as T.Mesh;
          if (m.geometry) m.geometry.dispose();
          const mat = m.material as T.Material | T.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
        });
        envRT.dispose();
        pmrem.dispose();
        composer?.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch(() => setFallback(true));

    return () => { disposed = true; cleanup?.(); };
  }, []);

  return (
    <div className="hero-stage" ref={host}>
      {fallback && (<><div className="sculpture-fallback" /><div className="sculpture-core" /></>)}
    </div>
  );
}
