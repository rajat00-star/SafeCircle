"use client";
import { useEffect, useRef } from "react";
import type * as T from "three";
import { pickTier, prefersReducedMotion } from "@/lib/gfx";
import { total, type Hotspot, type Link, type Range, type Tactic } from "@/lib/threatData";

/*
  The 3D threat globe (three.js, custom shaders, lazy-loaded).
  - Dark graphite planet lit by a fixed "sun": day side faintly violet, night side near-black with
    restrained city lights. Fresnel rim + back-side atmosphere shell.
  - Land is a field of dots computed offline from Natural Earth (public domain), plus coastlines and
    country borders as hairlines. Data files live in /public/globe (no third-party requests).
  - Hotspots: instanced spikes and pulsing rings; solid = confirmed, hollow = unverified. Height and
    colour tier follow report counts. Arcs animate a travelling highlight.
  - Raycasting against instanced hit proxies for hover / click; the globe turns to face a selection.
  - Pauses when off-screen or hidden; reduced motion renders on demand only; tiers drop bloom etc.
*/

export type GlobeProps = {
  hotspots: Hotspot[];
  links: Link[];
  range: Range;
  tactic: Tactic | "all";
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null, x: number, y: number) => void;
  onReady?: () => void;
  onFail?: () => void;
};

const toVec = (THREE: typeof import("three"), lat: number, lon: number, r = 1) => {
  const phi = ((90 - lat) * Math.PI) / 180, th = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
};

