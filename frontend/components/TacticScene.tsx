"use client";
import { useEffect, useRef } from "react";
import type * as T from "three";
import { pickTier, prefersReducedMotion } from "@/lib/gfx";

/*
  Spatial tactic carousel (one WebGL canvas for the whole section).
  - A column of iridescent glass "vertebrae" sits right of centre, ringed by sparse coral particles.
  - Six frosted glass panels travel a curved path: each enters deep on the right, turns to face the
    camera, holds at centre, then exits left. Neighbours stay visible, smaller and out of focus
    (real depth of field via BokehPass on capable devices). Panels pass in front of and behind the column.
  - Each panel resolves out of particles as it approaches focus and dissolves as it leaves.
  - The scene tints toward the active panel's colour. Titles decode on focus (drawn into the texture).
  The parent drives `progress` (0..N-1, from scroll); clicking a panel calls onPick(index).
*/

export type TacticCard = { code: string; title: string; explanation: string; weight: number };

const TINTS = [0x8f6bff, 0x6fb7ff, 0xc77dff, 0x5cebb0, 0xffb86b, 0xff7a9c];
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>*+=";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(" "), lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export default function TacticScene({ cards, progressRef, onPick, onFail }:
  { cards: TacticCard[]; progressRef: React.MutableRefObject<number>; onPick: (i: number) => void; onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const el = host.current;
    if (!el || cards.length === 0) return;
    const tier = pickTier();
    if (tier === "fallback") { onFail(); return; }
    const reduced = prefersReducedMotion();
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const { EffectComposer } = await import("three/examples/jsm/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/examples/jsm/postprocessing/RenderPass.js");
      const { BokehPass } = await import("three/examples/jsm/postprocessing/BokehPass.js");
      const { OutputPass } = await import("three/examples/jsm/postprocessing/OutputPass.js");
      if (disposed) return;

      let renderer: T.WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); }
      catch { onFail(); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier === "high" ? 2 : 1.25));
      renderer.setClearColor(0x060609, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.domElement.setAttribute("aria-hidden", "true");
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060609);
      scene.fog = new THREE.Fog(0x060609, 7, 16);
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
      camera.position.set(0, 0.1, 6.4);

      // Studio environment for glass reflections
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x030206);
      const panel = (w: number, h: number, c: number, k: number, p: [number, number, number], r: [number, number, number]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
        m.position.set(...p); m.rotation.set(...r); envScene.add(m);
      };
      panel(8, 1.2, 0xffffff, 1.6, [0, 5, 0], [Math.PI / 2, 0, 0]);
      panel(1.4, 7, 0xff5cb8, 2.2, [-5, 0, 0], [0, Math.PI / 2, 0]);
      panel(1.4, 7, 0x4fe3ff, 2.2, [5, 0, 0], [0, -Math.PI / 2, 0]);
      panel(5, 0.6, 0xae95ff, 1.4, [0, -3, -5], [0, 0, 0]);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(envScene, 0.04);
      scene.environment = envRT.texture;
      envScene.traverse((o) => { const m = o as T.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as T.Material).dispose(); } });

      // Tinted backdrop glow (lerps to the active card's tint)
      const backMat = new THREE.ShaderMaterial({
        depthWrite: false, uniforms: { uTint: { value: new THREE.Color(TINTS[0]) } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `varying vec2 vUv; uniform vec3 uTint;
          void main(){ vec2 p = vUv - vec2(0.55, 0.5); float g = smoothstep(0.55, 0.0, length(p * vec2(1.0, 1.4)));
            gl_FragColor = vec4(vec3(0.0019, 0.0019, 0.0028) + uTint * g * g * 0.03, 1.0); }`,
      });
      const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), backMat);
      back.position.z = -10;
      scene.add(back);

      // --- Glass vertebrae column
      const column = new THREE.Group();
      column.position.set(2.45, 0, -1.3);
      scene.add(column);
      const glass = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.05, transmission: tier === "high" ? 1 : 0, thickness: 0.5, ior: 1.45,
        transparent: tier !== "high", opacity: tier === "high" ? 1 : 0.45,
        iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [150, 850], clearcoat: 1, envMapIntensity: 1.8,
        ...(tier === "high" ? { dispersion: 3 } : {}),
      });
      const vertGeo = new THREE.TorusGeometry(0.3, 0.085, 24, 64);
      vertGeo.rotateX(Math.PI / 2);
      const verts: T.Mesh[] = [];
      for (let i = 0; i < 9; i++) {
        const m = new THREE.Mesh(vertGeo, glass);
        m.position.y = -2.6 + i * 0.65;
        m.scale.setScalar(0.85 + Math.sin(i * 0.9) * 0.2);
        column.add(m); verts.push(m);
      }
      // Coral particles around the column (pink / cyan / violet)
      const CN = tier === "high" ? 1400 : 500, cp = new Float32Array(CN * 3), cc = new Float32Array(CN * 3), cs = new Float32Array(CN);
      const coral = [[1.0, 0.36, 0.7], [0.36, 0.9, 1.0], [0.68, 0.58, 1.0], [0.95, 0.9, 1.0]];
      for (let i = 0; i < CN; i++) {
        const y = -3 + Math.random() * 6, a = Math.random() * Math.PI * 2, r = 0.45 + Math.pow(Math.random(), 2) * 1.1 + Math.sin(y * 3 + a) * 0.08;
        cp.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
        cc.set(coral[Math.floor(Math.random() * coral.length)], i * 3);
        cs[i] = Math.random();
      }
      const coralGeo = new THREE.BufferGeometry();
      coralGeo.setAttribute("position", new THREE.BufferAttribute(cp, 3));
      coralGeo.setAttribute("color", new THREE.BufferAttribute(cc, 3));
      coralGeo.setAttribute("seed", new THREE.BufferAttribute(cs, 1));
      const pointMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
        vertexShader: `attribute vec3 color; attribute float seed; uniform float uTime; uniform float uPx; varying vec3 vC; varying float vA;
          void main(){ vec3 p = position; float s = seed * 6.28; p.x += sin(uTime * 0.4 + s) * 0.03; p.z += cos(uTime * 0.35 + s) * 0.03;
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
            gl_PointSize = (1.0 + seed * 2.0) * uPx * (6.0 / -mv.z); vC = color; vA = 0.5 + 0.5 * sin(uTime * (0.8 + seed) + s); }`,
        fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC, smoothstep(0.5, 0.0, d) * vA * 0.8); }`,
      });
      column.add(new THREE.Points(coralGeo, pointMat));

      // --- Panels
      const W = 2.5, H = 1.56, R = 0.12;
      const shape = new THREE.Shape();
      shape.moveTo(-W / 2 + R, -H / 2); shape.lineTo(W / 2 - R, -H / 2); shape.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
      shape.lineTo(W / 2, H / 2 - R); shape.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2); shape.lineTo(-W / 2 + R, H / 2);
      shape.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R); shape.lineTo(-W / 2, -H / 2 + R); shape.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
      const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3, curveSegments: 10 });
      slabGeo.translate(0, 0, -0.02);
      const textGeo = new THREE.PlaneGeometry(W, H);

      type Panel = { group: T.Group; slab: T.Mesh; slabMat: T.MeshPhysicalMaterial; text: T.Mesh; textMat: T.MeshBasicMaterial;
        canvas: HTMLCanvasElement; tex: T.CanvasTexture; dust: T.Points; dustMat: T.ShaderMaterial; scrambleT: number; lastDrawn: string };
      const CW = 1280, CH = Math.round((CW * H) / W);
      const drawCard = (p: Panel, i: number, titleOverride?: string) => {
        const c = cards[i], ctx = p.canvas.getContext("2d")!;
        ctx.clearRect(0, 0, CW, CH);
        const g = ctx.createLinearGradient(0, 0, CW, CH);
        g.addColorStop(0, "rgba(255,255,255,0.10)"); g.addColorStop(0.45, "rgba(255,255,255,0.025)"); g.addColorStop(1, "rgba(255,255,255,0.05)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(0, 0, CW, CH, 60); ctx.fill();
        const pad = 72;
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "500 26px 'JetBrains Mono', ui-monospace, monospace";
        ctx.textBaseline = "top";
        ctx.fillText(`${String(i + 1).padStart(2, "0")} / ${c.code.replace(/_/g, " ").toUpperCase()}`, pad, pad);
        const wTxt = `W ${c.weight}`;
        ctx.fillText(wTxt, CW - pad - ctx.measureText(wTxt).width, pad);
        ctx.fillStyle = "#f2f0fa";
        ctx.font = "600 74px 'Chakra Petch', 'Eurostile', sans-serif";
        const title = (titleOverride ?? c.title).toUpperCase();
        const tl = wrap(ctx, title, CW - pad * 2).slice(0, 3);
        tl.forEach((l, k) => ctx.fillText(l, pad, 200 + k * 78));
        ctx.fillStyle = "rgba(225,222,240,0.78)";
        ctx.font = "400 34px Inter, system-ui, sans-serif";
        const bl = wrap(ctx, c.explanation, CW - pad * 2).slice(0, 4);
        const y0 = 200 + tl.length * 78 + 34;
        bl.forEach((l, k) => ctx.fillText(l, pad, y0 + k * 48));
        p.tex.needsUpdate = true;
        p.lastDrawn = title;
      };

      const panels: Panel[] = cards.map((c, i) => {
        const group = new THREE.Group();
        const slabMat = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(TINTS[i % TINTS.length]).lerp(new THREE.Color(0xffffff), 0.75), roughness: 0.32,
          transmission: tier === "high" ? 0.92 : 0, thickness: 0.3, ior: 1.35, transparent: true, opacity: tier === "high" ? 1 : 0.22,
          clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.1, iridescence: 0.4, iridescenceIOR: 1.4,
        });
        const slab = new THREE.Mesh(slabGeo, slabMat);
        const canvas = document.createElement("canvas"); canvas.width = CW; canvas.height = CH;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
        const text = new THREE.Mesh(textGeo, textMat);
        text.position.z = 0.04;
        // Dust: points sampled on the panel rectangle; scattered when far from focus
        const DN = tier === "high" ? 900 : 400, dp = new Float32Array(DN * 3), dir = new Float32Array(DN * 3);
        for (let k = 0; k < DN; k++) {
          const edge = Math.random() < 0.55;
          let x = (Math.random() - 0.5) * W, y = (Math.random() - 0.5) * H;
          if (edge) { if (Math.random() < 0.5) y = Math.sign(y) * H / 2; else x = Math.sign(x) * W / 2; }
          dp.set([x, y, 0.03], k * 3);
          const v = new THREE.Vector3().randomDirection().multiplyScalar(0.6 + Math.random() * 1.6);
          dir.set([v.x, v.y, v.z], k * 3);
        }
        const dg = new THREE.BufferGeometry();
        dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
        dg.setAttribute("dir", new THREE.BufferAttribute(dir, 3));
        const dustMat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: { uScatter: { value: 1 }, uTint: { value: new THREE.Color(TINTS[i % TINTS.length]) }, uPx: { value: renderer.getPixelRatio() } },
          vertexShader: `attribute vec3 dir; uniform float uScatter; uniform float uPx; varying float vA;
            void main(){ vec3 p = position + dir * uScatter; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
              gl_PointSize = 1.6 * uPx * (6.0 / -mv.z); vA = (1.0 - abs(uScatter - 0.35) * 1.2); }`,
          fragmentShader: `uniform vec3 uTint; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.4), smoothstep(0.5, 0.0, d) * clamp(vA, 0.0, 1.0) * 0.9); }`,
        });
        const dust = new THREE.Points(dg, dustMat);
        group.add(slab, text, dust);
        scene.add(group);
        const p: Panel = { group, slab, slabMat, text, textMat, canvas, tex, dust, dustMat, scrambleT: -1, lastDrawn: "" };
        drawCard(p, i);
        return p;
      });
      // Redraw once web fonts are ready so the canvas uses the real typefaces.
      document.fonts?.ready.then(() => { if (!disposed) panels.forEach((p, i) => drawCard(p, i)); requestDraw(); });

      // --- Post: depth of field on capable devices
      let composer: InstanceType<typeof EffectComposer> | null = null;
      let bokeh: InstanceType<typeof BokehPass> | null = null;
      if (tier === "high") {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bokeh = new BokehPass(scene, camera, { focus: 6.4, aperture: 0.0016, maxblur: 0.008 });
        if (!new URLSearchParams(location.search).has('nobokeh')) composer.addPass(bokeh);
        composer.addPass(new OutputPass());
      }

      let wide = true;
      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        wide = w >= 900;
        renderer.setSize(w, h, false); composer?.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix();
      };
      resize();

      // --- Picking
      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      const slabs = panels.map((p) => p.slab);
      const onClick = (e: MouseEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(slabs, false)[0];
        if (hit) pickRef.current(slabs.indexOf(hit.object as T.Mesh));
      };
      const onMove = (e: MouseEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        renderer.domElement.style.cursor = ray.intersectObjects(slabs, false).length ? "pointer" : "default";
        mouse.tx = ndc.x; mouse.ty = ndc.y;
      };
      const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      renderer.domElement.addEventListener("click", onClick);
      renderer.domElement.addEventListener("mousemove", onMove);

      // --- Loop
      const clock = new THREE.Clock();
      let t = 0, raf = 0, running = false, visible = false, drawQueued = false, smooth = progressRef.current, lastFocus = -1;
      const tint = new THREE.Color(TINTS[0]);
      const step = (dt: number) => {
        t += dt;
        const target = progressRef.current;
        smooth += (target - smooth) * (reduced ? 1 : Math.min(1, dt * 5));
        mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
        const cx = wide ? -0.9 : 0;
        panels.forEach((p, i) => {
          const o = i - smooth, ao = Math.abs(o);
          // Curved path: right & deep → centre (facing camera) → left & deep
          const x = cx + o * 2.35 + Math.sign(o) * Math.max(0, ao - 1) * 0.6;
          const z = -ao * 1.5 - Math.max(0, ao - 1) * 0.8 + (o > 0 ? -0.15 : 0);
          const y = Math.sin(o * 0.9) * 0.18 + Math.sin(t * 0.5 + i) * 0.03;
          p.group.position.set(x, y, z);
          p.group.rotation.set(Math.sin(t * 0.4 + i) * 0.02 - mouse.y * 0.05 * (ao < 0.5 ? 1 : 0), -Math.max(-0.45, Math.min(0.45, o * 0.38)) + mouse.x * 0.06 * (ao < 0.5 ? 1 : 0), 0);
          const near = Math.max(0, 1 - Math.max(0, ao - 0.45) / 1.6);
          p.dustMat.uniforms.uScatter.value = reduced ? 0 : Math.min(1.2, Math.max(0, ao - 0.25) * 0.9);
          p.textMat.opacity = Math.max(0, 1 - Math.max(0, ao - 0.35) * 0.9);
          p.slabMat.opacity = (tier === "high" ? 1 : 0.22 * near + 0.05) * Math.max(0, Math.min(1, 2.3 - ao));
          p.group.visible = ao < 2.4;
        });
        // Title decode when a card takes focus
        const f = Math.round(smooth);
        if (f !== lastFocus && Math.abs(smooth - f) < 0.2) { lastFocus = f; if (panels[f] && !reduced) panels[f].scrambleT = 0; }
        panels.forEach((p, i) => {
          if (p.scrambleT < 0) return;
          p.scrambleT += dt;
          const prog = Math.min(1, p.scrambleT / 0.35), title = cards[i].title.toUpperCase();
          const settled = Math.floor(prog * title.length);
          const s = prog >= 1 ? title : title.split("").map((ch, k) => (k < settled || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
          drawCard(p, i, s);
          if (prog >= 1) p.scrambleT = -1;
        });
        tint.lerp(new THREE.Color(TINTS[Math.max(0, Math.min(cards.length - 1, f)) % TINTS.length]), 0.05);
        backMat.uniforms.uTint.value.copy(tint);
        verts.forEach((v, i) => { v.rotation.z = Math.sin(t * 0.35 + i * 0.7 + smooth * 0.6) * 0.22; v.rotation.x = Math.cos(t * 0.3 + i) * 0.12; });
        column.rotation.y = t * 0.05;
        column.position.y = Math.sin(t * 0.3) * 0.08 - smooth * 0.15;
        pointMat.uniforms.uTime.value = t;
        camera.position.set(mouse.x * 0.25, 0.1 + mouse.y * 0.12, 6.4);
        camera.lookAt(cx * 0.4, 0, -1);
        if (bokeh) (bokeh.uniforms as unknown as { focus: { value: number } }).focus.value = camera.position.distanceTo(panels[Math.max(0, Math.min(panels.length - 1, f))].group.position);
      };
      const draw = () => { if (composer) composer.render(); else renderer.render(scene, camera); };
      const frame = () => { raf = 0; if (!running) return; step(Math.min(clock.getDelta(), 0.1)); draw(); raf = requestAnimationFrame(frame); };
      const start = () => { if (reduced || running || !visible || document.hidden) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); };
      const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
      function requestDraw() { if (running || drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; step(0.016); draw(); }); }

      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { start(); requestDraw(); } else stop(); });
      io.observe(el);
      const onVis = () => (document.hidden ? stop() : start());
      const onResize = () => { resize(); requestDraw(); };
      const onScroll = () => { if (reduced) requestDraw(); };
      const onLost = (e: Event) => { e.preventDefault(); stop(); onFail(); };
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("visibilitychange", onVis);
      renderer.domElement.addEventListener("webglcontextlost", onLost);
      requestDraw();

      cleanup = () => {
        stop(); io.disconnect();
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onScroll);
        document.removeEventListener("visibilitychange", onVis);
        renderer.domElement.removeEventListener("webglcontextlost", onLost);
        renderer.domElement.removeEventListener("click", onClick);
        renderer.domElement.removeEventListener("mousemove", onMove);
        panels.forEach((p) => p.tex.dispose());
        scene.traverse((o) => {
          const m = o as T.Mesh;
          m.geometry?.dispose();
          const mat = m.material as T.Material | T.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
        });
        envRT.dispose(); pmrem.dispose(); composer?.dispose(); renderer.dispose(); renderer.domElement.remove();
      };
    })().catch((e) => { console.error("Tactic scene could not start:", e); onFail(); });

    return () => { disposed = true; cleanup?.(); };
    // Rebuild only if the card set changes.
  }, [cards, progressRef, onFail]);

  return <div ref={host} className="tactic-canvas" />;
}
