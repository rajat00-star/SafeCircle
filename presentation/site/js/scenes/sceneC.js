// Scene C: navigable 3D scam intelligence network. Solid lines: indicator observed in that case's own evidence.
// Dashed lines: Campaign Radar similarity (inferred), shown only when no exact indicator links the pair.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { COLORS, gridFloor, dust, glowSprite, makeLabel, tweenCamera } from "../engine.js";
import { KIND_META, RISK_COLOR, visibility, neighbours } from "../graph.js";

export function createSceneC(engine, graph, { onSelect }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.011);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
  // Frame the whole graph: fit its bounding sphere, offset so it sits right of the scene title.
  const sphere = new THREE.Box3().setFromPoints(graph.nodes.map((n) => new THREE.Vector3(n.x, n.y, n.z))).getBoundingSphere(new THREE.Sphere());
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(42 / 2))) * 0.6;
  const look = sphere.center.clone().add(new THREE.Vector3(-sphere.radius * 0.32, -sphere.radius * 0.08, 0));
  const home = { pos: look.clone().add(new THREE.Vector3(0.12, 0.28, 1).normalize().multiplyScalar(dist)), look };
  camera.position.set(30, 22, 40);
  const target = home.look.clone();
  camera.lookAt(target);
  scene.add(new THREE.AmbientLight(0x8aa0c8, 0.8));
  const key = new THREE.PointLight(COLORS.cyan, 60, 60); key.position.set(6, 10, 10); scene.add(key);
  const rim = new THREE.PointLight(COLORS.violet, 50, 60); rim.position.set(-10, -4, -8); scene.add(rim);
  scene.add(gridFloor(90, 90, -7, COLORS.grid, 0.2));
  scene.add(dust(engine.tier === "high" ? 900 : 350, 34, 0x9fdcff, 0.03));

  const root = new THREE.Group();
  scene.add(root);
  const labels = [];
  const meshes = [];
  const obj = {};
  const caseGeo = new THREE.SphereGeometry(0.55, 32, 32);
  const indGeo = new THREE.OctahedronGeometry(0.42);
  for (const n of graph.nodes) {
    const color = new THREE.Color(n.type === "case" ? RISK_COLOR[n.risk_level] || "#e9f0fb" : KIND_META[n.kind].color);
    const m = new THREE.Mesh(n.type === "case" ? caseGeo : indGeo,
      new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), emissive: color, emissiveIntensity: n.type === "case" ? 0.9 : 0.6, roughness: 0.35, metalness: 0.3, transparent: true, opacity: 1 }));
    m.position.set(n.x, n.y, n.z);
    if (n.type === "indicator") m.scale.setScalar(1 + Math.min(3, n.case_count - 1) * 0.25);
    m.userData.id = n.id;
    root.add(m);
    meshes.push(m);
    const glow = glowSprite(color, n.type === "case" ? 1.5 : 1.1, 0.3);
    glow.position.copy(m.position);
    root.add(glow);
    const text = n.type === "case" ? n.label.replace(/^DEMO · /, "") : n.label;
    const el = makeLabel(text, n.type === "case" ? "case" : "", { sub: n.type === "case" ? `case · ${n.risk_level} ${n.risk_score}` : KIND_META[n.kind].label, onClick: () => select(n.id) });
    const lab = { el, target: m, offset: new THREE.Vector3(0, n.type === "case" ? 0.95 : 0.8, 0), id: n.id };
    labels.push(lab);
    obj[n.id] = { mesh: m, glow, lab, n };
  }
  const lines = graph.edges.map((e) => {
    const inferred = e.basis === "inferred";
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e.a.x, e.a.y, e.a.z), new THREE.Vector3(e.b.x, e.b.y, e.b.z)]);
    const mat = inferred
      ? new THREE.LineDashedMaterial({ color: COLORS.violet, dashSize: 0.28, gapSize: 0.2, transparent: true, opacity: 0.85 })
      : new THREE.LineBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.55 });
    const l = new THREE.Line(geo, mat);
    if (inferred) l.computeLineDistances();
    root.add(l);
    return { e, l, mat, base: inferred ? 0.85 : 0.55 };
  });

  const state = { filters: { domain: true, upi: true, phone: true, org: true, short_link: true, inferred: true }, sharedOnly: false, selected: null };
  let vis = visibility(graph, state.filters, state.sharedOnly);

  function refresh() {
    vis = visibility(graph, state.filters, state.sharedOnly);
    const sel = state.selected;
    const near = new Set(sel ? [sel, ...neighbours(graph, sel, vis).map((x) => x.other.id)] : []);
    for (const id in obj) {
      const o = obj[id];
      const on = vis.nodeOn.has(id);
      const lit = !sel || near.has(id);
      o.mesh.visible = on; o.glow.visible = on;
      o.mesh.material.opacity = lit ? 1 : 0.18;
      o.mesh.material.emissiveIntensity = id === sel ? 1.8 : lit ? (o.n.type === "case" ? 0.9 : 0.6) : 0.15;
      o.glow.material.opacity = id === sel ? 0.75 : lit ? 0.3 : 0.04;
      // Keep the scene readable: indicator labels only for shared indicators or around the selection.
      o.lab.hidden = !on || (o.n.type === "indicator" && o.n.case_count < 2 && !(sel && near.has(id)));
      o.lab.el.classList.toggle("dim", !lit);
      o.lab.el.classList.toggle("sel", id === sel);
    }
    for (const L of lines) {
      const on = vis.edgeOn.has(L.e.i);
      L.l.visible = on;
      const touches = sel && (L.e.a.id === sel || L.e.b.id === sel);
      L.mat.opacity = !sel ? L.base : touches ? 1 : 0.05;
    }
    engine.invalidate();
  }

  function select(id) {
    if (id && !vis.nodeOn.has(id)) id = null;
    state.selected = id;
    refresh();
    onSelect(id ? graph.byId[id] : null, id ? neighbours(graph, id, vis) : []);
  }

  const controls = new OrbitControls(camera, engine.canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 4; controls.maxDistance = dist * 1.8;
  controls.enabled = false; controls.autoRotateSpeed = 0.35;
  controls.addEventListener("change", () => engine.invalidate());

  let down = null, dragMoved = false;
  const onDown = (e) => { down = [e.clientX, e.clientY]; dragMoved = false; controls.autoRotate = false; };
  const onMove = (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) dragMoved = true; };
  const onClick = (e) => {
    if (e.target !== engine.canvas || dragMoved) return;
    const hit = engine.pick(e.clientX, e.clientY, meshes.filter((m) => m.visible));
    select(hit ? hit.userData.id : null);
  };

  let tween = null;
  refresh();
  return {
    scene, camera, labels, state, select,
    setFilter(k, v) { state.filters[k] = v; if (state.selected && !visibility(graph, state.filters, state.sharedOnly).nodeOn.has(state.selected)) select(null); else { refresh(); state.selected && onSelect(graph.byId[state.selected], neighbours(graph, state.selected, vis)); } },
    setShared(v) { state.sharedOnly = v; this.setFilter("domain", state.filters.domain); },
    resetView() { select(null); controls.enabled = false; tween = tweenCamera(camera, target, controls.target.clone(), home.look, home.pos, 1.4, engine.reduced, () => { controls.target.copy(target); controls.enabled = true; }); engine.invalidate(); },
    enter() {
      controls.autoRotate = !engine.reduced;
      tween = tweenCamera(camera, target, target.clone(), home.look, home.pos, 2.8, engine.reduced, () => { controls.target.copy(target); controls.enabled = true; });
      engine.canvas.addEventListener("pointerdown", onDown); engine.canvas.addEventListener("pointermove", onMove); engine.canvas.addEventListener("click", onClick);
      engine.canvas.style.cursor = "grab";
    },
    exit() {
      controls.enabled = false;
      engine.canvas.removeEventListener("pointerdown", onDown); engine.canvas.removeEventListener("pointermove", onMove); engine.canvas.removeEventListener("click", onClick);
      engine.canvas.style.cursor = ""; camera.position.set(30, 22, 40);
    },
    update(dt, t, pointer, animate) {
      if (tween && !tween.done) { tween.step(dt || 1); return true; }
      controls.autoRotate = controls.autoRotate && animate && !state.selected;
      controls.update();
      if (animate) for (const id in obj) { const o = obj[id]; if (o.n.type === "indicator") o.mesh.rotation.y += dt * 0.6; }
      return false;
    },
  };
}
