"use client";
import { useEffect, useRef, useState } from "react";
import type * as T from "three";
import { createStage, type Stage } from "@/lib/stage";

/*
  One reusable WebGL backdrop with a variant per page, so every page shares the same spatial
  language without a canvas per card. Decorative only (aria-hidden, pointer-events: none); any
  numbers it reflects come from real app state passed in by the page.
  - scanner:  a glass scanning slab in perspective; a light plane sweeps while analysing and the
              ambient light takes the result's colour.
  - history:  translucent plates receding in depth, one per saved check (up to 8).
  - contacts: you at the centre, five orbit slots; active contacts glow and are linked, pending
              invites are hollow, free slots are faint.
  - privacy:  three nested shells matching the data-flow cards: this browser, the server,
              opt-in storage.
*/

export type ScanState = "idle" | "scanning" | "low" | "medium" | "high" | "error";
type Props =
  | { variant: "scanner"; state: ScanState }
  | { variant: "history"; count: number }
  | { variant: "contacts"; active: number; pending: number }
  | { variant: "privacy" };

const STATE_COLOR: Record<ScanState, number> = { idle: 0x8f6bff, scanning: 0x8fe6ff, low: 0x5cebb0, medium: 0xffb84d, high: 0xff6161, error: 0xff6161 };

