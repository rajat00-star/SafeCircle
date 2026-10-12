// Scene B: the scam detection pipeline. Evidence packets travel through the real stages of the case engine.
// Playback frames are real API output (presentation/site/data/*.json): scores, tactics, stages, review state
// and alert decisions are exactly what the engine returned on a throwaway database.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { COLORS, gridFloor, dust, glowSprite, makeLabel, tweenCamera } from "../engine.js";
import { STAGE_TITLES } from "../content.js";

export const STATIONS = [
  { id: "in", x: -7.0, name: "Evidence in", short: "Evidence in",
    purpose: "The user adds a message or call note, a screenshot, a link or a UPI ID / payment QR to a case. Nothing is collected automatically.",
    inputs: ["Message or conversation text", "Screenshot (PNG, JPEG, WebP)", "Link (never opened)", "UPI ID or payment QR (QR decoded in the browser, image not uploaded)"],
    outputs: ["POST /api/v1/cases/{id}/events, /forensics/*, /upi/check"], status: [["ok", "Implemented"]], files: ["backend/app/routers/cases.py", "backend/app/routers/forensics.py", "backend/app/routers/upi.py"] },
  { id: "read", x: -4.3, name: "Read and redact", short: "Read · redact",
    purpose: "Screenshots are read with local Tesseract OCR under a timeout and discarded; EXIF is stripped by re-encoding. Codes, phone numbers, e-mails and card numbers are removed from stored excerpts; phones and UPI IDs are compared as keyed hashes.",
    inputs: ["Raw text or image"], outputs: ["Redacted excerpt, data-quality note, OCR confidence"],
    status: [["ok", "Implemented"], ["partial", "OCR needs Tesseract installed; English only"]], files: ["backend/app/scamdna/ocr.py", "backend/app/scamdna/evidence.py"] },
  { id: "extract", x: -1.4, name: "Indicators and tactics", short: "Indicators · tactics",
    purpose: "Rules match tactics and keep the exact words that matched. Links get static analysis (brand in host, no https, look-alike paths) and a hostname model. Domains, UPI handles, phones and claimed organisations become indicators.",
    inputs: ["Redacted event"], outputs: ["Tactics with stage, weight and evidence text; indicators; model similarity (reported, never scored)"],
    status: [["ok", "Implemented"]], files: ["backend/app/scamdna/tactics.py", "backend/app/detector/url_analyzer.py"] },
  { id: "assess", x: 1.5, name: "Reassess the case", short: "Reassess case",
    purpose: "Every new item re-scores the whole case: the strongest weight per tactic, noisy-OR fusion, combination bonuses and a multi-stage bonus. A single uncorroborated tactic is held at 59 (medium) and sent for review.",
    inputs: ["All redacted events of the case"], outputs: ["Heuristic 0–100 score, level (medium ≥ 30, high ≥ 60), inferred stage progression, what changed"],
    status: [["ok", "Implemented"], ["partial", "Score is a heuristic indicator, not a calibrated probability"]], files: ["backend/app/scamdna/assessment.py"] },
  { id: "doubt", x: 4.4, name: "Doubt and review", short: "Doubt · review",
    purpose: "Conflicting evidence (for example a retraction after a risky request), missing evidence, near-threshold scores and single-tactic cases raise uncertainty. Conflicts and high uncertainty require human review. Scores never go down because of a reassuring follow-up.",
    inputs: ["Assessment"], outputs: ["Uncertainty level and reasons, conflicts, missing evidence, review_required"],
    status: [["ok", "Implemented"], ["partial", "Retraction detection is English phrase-based"]], files: ["backend/app/scamdna/assessment.py"] },
  { id: "alert", x: 7.2, name: "Alert decision", short: "Alert decision",
    purpose: "Notify only when something material changed: first medium/high (new), a higher level (escalated) or a new high-weight tactic (updated). Repeats and minor additions are suppressed. Every decision, including suppressions, is written to the case log.",
    inputs: ["Assessment fingerprint and the last notifying alert"], outputs: ["new · escalated · updated · suppressed · deescalated"],
    status: [["ok", "Implemented"]], files: ["backend/app/scamdna/alerts.py"] },
];
const SOURCES = [["message", "Message · call note", 1.95], ["screenshot", "Screenshot", 0.65], ["link", "Link", -0.65], ["upi", "UPI ID · QR", -1.95]];
const GATES = ["new", "escalated", "updated", "suppressed"];
const LEVEL_COLOR = { low: COLORS.low, medium: COLORS.medium, high: COLORS.high };

