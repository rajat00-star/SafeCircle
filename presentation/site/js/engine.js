// One WebGL renderer shared by every scene, with quality tiers, controlled bloom, a frame-time watchdog,
// HTML labels anchored to 3D points, and render-on-demand when motion is reduced.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export const COLORS = {
  bg: 0x04060c, cyan: 0x3ee6ff, violet: 0xa08cff, threat: 0xff5468, text: 0xe9f0fb, grid: 0x1a3550,
  low: 0x5cebb0, medium: 0xffb84d, high: 0xff6161, glass: 0x0e1a33,
};

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

function pickTier() {
  const params = new URLSearchParams(location.search);
  if (params.get("quality")) return params.get("quality");
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  const narrow = Math.min(innerWidth, innerHeight) < 600;
  const saveData = navigator.connection && navigator.connection.saveData;
  return cores <= 4 || mem <= 4 || narrow || saveData ? "low" : "high";
}

export class Engine {
  constructor(canvas, labelsEl, { reduced }) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    this.reduced = reduced;
    this.tier = pickTier();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(COLORS.bg, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.setPixelRatio();
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.62);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloom.enabled = this.tier === "high";
    this.active = null;
    this.labels = [];
    this.clock = new THREE.Clock();
    this.slowFrames = 0;
    this.running = false;
    this.needsRender = true;
    this.pointer = new THREE.Vector2(0, 0);
    this.lost = false;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; this.onLost && this.onLost(); });
    addEventListener("resize", () => this.resize());
    addEventListener("pointermove", (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (this.reduced) this.invalidate();
    }, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) { this.clock.getDelta(); this.invalidate(); } });
    this.resize();
  }

  setPixelRatio() {
    const cap = this.tier === "high" ? 2 : 1.25;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    if (this.active) { this.active.camera.aspect = w / h; this.active.camera.updateProjectionMatrix(); this.active.resize && this.active.resize(w, h); }
    this.invalidate();
  }

  setReduced(v) { this.reduced = v; this.invalidate(); if (!v) this.start(); }

  use(sceneObj) {
    if (this.active && this.active !== sceneObj) this.active.exit && this.active.exit();
    this.active = sceneObj;
    this.renderPass.scene = sceneObj.scene;
    this.renderPass.camera = sceneObj.camera;
    this.setLabels(sceneObj.labels || []);
    this.resize();
    sceneObj.enter && sceneObj.enter();
    this.invalidate();
    this.start();
  }

  setLabels(list) {
    this.labelsEl.replaceChildren(...list.map((l) => l.el));
    this.labels = list;
  }

  invalidate() { this.needsRender = true; if (!this.running) this.start(); }

  start() {
    if (this.running) return;
    this.running = true;
    const v = new THREE.Vector3();
    const loop = () => {
      if (this.lost) { this.running = false; return; }
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const animate = !this.reduced && !document.hidden;
      const a = this.active;
      if (a && (animate || this.needsRender)) {
        const t0 = performance.now();
        const moving = a.update ? a.update(animate ? dt : 0, this.clock.elapsedTime, this.pointer, animate) : false;
        this.composer.render();
        this.projectLabels(v);
        this.needsRender = !!moving && this.reduced ? true : false;
        this.watchdog(performance.now() - t0, animate);
      }
      if (animate || this.needsRender) requestAnimationFrame(loop);
      else this.running = false;
    };
    requestAnimationFrame(loop);
  }

  watchdog(ms, animate) {
    if (!animate) return;
    this.slowFrames = ms > 28 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 45 && this.tier === "high") {
      this.tier = "low"; this.bloom.enabled = false; this.setPixelRatio(); this.resize(); this.slowFrames = 0;
    }
  }

  projectLabels(v) {
    const a = this.active;
    if (!a) return;
    const w = innerWidth, h = innerHeight;
    for (const l of this.labels) {
      if (l.hidden) { l.el.style.display = "none"; continue; }
      (l.target.getWorldPosition ? l.target.getWorldPosition(v) : v.copy(l.target));
      if (l.offset) v.add(l.offset);
      v.project(a.camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      l.el.style.display = visible ? "" : "none";
      if (visible) l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  pick(clientX, clientY, objects) {
    const a = this.active;
    if (!a) return null;
    const ray = new THREE.Raycaster();
    ray.params.Line = { threshold: 0.05 };
    ray.setFromCamera(new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1), a.camera);
    const hit = ray.intersectObjects(objects, false)[0];
    return hit ? hit.object : null;
  }
}

// ---------- Shared building blocks ----------
export function makeLabel(text, cls = "", { sub, onClick, title } = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = `tag3d ${cls}`;
  el.textContent = text;
  if (title) el.title = title;
  if (sub) { const s = document.createElement("small"); s.textContent = sub; el.appendChild(s); }
  if (onClick) el.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  else { el.tabIndex = -1; el.style.pointerEvents = "none"; }
  return el;
}

export function gridFloor(size = 60, div = 60, y = -3, color = COLORS.grid, opacity = 0.35) {
  const g = new THREE.GridHelper(size, div, color, color);
  g.position.y = y;
  g.material.transparent = true;
  g.material.opacity = opacity;
  g.material.depthWrite = false;
  return g;
}

export function dust(count = 900, radius = 30, color = 0x9fdcff, size = 0.035) {
  const pos = new Float32Array(count * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rnd() - 0.5) * radius * 2;
    pos[i * 3 + 1] = (rnd() - 0.3) * radius * 0.8;
    pos[i * 3 + 2] = (rnd() - 0.5) * radius * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  return new THREE.Points(geo, m);
}

export function glowSprite(color = COLORS.cyan, scale = 1.6, opacity = 0.55) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(scale);
  return s;
}

export function line(a, b, { color = COLORS.cyan, dashed = false, opacity = 0.8 } = {}) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(geo, mat);
  if (dashed) l.computeLineDistances();
  return l;
}

export function curve(a, b, lift = 1.2, segments = 40) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += lift;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry && o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); });
  });
}

// Smooth camera move; instant when motion is reduced.
export function tweenCamera(cam, target, lookFrom, lookTo, toPos, duration, reduced, onDone) {
  const from = cam.position.clone();
  const lf = lookFrom.clone();
  if (reduced || duration <= 0) { cam.position.copy(toPos); target.copy(lookTo); cam.lookAt(target); onDone && onDone(); return { done: true, step: () => false }; }
  let t = 0;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  return {
    done: false,
    step(dt) {
      t = Math.min(1, t + dt / duration);
      const k = ease(t);
      cam.position.lerpVectors(from, toPos, k);
      target.lerpVectors(lf, lookTo, k);
      cam.lookAt(target);
      if (t >= 1) { this.done = true; onDone && onDone(); }
      return !this.done;
    },
  };
}