export default function SpatialBackdrop(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const stageRef = useRef<Stage | null>(null);
  const rebuildRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let frameFn: (t: number, dt: number) => void = () => {};
    (async () => {
      const stage = await createStage(el, { fov: 35, z: 7, onFrame: (t, dt) => frameFn(t, dt), onFail: () => setFailed(true) });
      if (!stage || disposed) { stage?.dispose(); return; }
      stageRef.current = stage;
      const { THREE, scene, camera, tier } = stage;
      const variant = live.current.variant;

      const glass = (tint = 0xffffff, op = 0.5) => new THREE.MeshPhysicalMaterial({
        color: tint, roughness: 0.12, metalness: 0, transparent: true, opacity: op, clearcoat: 1, clearcoatRoughness: 0.08,
        iridescence: 0.8, iridescenceIOR: 1.5, iridescenceThicknessRange: [150, 800], envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uCol: { value: new THREE.Color(0x8f6bff) }, uK: { value: 0.35 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "varying vec2 vUv; uniform vec3 uCol; uniform float uK; void main(){ float g = smoothstep(0.42, 0.0, length((vUv - 0.5) * vec2(1.0, 1.6))); gl_FragColor = vec4(uCol, g * g * uK); }",
      }));
      glow.position.z = -6;
      scene.add(glow);
      const glowMat = glow.material as T.ShaderMaterial;
      const col = new THREE.Color(0x8f6bff);

      if (variant === "scanner") {
        // Rounded glass slab lying back in perspective + engraved grid + sweeping light plane.
        const slabGroup = new THREE.Group();
        slabGroup.rotation.set(-1.05, 0, 0.0);
        slabGroup.position.set(0, -1.4, -1.5);
        scene.add(slabGroup);
        const W = 9, H = 5.4, R = 0.35, s = new THREE.Shape();
        s.moveTo(-W / 2 + R, -H / 2); s.lineTo(W / 2 - R, -H / 2); s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R); s.lineTo(W / 2, H / 2 - R);
        s.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2); s.lineTo(-W / 2 + R, H / 2); s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R);
        s.lineTo(-W / 2, -H / 2 + R); s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
        const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 }), glass(0xdcd6ff, 0.18));
        slabGroup.add(slab);
        const gridMat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: { uCol: { value: col }, uScan: { value: -1 }, uTime: { value: 0 } },
          vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uScan; uniform float uTime;
            void main(){ vec2 g = abs(fract(vUv * vec2(36.0, 22.0)) - 0.5); float line = smoothstep(0.47, 0.5, max(g.x, g.y));
              float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
              float band = uScan < 0.0 ? 0.0 : exp(-pow((vUv.y - uScan) * 18.0, 2.0));
              gl_FragColor = vec4(mix(uCol, vec3(1.0), band * 0.6), (line * 0.12 + band * (0.25 + line * 0.6)) * edge); }`,
        });
        const grid = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, H - 0.3), gridMat);
        grid.position.z = 0.18;
        slabGroup.add(grid);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.015, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        slabGroup.add(beam);
        const shards: T.Mesh[] = [];
        for (let i = 0; i < (tier === "high" ? 7 : 4); i++) {
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 + Math.random() * 0.18, 0), glass(0xffffff, 0.55));
          const side = i % 2 ? 1 : -1; m.position.set(side * (4.2 + Math.random() * 1.6), Math.random() * 3 - 0.6, -1.5 - Math.random() * 2.5);
          scene.add(m); shards.push(m);
        }
        let scan = -1;
        frameFn = (t, dt) => {
          const st = (live.current as { state: ScanState }).state;
          col.lerp(new THREE.Color(STATE_COLOR[st]), stage.reduced ? 1 : 0.06);
          glowMat.uniforms.uCol.value.copy(col);
          glowMat.uniforms.uK.value = st === "idle" ? 0.26 : st === "scanning" ? 0.4 : 0.2;
          if (st === "scanning" && !stage.reduced) { scan = scan < 0 ? 0 : (scan + dt * 0.9) % 1.15; } else scan = st === "scanning" ? 0.5 : -1;
          gridMat.uniforms.uScan.value = scan > 1 ? -1 : scan;
          beam.position.set(0, -H / 2 + Math.max(0, scan) * H, 0.25);
          (beam.material as T.MeshBasicMaterial).opacity = scan >= 0 && scan <= 1 ? 0.9 : 0;
          shards.forEach((m, i) => { m.rotation.set(t * 0.2 + i, t * 0.15 + i * 2, 0); m.position.y += Math.sin(t * 0.6 + i) * 0.0015; });
          slabGroup.rotation.z = Math.sin(t * 0.15) * 0.02;
        };
      }

      if (variant === "history") {
        const plates = new THREE.Group(); scene.add(plates);
        const geo = new THREE.BoxGeometry(2.6, 1.6, 0.04);
        const build = () => {
          plates.traverse((o) => { const m = o as T.Mesh; if (m !== (plates as unknown) && m.geometry && m.geometry !== geo) m.geometry.dispose(); const mt = m.material as T.Material | undefined; if (mt) mt.dispose(); });
          plates.clear();
          const n = Math.max(1, Math.min(8, (live.current as { count: number }).count || 0));
          for (let i = 0; i < n; i++) {
            const m = glass(i === 0 ? 0xe9e2ff : 0xbfb4ff, 0.32 - i * 0.025);
            const mesh = new THREE.Mesh(geo, m);
            mesh.position.set(1.1 + i * 0.32, -0.35 + i * 0.12, -i * 0.75);
            mesh.rotation.set(-0.12, -0.55, 0.04);
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xcfc4ff, transparent: true, opacity: 0.35 - i * 0.03 }));
            mesh.add(edges);
            plates.add(mesh);
          }
        };
        build();
        rebuildRef.current = () => { build(); stage.requestDraw(); };
        frameFn = (t) => { plates.children.forEach((p, i) => { p.position.y = -0.35 + i * 0.12 + Math.sin(t * 0.5 + i * 0.7) * 0.04; }); plates.rotation.y = Math.sin(t * 0.2) * 0.05; };
      }

      if (variant === "contacts") {
        const g = new THREE.Group(); g.position.set(2.0, 0.1, -0.5); g.rotation.x = 0.5; scene.add(g);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 48, 32), glass(0xffffff, 0.6));
        g.add(core);
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe9e2ff })));
        const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.004, 6, 200), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
        orbit.rotation.x = Math.PI / 2; g.add(orbit);
        const nodes = new THREE.Group(); g.add(nodes);
        const build = () => {
          nodes.traverse((o) => { const m = o as T.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as T.Material | undefined; if (mt) mt.dispose(); });
          nodes.clear();
          const { active, pending } = live.current as { active: number; pending: number };
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2, p = new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
            const kind = i < active ? "active" : i < active + pending ? "pending" : "free";
            const node = new THREE.Mesh(new THREE.SphereGeometry(kind === "free" ? 0.07 : 0.16, 24, 16),
              kind === "active" ? new THREE.MeshBasicMaterial({ color: 0x5cebb0 }) : kind === "pending" ? new THREE.MeshBasicMaterial({ color: 0xffb84d, wireframe: true }) : new THREE.MeshBasicMaterial({ color: 0x55536a }));
            node.position.copy(p); nodes.add(node);
            if (kind === "active") {
              const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), p]), new THREE.LineBasicMaterial({ color: 0x5cebb0, transparent: true, opacity: 0.55 }));
              nodes.add(line);
            }
          }
        };
        build();
        rebuildRef.current = () => { build(); stage.requestDraw(); };
        frameFn = (t) => { g.rotation.y = t * 0.12; core.rotation.y = t * 0.3; };
      }

      if (variant === "privacy") {
        const g = new THREE.Group(); g.position.set(2.1, 0.1, -0.6); scene.add(g);
        const layer = (r: number, c: number, op: number) => {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), glass(c, op));
          const w = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(r * 1.002, 1)), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.22 }));
          m.add(w); g.add(m); return m;
        };
        const outer = layer(1.55, 0xae95ff, 0.12), mid = layer(1.05, 0xffb84d, 0.14), inner = layer(0.55, 0x5cebb0, 0.3);
        frameFn = (t) => { outer.rotation.y = t * 0.06; mid.rotation.y = -t * 0.09; mid.rotation.x = t * 0.05; inner.rotation.y = t * 0.15; g.position.y = 0.1 + Math.sin(t * 0.5) * 0.05; };
      }

      camera.lookAt(0, 0, -1);
      stage.requestDraw();
    })().catch((e) => { console.error("Backdrop scene could not start:", e); setFailed(true); });
    return () => { disposed = true; stageRef.current?.dispose(); stageRef.current = null; };
  }, []);

  // Reflect state changes (scanner state, counts) without rebuilding the renderer.
  const key = JSON.stringify(props);
  useEffect(() => { rebuildRef.current?.(); stageRef.current?.requestDraw(); }, [key]);

  return <div ref={host} className={`spatial-backdrop sb-${props.variant}${failed ? " failed" : ""}`} aria-hidden="true" />;
}