export default function GlobeScene(props: GlobeProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  live.current = props;
  const api = useRef<{ update: () => void; select: (id: string | null) => void } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const tier = pickTier();
    if (tier === "fallback") { live.current.onFail?.(); return; }
    const reduced = prefersReducedMotion();
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const { EffectComposer } = await import("three/examples/jsm/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/examples/jsm/postprocessing/RenderPass.js");
      const { UnrealBloomPass } = await import("three/examples/jsm/postprocessing/UnrealBloomPass.js");
      const { OutputPass } = await import("three/examples/jsm/postprocessing/OutputPass.js");
      const [landBuf, coastBuf, borderBuf] = await Promise.all(
        ["land", "coast", "borders"].map((n) => fetch(`/globe/${n}.bin`).then((r) => { if (!r.ok) throw new Error(n); return r.arrayBuffer(); })));
      if (disposed) return;

      let renderer: T.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      } catch { live.current.onFail?.(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === "high" ? 2 : 1.25));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.touchAction = "pan-y";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      camera.position.set(0, 0, 6.2);
      const sun = new THREE.Vector3(-1.0, 0.4, 0.2).normalize();

      // Pivot (scroll / composition) > tilt > globe (rotates). Markers live inside the globe group.
      const pivot = new THREE.Group(); scene.add(pivot);
      const tilt = new THREE.Group(); tilt.rotation.z = 0.18; pivot.add(tilt);
      const globe = new THREE.Group(); tilt.add(globe);

      // City-light anchors (real coordinates of large cities; purely visual).
      const lightCities = [[19.08, 72.88], [28.61, 77.21], [35.68, 139.69], [40.71, -74.0], [51.51, -0.13], [-23.55, -46.63], [31.23, 121.47], [30.04, 31.24],
        [6.52, 3.38], [34.05, -118.24], [55.76, 37.62], [-33.87, 151.21], [1.35, 103.82], [25.2, 55.27], [19.43, -99.13], [41.01, 28.98]]
        .map(([a, b]) => toVec(THREE, a, b));

      // --- Planet body
      const bodyMat = new THREE.ShaderMaterial({
        uniforms: { uSun: { value: sun } },
        vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `
          uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            float d = dot(vN, uSun);
            float day = smoothstep(-0.25, 0.6, d);
            vec3 night = vec3(0.006, 0.006, 0.012);
            vec3 dayc = vec3(0.04, 0.036, 0.07);
            vec3 col = mix(night, dayc, day);
            float fres = pow(1.0 - max(dot(vN, V), 0.0), 3.0);
            col += vec3(0.42, 0.36, 0.95) * pow(fres, 2.2) * (0.15 + 0.85 * day) * 0.5;
            col += vec3(0.55, 0.85, 1.0) * pow(max(dot(reflect(-uSun, vN), V), 0.0), 60.0) * 0.04;
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, tier === "high" ? 96 : 48, tier === "high" ? 64 : 32), bodyMat));

      // --- Land dots with day/night shading and city lights
      const land = new Int16Array(landBuf);
      const lp = new Float32Array((land.length / 2) * 3);
      for (let i = 0; i < land.length / 2; i++) {
        const v = toVec(THREE, land[i * 2] / 100, land[i * 2 + 1] / 100, 1.003);
        lp.set([v.x, v.y, v.z], i * 3);
      }
      const landGeo = new THREE.BufferGeometry();
      landGeo.setAttribute("position", new THREE.BufferAttribute(lp, 3));
      const landMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uSun: { value: sun }, uPx: { value: renderer.getPixelRatio() }, uCities: { value: lightCities }, uReveal: { value: reduced ? 1 : 0 } },
        vertexShader: `
          uniform vec3 uSun; uniform float uPx; uniform vec3 uCities[16]; uniform float uReveal;
          varying float vDay; varying float vCity; varying float vFacing; varying float vA;
          void main(){
            vec3 n = normalize(position);
            vec3 nw = normalize(mat3(modelMatrix) * n);
            vDay = smoothstep(-0.2, 0.5, dot(nw, uSun));
            float c = 0.0;
            for (int i = 0; i < 16; i++) { float dd = distance(n, normalize(uCities[i])); c += exp(-dd * dd * 900.0); }
            vCity = clamp(c, 0.0, 1.0);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vFacing = clamp(dot(normalize(mat3(viewMatrix) * nw), normalize(-mv.xyz)) * 2.0, 0.0, 1.0);
            float lat = n.y;
            vA = smoothstep(lat - 0.2, lat + 0.2, uReveal * 2.4 - 1.2);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = (2.0 + vCity * 1.5) * uPx * (6.2 / -mv.z);
          }`,
        fragmentShader: `
          varying float vDay; varying float vCity; varying float vFacing; varying float vA;
          void main(){
            float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
            vec3 dayCol = vec3(0.62, 0.6, 0.78);
            vec3 nightCol = vec3(0.09, 0.085, 0.15);
            vec3 col = mix(nightCol, dayCol, vDay);
            col += vec3(1.0, 0.78, 0.45) * vCity * (1.0 - vDay) * 1.6;
            float a = smoothstep(0.5, 0.2, d) * (0.35 + 0.65 * vFacing) * vA;
            gl_FragColor = vec4(col, a * (0.3 + 0.6 * vDay + vCity * (1.0 - vDay)));
          }`,
      });
      globe.add(new THREE.Points(landGeo, landMat));

      // --- Coastlines and borders (hairlines). Skip segments along the antimeridian cut.
      const linesFrom = (buf: ArrayBuffer, r: number) => {
        const a = new Int16Array(buf), pos: number[] = [];
        for (let i = 0; i < a.length;) {
          const n = a[i++];
          for (let k = 0; k < n - 1; k++) {
            const la1 = a[i + k * 2] / 100, lo1 = a[i + k * 2 + 1] / 100, la2 = a[i + k * 2 + 2] / 100, lo2 = a[i + k * 2 + 3] / 100;
            if (Math.abs(lo1) > 179.5 && Math.abs(lo2) > 179.5) continue;
            const p = toVec(THREE, la1, lo1, r), q = toVec(THREE, la2, lo2, r);
            pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
          }
          i += n * 2;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        return g;
      };
      const coast = new THREE.LineSegments(linesFrom(coastBuf, 1.004), new THREE.LineBasicMaterial({ color: 0xb9a8ff, transparent: true, opacity: 0.32, depthWrite: false }));
      const borders = new THREE.LineSegments(linesFrom(borderBuf, 1.004), new THREE.LineBasicMaterial({ color: 0x8fb9d8, transparent: true, opacity: 0.14, depthWrite: false }));
      globe.add(coast, borders);

      // --- Atmosphere shell
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), new THREE.ShaderMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uSun: { value: sun } },
        vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `
          uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            float rim = pow(clamp(1.0 + dot(vN, V), 0.0, 1.0), 6.0);
            float lit = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(-vN, uSun));
            vec3 col = mix(vec3(0.45, 0.32, 1.0), vec3(0.55, 0.85, 1.0), smoothstep(0.0, 1.0, lit));
            gl_FragColor = vec4(col, rim * 1.1 * lit);
          }`,
      }));
      tilt.add(atmo);

      // --- Scanning arc: a partial ring of light that sweeps around the planet
      const scanMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform float uTime;
          void main(){ float t = fract(vUv.x - uTime * 0.04); float a = smoothstep(0.0, 0.25, t) * smoothstep(0.42, 0.25, t); gl_FragColor = vec4(vec3(0.8, 0.9, 1.0), a * 0.55); }`,
      });
      const scan = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.0025, 6, 360), scanMat);
      scan.rotation.set(0.95, 0.55, 0.3);
      tilt.add(scan);
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.0012, 4, 360), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 }));
      orbit.rotation.set(1.42, -0.2, 0);
      orbit.visible = false;
      tilt.add(orbit);

      // --- Background stars (sparse)
      const SN = tier === "high" ? 900 : 350, sp = new Float32Array(SN * 3);
      for (let i = 0; i < SN; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(14 + Math.random() * 20);
        sp.set([v.x, v.y, v.z - 6], i * 3);
      }
      const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xc9c4e8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
      scene.add(stars);

      // --- Hotspots: spikes, rings, hit proxies (instanced), arcs
      const markers = new THREE.Group(); globe.add(markers);
      const MAX = 64;
      const spikeGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 6); spikeGeo.translate(0, 0.5, 0);
      const spikes = new THREE.InstancedMesh(spikeGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }), MAX);
      const ringGeo = new THREE.RingGeometry(0.75, 1, 48);
      const ringMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAnim: { value: reduced ? 0 : 1 } },
        vertexShader: `
          attribute float aPhase; attribute float aSolid; attribute vec3 aColor; attribute float aSel;
          varying float vPhase; varying float vSolid; varying vec3 vColor; varying vec2 vUv; varying float vSel;
          void main(){ vPhase = aPhase; vSolid = aSolid; vColor = aColor; vUv = uv; vSel = aSel;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uAnim; varying float vPhase; varying float vSolid; varying vec3 vColor; varying vec2 vUv; varying float vSel;
          void main(){
            float ang = atan(vUv.y - 0.5, vUv.x - 0.5);
            float dash = mix(step(0.0, sin(ang * 14.0)), 1.0, vSolid);
            float p = fract(uTime * 0.45 + vPhase) * uAnim;
            float a = dash * (0.9 - p * 0.8) * (0.7 + vSel * 0.6);
            gl_FragColor = vec4(vColor * (1.0 + vSel), a);
          }`,
      });
      const rings = new THREE.InstancedMesh(ringGeo, ringMat, MAX);
      const aPhase = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
      const aSolid = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
      const aColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      const aSel = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
      ringGeo.setAttribute("aPhase", aPhase); ringGeo.setAttribute("aSolid", aSolid); ringGeo.setAttribute("aColor", aColor); ringGeo.setAttribute("aSel", aSel);
      const cores = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }), MAX);
      const hits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), MAX);
      markers.add(spikes, rings, cores, hits);
      [spikes, rings, cores, hits].forEach((m) => { m.count = 0; m.frustumCulled = false; });

      let arcs: T.LineSegments | null = null;
      const arcMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uAnim: { value: reduced ? 0 : 1 } },
        vertexShader: `attribute float aT; attribute float aOff; varying float vT; varying float vOff; void main(){ vT = aT; vOff = aOff; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform float uAnim; varying float vT; varying float vOff;
          void main(){ float head = fract(uTime * 0.18 + vOff); float d = head - vT; float trail = uAnim > 0.5 ? smoothstep(0.25, 0.0, d) * step(0.0, d) : 0.0;
            gl_FragColor = vec4(mix(vec3(0.62, 0.55, 1.0), vec3(0.75, 0.95, 1.0), trail), 0.12 + trail * 0.75); }`,
      });

      const tierColor = (c: number, max: number) => {
        const f = max > 0 ? c / max : 0;
        return f > 0.6 ? new THREE.Color(0xff6161) : f > 0.25 ? new THREE.Color(0xffb84d) : new THREE.Color(0xa6dcff);
      };
      const shown: Hotspot[] = [];
      let revealT0 = performance.now();
      const dummy = new THREE.Object3D();
      const up = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);

      const layoutMarkers = (grow: number) => {
        const { range, tactic, selectedId } = live.current;
        const max = Math.max(1, ...shown.map((h) => total(h, range, tactic)));
        shown.forEach((h, i) => {
          const c = total(h, range, tactic);
          const n = toVec(THREE, h.lat, h.lon).normalize();
          const local = Math.min(1, Math.max(0, (grow - i * 0.035) / 0.4)); // staggered emergence
          const ease = 1 - Math.pow(1 - local, 3);
          const height = (0.05 + 0.32 * Math.sqrt(c / max)) * ease;
          const base = n.clone().multiplyScalar(1.004);
          dummy.position.copy(base); dummy.quaternion.setFromUnitVectors(up, n); dummy.scale.set(1, Math.max(0.0001, height), 1); dummy.updateMatrix();
          spikes.setMatrixAt(i, dummy.matrix);
          const col = tierColor(c, max);
          spikes.setColorAt(i, col);
          const sel = h.id === selectedId ? 1 : 0;
          const rs = (0.03 + 0.05 * Math.sqrt(c / max)) * ease * (1 + sel * 0.4);
          dummy.position.copy(n.clone().multiplyScalar(1.006)); dummy.quaternion.setFromUnitVectors(zAxis, n); dummy.scale.setScalar(Math.max(0.0001, rs)); dummy.updateMatrix();
          rings.setMatrixAt(i, dummy.matrix);
          dummy.scale.setScalar(Math.max(0.0001, rs * (h.confidence === "confirmed" ? 0.35 : 0.0))); dummy.updateMatrix();
          cores.setMatrixAt(i, dummy.matrix); cores.setColorAt(i, col);
          dummy.position.copy(n.clone().multiplyScalar(1.02 + height)); dummy.scale.setScalar(1); dummy.updateMatrix();
          hits.setMatrixAt(i, dummy.matrix);
          aPhase.setX(i, (i * 0.137) % 1); aSolid.setX(i, h.confidence === "confirmed" ? 1 : 0); aColor.setXYZ(i, col.r, col.g, col.b); aSel.setX(i, sel);
        });
        [spikes, rings, cores, hits].forEach((m) => { m.count = shown.length; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
        aPhase.needsUpdate = aSolid.needsUpdate = aColor.needsUpdate = aSel.needsUpdate = true;
      };

      const rebuild = () => {
        const { hotspots, links, range, tactic } = live.current;
        shown.length = 0;
        hotspots.forEach((h) => { if (total(h, range, tactic) > 0 && shown.length < MAX) shown.push(h); });
        if (arcs) { markers.remove(arcs); arcs.geometry.dispose(); arcs = null; }
        const byId = new Map(shown.map((h) => [h.id, h]));
        const pos: number[] = [], tt: number[] = [], off: number[] = [];
        links.filter((l) => (tactic === "all" || l.tactic === tactic) && byId.has(l.from) && byId.has(l.to)).forEach((l, li) => {
          const a = toVec(THREE, byId.get(l.from)!.lat, byId.get(l.from)!.lon), b = toVec(THREE, byId.get(l.to)!.lat, byId.get(l.to)!.lon);
          const lift = 1 + 0.06 + a.distanceTo(b) * 0.12, S = 48;
          let prev: T.Vector3 | null = null;
          for (let s = 0; s <= S; s++) {
            const t = s / S;
            const p = new THREE.Vector3().copy(a).lerp(b, t).normalize().multiplyScalar(1.004 + (lift - 1) * Math.sin(Math.PI * t));
            if (prev) { pos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z); tt.push((s - 1) / S, t); off.push(li * 0.173, li * 0.173); }
            prev = p;
          }
        });
        if (pos.length) {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute("aT", new THREE.Float32BufferAttribute(tt, 1));
          g.setAttribute("aOff", new THREE.Float32BufferAttribute(off, 1));
          arcs = new THREE.LineSegments(g, arcMat);
          markers.add(arcs);
        }
        layoutMarkers(reduced ? 99 : (performance.now() - revealT0) / 1000);
      };

      // --- Post
      let composer: InstanceType<typeof EffectComposer> | null = null;
      if (tier === "high") {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.4, 0.72));
        composer.addPass(new OutputPass());
      }

      // --- Sizing & composition
      let wide = true;
      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        wide = w >= 900;
        renderer.setSize(w, h, false); composer?.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix();
        landMat.uniforms.uPx.value = renderer.getPixelRatio();
      };
      resize();

      // --- Interaction: drag to spin (with inertia), hover / click via raycasting
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      let yaw = 2.2, pitch = 0.25, vel = 0, dragging = false, lastX = 0, moved = 0, hoverId: string | null = null;
      let target: { yaw: number; pitch: number } | null = null;
      const pick = (cx: number, cy: number) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(hits, false)[0];
        if (!hit || hit.instanceId == null) return null;
        const h = shown[hit.instanceId];
        // Ignore markers on the far side of the planet.
        const wp = toVec(THREE, h.lat, h.lon).applyMatrix4(globe.matrixWorld);
        return wp.clone().sub(camera.position).dot(wp) < 0 ? h : null;
      };
      const onDown = (e: PointerEvent) => { dragging = true; moved = 0; lastX = e.clientX; target = null; };
      const onMove = (e: PointerEvent) => {
        if (dragging) {
          const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
          if (moved > 3) { yaw += dx * 0.005; vel = dx * 0.005; requestDraw(); }
          return;
        }
        if (e.pointerType === "touch") return;
        const h = pick(e.clientX, e.clientY);
        const id = h?.id ?? null;
        if (id !== hoverId) { hoverId = id; renderer.domElement.style.cursor = id ? "pointer" : "grab"; }
        live.current.onHover(id, e.clientX, e.clientY);
      };
      const onUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        if (moved <= 3) { const h = pick(e.clientX, e.clientY); live.current.onSelect(h?.id ?? null); }
      };
      const onLeave = () => { dragging = false; live.current.onHover(null, 0, 0); };
      renderer.domElement.style.cursor = "grab";
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointerleave", onLeave);

      const focus = (id: string | null) => {
        const h = shown.find((x) => x.id === id);
        if (!h) return;
        const p = toVec(THREE, h.lat, h.lon);
        let ty = Math.atan2(-p.x, p.z);
        while (ty - yaw > Math.PI) ty -= Math.PI * 2;
        while (ty - yaw < -Math.PI) ty += Math.PI * 2;
        const tp = Math.max(-0.6, Math.min(0.6, Math.atan2(p.y, Math.hypot(p.x, p.z)) * 0.85));
        if (reduced) { yaw = ty; pitch = tp; } else target = { yaw: ty, pitch: tp };
        vel = 0;
      };

      let scrollP = 0, scrollT = 0;
      const onScroll = () => { scrollT = Math.min(1.2, Math.max(0, window.scrollY / Math.max(1, el.clientHeight))); requestDraw(); };
      scrollT = Math.min(1.2, Math.max(0, window.scrollY / Math.max(1, el.clientHeight)));
      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const onPointerWin = (e: PointerEvent) => { pointer.tx = (e.clientX / window.innerWidth) * 2 - 1; pointer.ty = (e.clientY / window.innerHeight) * 2 - 1; };

      // --- Loop
      const clock = new THREE.Clock();
      let t = 0, raf = 0, running = false, visible = true, drawQueued = false;
      const t0 = performance.now();
      const step = (dt: number) => {
        t += dt;
        if (!dragging && !target && !reduced) { yaw += vel; vel *= 0.94; yaw += dt * 0.035; }
        if (target) {
          yaw += (target.yaw - yaw) * 0.06; pitch += (target.pitch - pitch) * 0.06;
          if (Math.abs(target.yaw - yaw) < 0.002 && Math.abs(target.pitch - pitch) < 0.002) target = null;
        }
        globe.rotation.set(pitch, yaw, 0, "XYZ");
        scrollP += (scrollT - scrollP) * (reduced ? 1 : 0.08);
        pointer.x += (pointer.tx - pointer.x) * 0.04; pointer.y += (pointer.ty - pointer.y) * 0.04;
        const intro = reduced ? 1 : Math.min(1, (performance.now() - t0) / 2600);
        const ease = 1 - Math.pow(1 - intro, 4);
        // Composition: planet sits right of centre on wide screens and rises/approaches on scroll.
        pivot.position.set((wide ? 0.78 : 0) - scrollP * 0.4, (wide ? 0.3 : 0.95) + scrollP * 0.5, -0.8 * (1 - ease) + scrollP * 1.4);
        pivot.scale.setScalar(wide ? 0.86 : Math.min(0.74, camera.aspect * 1.05));
        camera.position.set(pointer.x * 0.18, -pointer.y * 0.12, 6.2);
        camera.lookAt(0, 0, 0);
        landMat.uniforms.uReveal.value = reduced ? 1 : Math.min(1, (performance.now() - t0) / 2200);
        scanMat.uniforms.uTime.value = t; ringMat.uniforms.uTime.value = t; arcMat.uniforms.uTime.value = t;
        scan.rotation.z = reduced ? 0.6 : t * 0.12;
        stars.rotation.y = t * 0.004;
        const grow = reduced ? 99 : (performance.now() - revealT0) / 1000 - 1.2;
        if (grow < 3) layoutMarkers(Math.max(0, grow));
      };
      const draw = () => { if (composer) composer.render(); else renderer.render(scene, camera); };
      const frame = () => {
        raf = 0;
        if (!running) return;
        step(Math.min(clock.getDelta(), 0.1));
        draw();
        raf = requestAnimationFrame(frame);
      };
      const start = () => { if (reduced || running || !visible || document.hidden) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); };
      const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
      // On-demand rendering for reduced motion (and while paused).
      function requestDraw() {
        if (running || drawQueued) return;
        drawQueued = true;
        requestAnimationFrame(() => { drawQueued = false; step(reduced ? 0 : 0.016); draw(); });
      }

      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); });
      io.observe(el);
      const onVis = () => (document.hidden ? stop() : start());
      const onResize = () => { resize(); requestDraw(); };
      const onLost = (e: Event) => { e.preventDefault(); stop(); live.current.onFail?.(); };
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onScroll, { passive: true });
      if (!reduced) window.addEventListener("pointermove", onPointerWin, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      renderer.domElement.addEventListener("webglcontextlost", onLost);

      api.current = {
        update: () => { rebuild(); requestDraw(); },
        select: (id) => { focus(id); layoutMarkers(99); requestDraw(); if (reduced) requestDraw(); },
      };
      revealT0 = performance.now();
      rebuild();
      (window as unknown as { __g: unknown }).__g = { shown, spikes, rings, globe, camera };
      requestDraw();
      start();
      live.current.onReady?.();

      cleanup = () => {
        stop(); io.disconnect();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("pointermove", onPointerWin);
        window.removeEventListener("pointerup", onUp);
        document.removeEventListener("visibilitychange", onVis);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        scene.traverse((o) => {
          const m = o as T.Mesh;
          m.geometry?.dispose();
          const mat = m.material as T.Material | T.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
        });
        arcMat.dispose();
        composer?.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        api.current = null;
      };
    })().catch((e) => { console.error("Globe could not start:", e); live.current.onFail?.(); });

    return () => { disposed = true; cleanup?.(); };
  }, []);

  // Push prop changes into the running scene without re-creating it.
  useEffect(() => { api.current?.update(); }, [props.hotspots, props.links, props.range, props.tactic]);
  useEffect(() => { api.current?.select(props.selectedId); }, [props.selectedId]);

  return <div ref={host} className="globe-canvas" />;
}
