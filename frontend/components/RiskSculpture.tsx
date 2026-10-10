"use client";
import { useEffect, useRef } from "react";
import type * as T from "three";
import { createStage, type Stage } from "@/lib/stage";

// Layered severity sculpture for a result: three stacked glass tiers (low, caution, high) and a
// luminous core that rises to the score. Tiers light up to the result's level, so severity reads
// from height and count, not colour alone. Decorative: the score and level are also shown as text.
const COL = { low: 0x5cebb0, medium: 0xffb84d, high: 0xff6161 } as const;

export default function RiskSculpture({ score, level }: { score: number; level: "low" | "medium" | "high" }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stage: Stage | null = null, disposed = false;
    let frame: (t: number, dt: number) => void = () => {};
    (async () => {
      stage = await createStage(el, { fov: 30, z: 6.2, onFrame: (t, dt) => frame(t, dt), onFail: () => el.classList.add("failed") });
      if (!stage || disposed) { stage?.dispose(); return; }
      const { THREE, scene, camera } = stage;
      const g = new THREE.Group(); g.rotation.x = 0.42; scene.add(g);
      const lit = level === "high" ? 3 : level === "medium" ? 2 : 1;
      const tiers: T.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const on = i < lit;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1.05 - i * 0.18, 1.1 - i * 0.18, 0.22, 64, 1),
          new THREE.MeshPhysicalMaterial({ color: on ? COL[level] : 0xffffff, transparent: true, opacity: on ? 0.55 : 0.12, roughness: 0.1, clearcoat: 1,
            iridescence: 0.6, envMapIntensity: 1.5, emissive: on ? COL[level] : 0x000000, emissiveIntensity: on ? 0.35 : 0, depthWrite: false }));
        m.position.y = -0.7 + i * 0.6;
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), new THREE.LineBasicMaterial({ color: on ? COL[level] : 0x8a879e, transparent: true, opacity: on ? 0.9 : 0.35 }));
        m.add(edge); g.add(m); tiers.push(m);
      }
      const coreH = 0.1 + (score / 100) * 1.9;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(COL[level]).multiplyScalar(1.4), transparent: true, opacity: 0.85 }));
      core.geometry.translate(0, 0.5, 0);
      core.position.y = -0.85;
      g.add(core);
      const t0 = performance.now();
      frame = (t) => {
        const p = stage!.reduced ? 1 : Math.min(1, (performance.now() - t0) / 1200);
        const e = 1 - Math.pow(1 - p, 3);
        core.scale.y = Math.max(0.001, coreH * e);
        tiers.forEach((m, i) => { m.position.y = -0.7 + i * 0.6 * (0.6 + 0.4 * e); });
        g.rotation.y = t * 0.25;
      };
      camera.lookAt(0, 0, 0);
      stage.requestDraw();
    })().catch(() => el.classList.add("failed"));
    return () => { disposed = true; stage?.dispose(); };
  }, [score, level]);
  return <div ref={host} className="risk-sculpture" aria-hidden="true" />;
}
