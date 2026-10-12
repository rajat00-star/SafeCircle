// Pitch backdrop: a "Scam DNA" double helix. Beads are evidence, solid cyan rungs are observed links,
// dashed violet rungs are inferred links, red beads are high-weight tactics. Five rings mark the engine's
// stage model. It is an illustration of the concept, not data, and the slides say so where it matters.
import * as THREE from "three";
import { COLORS, gridFloor, dust, glowSprite, line, makeLabel, tweenCamera } from "../engine.js";
import { STAGE_TITLES } from "../content.js";

const POSES = [
  // [camera position], [look-at]
  [[6.5, 1.8, 9.5], [1.2, 0.3, 0]],      // hook
  [[1.5, 3.2, 11.5], [1.5, 0, 0]],     // threat: stage rings
  [[5.2, 0.9, 6.4], [3.6, 0, 0]],      // journey
  [[3.4, 0.4, 4.4], [2.2, 0, 0]],      // scam dna close-up
  [[3, 7.5, 10.5], [2, 0, 0]],     // product
  [[13.5, 0.6, 1.2], [0, 0, 0]],       // decision: down the axis
  [[2.4, 12, 2], [2.4, 0, 0]],     // architecture: top view
  [[-2, 2.4, 13], [2.8, 0, 0]],    // validation
  [[6, -1.6, 8], [2, 0.6, 0]],   // trust
  [[7.5, 3.5, 13.5], [1.5, 0, 0]],     // finale
];

export function createAmbient(engine) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.045);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
  const target = new THREE.Vector3(...POSES[0][1]);
  camera.position.set(...POSES[0][0]);
  camera.lookAt(target);

  scene.add(gridFloor(80, 80, -3.2, COLORS.grid, 0.28));
  const motes = dust(engine.tier === "high" ? 1200 : 500, 28);
  scene.add(motes);
  scene.add(new THREE.AmbientLight(0x6688aa, 0.5));
  const key = new THREE.PointLight(COLORS.cyan, 40, 30); key.position.set(4, 4, 6); scene.add(key);
  const rim = new THREE.PointLight(COLORS.violet, 30, 30); rim.position.set(-6, -2, -4); scene.add(rim);

  const helix = new THREE.Group();
  helix.position.x = 7.2;
  helix.scale.setScalar(0.9);
  scene.add(helix);
  const N = 84, LEN = 16, R = 1.35, TURNS = 3.2;
  const bead = new THREE.SphereGeometry(0.055, 12, 12);
  const beadMat = new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: COLORS.cyan, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2 });
  const strands = [new THREE.InstancedMesh(bead, beadMat, N), new THREE.InstancedMesh(bead, beadMat, N)];
  const m = new THREE.Matrix4();
  const pts = [[], []];
  for (let s = 0; s < 2; s++) {
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const a = t * TURNS * Math.PI * 2 + s * Math.PI;
      const p = new THREE.Vector3(-LEN / 2 + t * LEN, Math.cos(a) * R, Math.sin(a) * R);
      pts[s].push(p);
      m.makeTranslation(p.x, p.y, p.z);
      strands[s].setMatrixAt(i, m);
    }
    helix.add(strands[s]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts[s]), 400, 0.012, 6, false),
      new THREE.MeshBasicMaterial({ color: s ? COLORS.violet : COLORS.cyan, transparent: true, opacity: 0.55 }));
    helix.add(tube);
  }
  // Rungs: every 3rd bead pair. Pattern of observed (solid) and inferred (dashed).
  const threatIdx = new Set([20, 38, 56, 71]);
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0xffd0d6, emissive: COLORS.threat, emissiveIntensity: 1.3, roughness: 0.4 });
  const threatNodes = [];
  for (let i = 2; i < N - 2; i += 3) {
    const inferred = i % 4 === 1;
    helix.add(line(pts[0][i], pts[1][i], { color: inferred ? COLORS.violet : COLORS.cyan, dashed: inferred, opacity: inferred ? 0.75 : 0.5 }));
    if (threatIdx.has(i)) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 20), nodeMat);
      n.position.copy(pts[0][i]);
      helix.add(n);
      const g = glowSprite(COLORS.threat, 1.2, 0.5);
      g.position.copy(pts[0][i]);
      helix.add(g);
      threatNodes.push(n, g);
    }
  }
  // Stage rings with labels.
  const labels = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
  Object.keys(STAGE_TITLES).forEach((k, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.55, 0.008, 6, 120), ringMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -LEN / 2 + (i + 0.6) * (LEN / 5.3);
    helix.add(ring);
    const anchor = new THREE.Object3D();
    anchor.position.set(ring.position.x, R + 0.95, 0);
    helix.add(anchor);
    labels.push({ el: makeLabel(STAGE_TITLES[k], "quiet", { sub: `stage 0${i + 1}` }), target: anchor, hidden: true, stage: true });
  });

  let tween = null;
  let current = 0;
  let ringTarget = 0.06;
  const base = { pos: camera.position.clone() };
  const obj = {
    scene, camera, labels,
    goTo(i) {
      current = Math.max(0, Math.min(POSES.length - 1, i));
      const [p, l] = POSES[current];
      tween = tweenCamera(camera, target, target.clone(), new THREE.Vector3(...l), new THREE.Vector3(...p), 2.2, engine.reduced, () => base.pos.copy(camera.position));
      labels.forEach((x) => { if (x.stage) x.hidden = current !== 1; });
      ringTarget = current === 1 ? 0.35 : 0.06;
      engine.invalidate();
    },
    update(dt, t, pointer, animate) {
      if (tween && !tween.done) tween.step(dt || 1);
      else if (animate) {
        // Subtle pointer parallax around the resting pose.
        camera.position.x += ((base.pos.x + pointer.x * 0.35) - camera.position.x) * 0.04;
        camera.position.y += ((base.pos.y + pointer.y * 0.2) - camera.position.y) * 0.04;
        camera.lookAt(target);
      }
      ringMat.opacity += (ringTarget - ringMat.opacity) * (animate ? Math.min(1, dt * 2) : 1);
      if (animate) {
        helix.rotation.x += dt * 0.12;
        motes.rotation.y += dt * 0.01;
        const pulse = 0.9 + Math.sin(t * 2.2) * 0.25;
        threatNodes.forEach((n) => n.isSprite ? (n.material.opacity = 0.35 * pulse) : n.scale.setScalar(pulse));
      }
      return tween && !tween.done;
    },
  };
  return obj;
}