export function createSceneB(engine, { onSelect, onFrame }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.03);
  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
  const home = { pos: new THREE.Vector3(1.5, 9.0, 23.5), look: new THREE.Vector3(3.4, -0.9, 0.5) };
  camera.position.set(-20, 10, 22);
  const target = home.look.clone();
  camera.lookAt(target);
  scene.add(new THREE.AmbientLight(0x8098c0, 0.7));
  const key = new THREE.DirectionalLight(0xdff6ff, 1.0); key.position.set(4, 10, 8); scene.add(key);
  scene.add(gridFloor(70, 70, -2.6, COLORS.grid, 0.25));
  scene.add(dust(engine.tier === "high" ? 600 : 250, 26, 0x9fdcff, 0.03));

  // Track.
  const track = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 16.5, 8), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.45 }));
  track.rotation.z = Math.PI / 2; track.position.x = 1.2; scene.add(track);

  const labels = [];
  const rings = {};
  const pickables = [];
  STATIONS.forEach((s) => {
    const g = new THREE.Group();
    g.position.x = s.x;
    if (s.id !== "in") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.045, 12, 96),
        new THREE.MeshStandardMaterial({ color: 0x9feaff, emissive: COLORS.cyan, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.6 }));
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 64), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
      disc.rotation.y = Math.PI / 2; disc.userData.id = s.id;
      g.add(disc);
      pickables.push(disc);
      rings[s.id] = { ring, disc };
    }
    scene.add(g);
    const anchor = new THREE.Object3D(); anchor.position.set(0, s.id === "in" ? 2.9 : 1.85, 0); g.add(anchor);
    labels.push({ el: makeLabel(s.short, "", { onClick: () => selectStation(s.id) }), target: anchor, id: s.id });
  });

  // Input pads.
  const pads = {};
  SOURCES.forEach(([k, name, z]) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 6),
      new THREE.MeshStandardMaterial({ color: 0x10223f, emissive: COLORS.cyan, emissiveIntensity: 0.15, roughness: 0.4, metalness: 0.4 }));
    pad.position.set(-7.0, -0.2, z * 0.85);
    pad.userData.id = "in";
    scene.add(pad);
    pickables.push(pad);
    pads[k] = pad;
    const a = new THREE.Object3D(); a.position.set(-8.6, -0.15, z * 0.85); scene.add(a);
    labels.push({ el: makeLabel(name, "quiet"), target: a });
  });

  // Score column with threshold rings, and the inferred stage arc around it (dashed = inferred).
  const ASSESS_X = STATIONS.find((s) => s.id === "assess").x;
  const colH = 4.2, colBase = -2.4;
  const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: COLORS.medium, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 24), colMat);
  column.position.set(ASSESS_X, colBase, 2.7);
  scene.add(column);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, colH, 24, 1, true), new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  shell.position.set(ASSESS_X, colBase + colH / 2, 2.7); scene.add(shell);
  [[30, "medium ≥ 30"], [60, "high ≥ 60"]].forEach(([v, txt]) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 6, 48), new THREE.MeshBasicMaterial({ color: v === 60 ? COLORS.high : COLORS.medium }));
    r.rotation.x = Math.PI / 2; r.position.set(ASSESS_X, colBase + (v / 100) * colH, 2.7); scene.add(r);
    const a = new THREE.Object3D(); a.position.set(ASSESS_X + 1.25, colBase + (v / 100) * colH, 2.7); scene.add(a);
    labels.push({ el: makeLabel(txt, "quiet"), target: a });
  });
  const scoreAnchor = new THREE.Object3D(); scene.add(scoreAnchor);
  const scoreLabel = { el: makeLabel("—", ""), target: scoreAnchor };
  labels.push(scoreLabel);
  const stageArcs = Object.keys(STAGE_TITLES).map((k, i) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.03, 6, 32, (Math.PI * 2) / 5 - 0.18),
      new THREE.MeshBasicMaterial({ color: COLORS.violet, transparent: true, opacity: 0.12 }));
    arc.rotation.x = Math.PI / 2; arc.rotation.z = (i * Math.PI * 2) / 5;
    arc.position.set(ASSESS_X, colBase + 0.05, 2.7);
    scene.add(arc);
    return { k, arc };
  });

  // Alert gates.
  const ALERT_X = STATIONS.find((s) => s.id === "alert").x;
  const gates = {};
  GATES.forEach((g, i) => {
    const notify = g !== "suppressed";
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x202838, emissive: notify ? COLORS.threat : 0x8899aa, emissiveIntensity: 0.05, transparent: true, opacity: 0.9 }));
    m.position.set(ALERT_X + 1.9, 1.3 - i * 0.75, 0);
    scene.add(m);
    gates[g] = m;
    const a = new THREE.Object3D(); a.position.set(ALERT_X + 3.05, 1.3 - i * 0.75, 0); scene.add(a);
    labels.push({ el: makeLabel(g, "quiet", { sub: notify ? "notifies" : "logged only" }), target: a });
  });

  // Packet.
  const packet = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: COLORS.cyan, emissiveIntensity: 1.4 }));
  packet.add(core);
  const halo = glowSprite(COLORS.cyan, 1.4, 0.7); packet.add(halo);
  packet.visible = false;
  scene.add(packet);

  const controls = new OrbitControls(camera, engine.canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 8; controls.maxDistance = 34;
  controls.maxPolarAngle = Math.PI * 0.6; controls.enabled = false;
  controls.addEventListener("change", () => engine.invalidate());

  // ---- Playback state ----
  let scenario = null, frames = [], idx = -1, anim = null, playing = false, timer = null;
  let colTarget = 0, colNow = 0, colColor = new THREE.Color(COLORS.medium);

  function applyFrame(f, instant) {
    const c = f.case;
    colTarget = c.risk_score;
    colColor = new THREE.Color(LEVEL_COLOR[c.risk_level] || COLORS.medium);
    if (instant) colNow = colTarget;
    stageArcs.forEach(({ k, arc }) => { const on = c.stages_observed.includes(k); arc.material.opacity = on ? 0.9 : 0.12; });
    const review = c.review_required;
    const conflict = c.conflicts.length > 0;
    rings.doubt.ring.material.emissive.set(conflict ? COLORS.violet : review ? COLORS.medium : COLORS.cyan);
    rings.doubt.ring.material.emissiveIntensity = review || conflict ? 1.3 : 0.5;
    GATES.forEach((g) => { gates[g].material.emissiveIntensity = f.alert.action === g ? 1.6 : 0.05; });
    scoreLabel.el.firstChild.textContent = `${c.risk_score} · ${c.risk_level}`;
    engine.invalidate();
  }

  function resetVisuals() {
    colTarget = 0; colNow = 0;
    stageArcs.forEach(({ arc }) => (arc.material.opacity = 0.12));
    GATES.forEach((g) => (gates[g].material.emissiveIntensity = 0.05));
    rings.doubt.ring.material.emissive.set(COLORS.cyan); rings.doubt.ring.material.emissiveIntensity = 0.5;
    scoreLabel.el.firstChild.textContent = "—";
    packet.visible = false;
  }

  function go(i) {
    if (!frames.length) return;
    idx = Math.max(-1, Math.min(frames.length - 1, i));
    if (idx < 0) { resetVisuals(); onFrame(scenario, frames, idx); engine.invalidate(); return; }
    const f = frames[idx];
    const pad = pads[f.input.source] || pads.message;
    if (engine.reduced) { applyFrame(f, true); onFrame(scenario, frames, idx); return; }
    // Animate a packet from its pad through each station; the case updates as it passes "Reassess".
    const pts = [pad.position.clone().setY(0.25), new THREE.Vector3(-6.2, 0, 0), ...STATIONS.slice(1).map((s) => new THREE.Vector3(s.x, 0, 0)), new THREE.Vector3(ALERT_X + 1.6, 1.3 - GATES.indexOf(f.alert.action) * 0.75, 0)];
    if (GATES.indexOf(f.alert.action) < 0) pts.pop();
    const path = new THREE.CatmullRomCurve3(pts);
    anim = { path, t: 0, dur: 3.4, applied: false, f };
    packet.visible = true;
    onFrame(scenario, frames, idx, true);
    engine.invalidate();
  }

  function stopPlay() { playing = false; clearTimeout(timer); }
  function play() {
    if (!frames.length) return;
    playing = true;
    const next = () => {
      if (!playing) return;
      if (idx >= frames.length - 1) { playing = false; onFrame(scenario, frames, idx); return; }
      go(idx + 1);
      timer = setTimeout(next, engine.reduced ? 1600 : 4200);
    };
    if (idx >= frames.length - 1) { idx = -1; resetVisuals(); }
    next();
  }

  function selectStation(id) {
    STATIONS.forEach((s) => { if (rings[s.id]) rings[s.id].disc.material.opacity = s.id === id ? 0.16 : 0.05; });
    labels.forEach((l) => l.id && l.el.classList.toggle("sel", l.id === id));
    engine.invalidate();
    onSelect(id ? STATIONS.find((s) => s.id === id) : null);
  }

  let down = null, dragMoved = false;
  const onDown = (e) => { down = [e.clientX, e.clientY]; dragMoved = false; };
  const onMove = (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) dragMoved = true; };
  const onClick = (e) => { if (e.target !== engine.canvas || dragMoved) return; const hit = engine.pick(e.clientX, e.clientY, pickables); selectStation(hit ? hit.userData.id : null); };

  let tween = null;
  return {
    scene, camera, labels,
    load(key, data) { stopPlay(); scenario = key; frames = data; idx = -1; resetVisuals(); onFrame(scenario, frames, idx); engine.invalidate(); },
    play, pause: stopPlay, idx: () => idx, step: (d) => { stopPlay(); go(idx + d); }, reset: () => { stopPlay(); go(-1); }, isPlaying: () => playing,
    selectStation,
    resetView() { controls.enabled = false; tween = tweenCamera(camera, target, controls.target.clone(), home.look, home.pos, 1.4, engine.reduced, () => { controls.target.copy(target); controls.enabled = true; }); engine.invalidate(); },
    enter() {
      tween = tweenCamera(camera, target, target.clone(), home.look, home.pos, 2.6, engine.reduced, () => { controls.target.copy(target); controls.enabled = true; });
      engine.canvas.addEventListener("pointerdown", onDown); engine.canvas.addEventListener("pointermove", onMove); engine.canvas.addEventListener("click", onClick);
      engine.canvas.style.cursor = "grab";
    },
    exit() {
      stopPlay(); controls.enabled = false;
      engine.canvas.removeEventListener("pointerdown", onDown); engine.canvas.removeEventListener("pointermove", onMove); engine.canvas.removeEventListener("click", onClick);
      engine.canvas.style.cursor = ""; camera.position.set(-20, 10, 22);
    },
    update(dt, t, pointer, animate) {
      let moving = false;
      if (tween && !tween.done) { tween.step(dt || 1); moving = true; } else controls.update();
      if (anim) {
        anim.t = Math.min(1, anim.t + (dt || 1) / anim.dur);
        anim.path.getPoint(anim.t, packet.position);
        core.rotation.y += dt * 3;
        const assessT = 0.62;
        if (!anim.applied && anim.t >= assessT) { anim.applied = true; applyFrame(anim.f, false); }
        if (anim.t >= 1) { packet.visible = false; anim = null; onFrame(scenario, frames, idx); }
        moving = true;
      }
      colNow += (colTarget - colNow) * Math.min(1, (dt || 1) * 3);
      const h = Math.max(0.02, (colNow / 100) * colH);
      column.scale.y = h; column.position.y = colBase + h / 2;
      colMat.emissive.lerp(colColor, 0.1);
      scoreAnchor.position.set(ASSESS_X, colBase + h + 0.45, 2.7);
      if (animate) Object.values(rings).forEach(({ ring }, i) => (ring.rotation.x = Math.sin(t * 0.6 + i) * 0.08));
      return moving || Math.abs(colTarget - colNow) > 0.3;
    },
  };
}
