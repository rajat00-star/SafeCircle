// Scene A: the end-to-end system as layered glass tiers. Modules are the real components of this repository;
// animated particles follow the real request paths. Click a module for its purpose, inputs, outputs and status.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { COLORS, gridFloor, dust, glowSprite, makeLabel, curve, tweenCamera } from "../engine.js";
import { COMPONENTS, FLOWS, TIERS } from "../content.js";

const TIER_Y = [3.0, 0.9, -1.2, -3.1];
const POS = {
  user: [-5.2, 0, 0.2], extension: [-1.2, 0, 0.9], dashboard: [3.4, 0, 0.2],
  api: [-1.2, 0, 0], review: [4.6, 0, 0.4],
  detector: [-4.0, 0, 0.4], casengine: [0.8, 0, 0.2], llm: [5.6, 0, -0.8],
  db: [0.2, 0, 0],
};

export function createSceneA(engine, { onSelect }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.035);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
  const home = { pos: new THREE.Vector3(8.5, 8.0, 19.5), look: new THREE.Vector3(-3.0, 0.9, 0) };
  camera.position.set(22, 14, 26);
  const target = home.look.clone();
  camera.lookAt(target);

  scene.add(new THREE.AmbientLight(0x7790b0, 0.7));
  const key = new THREE.DirectionalLight(0xcfeeff, 1.2); key.position.set(6, 10, 8); scene.add(key);
  const fill = new THREE.PointLight(COLORS.violet, 40, 40); fill.position.set(-8, -2, 6); scene.add(fill);
  scene.add(gridFloor(70, 70, -4.4, COLORS.grid, 0.25));
  scene.add(dust(engine.tier === "high" ? 700 : 300, 26, 0x9fdcff, 0.03));

  // Tier slabs: thin glass with a hairline edge.
  const labels = [];
  TIER_Y.forEach((y, i) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.06, 4.6),
      new THREE.MeshPhysicalMaterial({ color: 0x10203c, transparent: true, opacity: 0.32, roughness: 0.15, metalness: 0.1, clearcoat: 1, depthWrite: false }));
    slab.position.set(0.3, y - 0.36, 0);
    scene.add(slab);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.18 }));
    edges.position.copy(slab.position);
    scene.add(edges);
    const anchor = new THREE.Object3D();
    anchor.position.set(-7.0, y - 0.3, 2.35);
    scene.add(anchor);
    labels.push({ el: makeLabel(TIERS[i], "quiet"), target: anchor });
  });

  // Modules.
  const meshes = [];
  const nodes = {};
  COMPONENTS.forEach((c) => {
    const [x, , z] = POS[c.id];
    const y = TIER_Y[c.tier];
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 1.2),
      new THREE.MeshPhysicalMaterial({ color: c.optional ? 0x1a1630 : 0x0d1d36, emissive: c.optional ? COLORS.violet : COLORS.cyan,
        emissiveIntensity: 0.08, roughness: 0.25, metalness: 0.35, transparent: true, opacity: c.optional ? 0.6 : 0.92, clearcoat: 1 }));
    box.userData.id = c.id;
    g.add(box);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: c.optional ? COLORS.violet : COLORS.cyan, transparent: true, opacity: c.optional ? 0.5 : 0.85 }));
    g.add(edge);
    const glow = glowSprite(c.optional ? COLORS.violet : COLORS.cyan, 3.2, c.optional ? 0.12 : 0.22);
    glow.position.y = 0.05;
    g.add(glow);
    // Status light: red for "not verified" items, amber for partial, green otherwise.
    const worst = c.status.some(([s]) => s === "no") ? COLORS.threat : c.status.some(([s]) => s === "partial") ? COLORS.medium : COLORS.low;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: worst }));
    led.position.set(1.0, 0.3, 0.45);
    g.add(led);
    scene.add(g);
    meshes.push(box);
    nodes[c.id] = { group: g, box, edge, glow, comp: c };
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.75, 0);
    g.add(anchor);
    labels.push({ el: makeLabel(c.short, c.optional ? "" : "", { sub: c.optional ? "optional · off by default" : TIERS[c.tier].split(" · ")[0], onClick: () => select(c.id) }), target: anchor, id: c.id });
  });

  // Flows with travelling particles.
  const flows = FLOWS.map(([a, b, label, optional]) => {
    const pa = nodes[a].group.position.clone(), pb = nodes[b].group.position.clone();
    const lift = a === "review" && b === "user" ? 3.4 : Math.abs(pa.y - pb.y) < 0.1 ? 1.1 : 0.6;
    const cv = curve(pa, pb, lift);
    const geo = new THREE.BufferGeometry().setFromPoints(cv.getPoints(60));
    const mat = optional
      ? new THREE.LineDashedMaterial({ color: COLORS.violet, dashSize: 0.16, gapSize: 0.12, transparent: true, opacity: 0.5 })
      : new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.32 });
    const ln = new THREE.Line(geo, mat);
    if (optional) ln.computeLineDistances();
    scene.add(ln);
    const parts = [];
    for (let i = 0; i < (optional ? 1 : 3); i++) {
      const s = glowSprite(optional ? COLORS.violet : COLORS.cyan, 0.38, 0.95);
      s.userData.phase = i / 3;
      scene.add(s);
      parts.push(s);
    }
    return { a, b, label, optional, cv, ln, mat, parts, speed: 0.12 + (a.length % 3) * 0.03 };
  });

  const controls = new OrbitControls(camera, engine.canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 7;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.target.copy(target);
  controls.enabled = false;
  controls.addEventListener("change", () => engine.invalidate());

  let selected = null;
  function select(id) {
    selected = id;
    for (const n of Object.values(nodes)) {
      const on = !id || n.comp.id === id || FLOWS.some(([a, b]) => (a === id && b === n.comp.id) || (b === id && a === n.comp.id));
      n.box.material.emissiveIntensity = n.comp.id === id ? 0.5 : on ? 0.12 : 0.03;
      n.edge.material.opacity = on ? 0.9 : 0.2;
      n.glow.material.opacity = n.comp.id === id ? 0.5 : on ? 0.2 : 0.05;
    }
    for (const f of flows) {
      const on = !id || f.a === id || f.b === id;
      f.mat.opacity = on ? (id ? 0.85 : f.optional ? 0.5 : 0.32) : 0.06;
      f.parts.forEach((p) => (p.visible = on));
    }
    labels.forEach((l) => { if (l.id) l.el.classList.toggle("sel", l.id === id); });
    engine.invalidate();
    onSelect(id ? COMPONENTS.find((c) => c.id === id) : null, id ? flows.filter((f) => f.a === id || f.b === id).map((f) => ({ from: f.a, to: f.b, label: f.label, optional: f.optional })) : []);
  }

  const onClick = (e) => {
    if (e.target !== engine.canvas || dragMoved) return;
    const hit = engine.pick(e.clientX, e.clientY, meshes);
    select(hit ? hit.userData.id : null);
  };
  let down = null, dragMoved = false;
  const onDown = (e) => { down = [e.clientX, e.clientY]; dragMoved = false; };
  const onMove = (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) dragMoved = true; };

  let tween = null;
  const v = new THREE.Vector3();
  return {
    scene, camera, labels, select, flows, nodes,
    enter() {
      controls.enabled = false;
      tween = tweenCamera(camera, target, target.clone(), home.look, home.pos, 2.6, engine.reduced, () => { controls.target.copy(target); controls.enabled = true; });
      engine.canvas.addEventListener("pointerdown", onDown);
      engine.canvas.addEventListener("pointermove", onMove);
      engine.canvas.addEventListener("click", onClick);
      engine.canvas.style.cursor = "grab";
    },
    exit() {
      controls.enabled = false;
      engine.canvas.removeEventListener("pointerdown", onDown);
      engine.canvas.removeEventListener("pointermove", onMove);
      engine.canvas.removeEventListener("click", onClick);
      engine.canvas.style.cursor = "";
      camera.position.set(22, 14, 26);
    },
    resetView() {
      controls.enabled = false;
      tween = tweenCamera(camera, target, controls.target.clone(), home.look, home.pos, 1.4, engine.reduced, () => { controls.target.copy(target); controls.enabled = true; });
      engine.invalidate();
    },
    update(dt, t, pointer, animate) {
      if (tween && !tween.done) tween.step(dt || 1);
      else controls.update();
      for (const f of flows) {
        f.parts.forEach((p) => {
          const k = animate ? (t * f.speed + p.userData.phase) % 1 : p.userData.phase + 0.15;
          f.cv.getPoint(k, v);
          p.position.copy(v);
        });
      }
      if (animate) for (const n of Object.values(nodes)) n.group.position.y = TIER_Y[n.comp.tier] + Math.sin(t * 0.8 + n.group.position.x) * 0.03;
      return tween && !tween.done;
    },
  };
}
