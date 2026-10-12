// Router, navigation, presentation mode, inspector and scene orchestration.
import { PITCH, COMPONENTS, PRODUCT, narrativeIndex, esc, STAGE_TITLES } from "./content.js";
import { webglAvailable } from "./engine.js";
import { buildGraph, FILTERS, KIND_META, nodeTitle } from "./graph.js";
import { fallbackA, fallbackB, fallbackC } from "./fallback.js";

const $ = (s, r = document) => r.querySelector(s);
const S = window.SNAPSHOT;
const ROUTES = narrativeIndex();
const body = document.body;
const mq = matchMedia("(prefers-reduced-motion: reduce)");
let reduced = mq.matches;
try { const p = localStorage.getItem("sc.reducedMotion"); if (p !== null) reduced = p === "1"; } catch { /* storage unavailable */ }

const SCENARIOS = {
  multistage: { label: "Multi-stage bank impersonation", frames: S.multistage.steps, note: "Four messages escalate from a KYC threat to a payment request." },
  story: { label: "Refund QR (demo story)", frames: S.story.frames, note: "The runbook story: a message, the refund QR attached, a repeat, then the caller." },
  doubt: { label: "Lone OTP request, then a retraction", frames: S.doubt.frames, note: "One uncorroborated tactic, then a contradictory follow-up." },
};

const graph = buildGraph(S.network);
let engine = null, ambient = null, sceneA = null, sceneB = null, sceneC = null;
let fbA = null, fbC = null;
let current = -1;
let gl = false;

// ---------- DOM: slides and scenes ----------
function buildStage() {
  const stage = $("#stage");
  const html = PITCH.map((p, i) => `<section class="slide" data-i="${i}" aria-label="Slide ${i + 1}: ${esc(p.title)}">${p.html()}</section>`).join("") + `
    <section class="slide scene-slide" data-i="10" aria-label="Scene A: end-to-end system">
      <div class="scene-head"><div class="kicker">Architecture · Scene A</div><h2>End-to-end system</h2>
        <p class="lede">The real components of this repository, by layer. Particles follow the real request paths. Click a module for its purpose, inputs, outputs and verified status.</p></div>
      <div class="fallback" id="fb-a"></div>
      <div class="scene-tools">
        <div class="legend"><span><i></i>Request path</span><span><i class="dash"></i>Optional, off by default</span><span><i class="dot" style="background:var(--low)"></i>Implemented and tested</span><span><i class="dot" style="background:var(--medium)"></i>Partial or configured only</span><span><i class="dot"></i>Not verified</span></div>
        <button class="btn small" id="a-tour">Walk the request path</button><button class="btn small ghost" data-reset>Reset view</button>
      </div>
    </section>
    <section class="slide scene-slide" data-i="11" aria-label="Scene B: scam detection pipeline">
      <div class="scene-head"><div class="kicker">Architecture · Scene B</div><h2>Scam detection pipeline</h2>
        <p class="lede">Each piece of evidence travels through the case engine. Scores, tactics, stages, review states and alert decisions below are the engine's real output on synthetic DEMO DATA.</p></div>
      <div class="playback glass" id="playback"></div>
      <div class="fallback" id="fb-b"></div>
      <div class="scene-tools">
        <div class="legend"><span><i></i>Observed: matched in submitted evidence</span><span><i class="dash"></i>Inferred: stage progression, proposed</span></div>
        <button class="btn small ghost" data-reset>Reset view</button>
      </div>
    </section>
    <section class="slide scene-slide" data-i="12" aria-label="Scene C: scam intelligence network">
      <div class="scene-head"><div class="kicker">Architecture · Scene C</div><h2>Scam intelligence network</h2>
        <p class="lede">${graph.stats.cases} synthetic cases and the ${graph.stats.indicators} indicators they share, from <span class="mono">GET /api/v1/network</span>. ${esc(graph.source)} Click a node to inspect it.</p></div>
      <div class="fallback" id="fb-c"></div>
      <div class="scene-tools">
        <div class="legend"><span><i></i>Observed: indicator in that case's evidence</span><span><i class="dash"></i>Inferred: similarity, not proof</span><span><i class="dot"></i>Case, coloured by risk</span></div>
        ${FILTERS.map((f) => `<label class="toggle"><input type="checkbox" data-filter="${f.key}" checked><span class="sw" style="background:${f.key === "inferred" ? "var(--violet)" : KIND_META[f.key].color}"></span>${f.label} (${graph.counts[f.key]})</label>`).join("")}
        <label class="toggle"><input type="checkbox" id="c-shared">Shared by 2+ cases only</label>
        <button class="btn small ghost" data-reset>Reset view</button>
        <span class="chip demo">DEMO DATA</span>
      </div>
    </section>`;
  stage.innerHTML = html;

  // Progress ticks.
  const ticks = $("#ticks");
  ticks.innerHTML = `<span class="grp">Pitch</span>` + ROUTES.map((r, i) => (i === 10 ? `<span class="grp">Architecture</span>` : "") +
    `<button class="tick${i >= 10 ? " arch" : ""}" data-i="${i}" aria-label="${esc(r.n)}: ${esc(r.title)}" title="${esc(r.n)} · ${esc(r.title)}"></button>`).join("");
  ticks.addEventListener("click", (e) => { const b = e.target.closest(".tick"); if (b) go(+b.dataset.i); });
  $("#overview-grid").innerHTML = ROUTES.map((r, i) => `<button data-i="${i}"><span class="n">${r.group} · ${r.n}</span><span class="t">${esc(r.title)}</span></button>`).join("");
  $("#overview-grid").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { closeOverlays(); go(+b.dataset.i); } });
}

// ---------- Inspector ----------
const insp = $("#inspector");
function openInspector(html) {
  $("#inspector-body").innerHTML = html;
  insp.classList.add("open");
  insp.setAttribute("aria-hidden", "false");
}
function closeInspector() {
  insp.classList.remove("open");
  insp.setAttribute("aria-hidden", "true");
}
const statusHtml = (st) => st.map(([k, s]) => `<span class="status ${k}">${esc(s)}</span>`).join("");
const listHtml = (xs) => `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const filesHtml = (fs) => fs.map((f) => `<code>${esc(f)}</code>`).join("<br>");

function showComponent(c, flows) {
  if (!c) return closeInspector();
  const name = (id) => COMPONENTS.find((x) => x.id === id).short;
  openInspector(`<div class="label">Scene A · ${esc(c.tier === 0 ? "Client" : c.tier === 1 ? "Boundary" : c.tier === 2 ? "Logic" : "Data")}</div>
    <h3>${esc(c.name)}</h3><div style="margin-top:10px">${statusHtml(c.status)}</div>
    <dl><dt>Purpose</dt><dd>${esc(c.purpose)}</dd><dt>Inputs</dt><dd>${listHtml(c.inputs)}</dd><dt>Outputs</dt><dd>${listHtml(c.outputs)}</dd>
    <dt>Connections</dt><dd><div class="conn">${flows.map((f) => `<button data-a="${f.from === c.id ? f.to : f.from}"><span class="basis ${f.optional ? "inferred" : "observed"}">${f.from === c.id ? "to" : "from"} ${esc(name(f.from === c.id ? f.to : f.from))}</span><br>${esc(f.label)}</button>`).join("")}</div></dd>
    <dt>Source</dt><dd>${filesHtml(c.files)}</dd></dl>`);
  $("#inspector-body").querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => selectA(b.dataset.a)));
}
function showStation(s) {
  if (!s) return closeInspector();
  openInspector(`<div class="label">Scene B · pipeline stage</div><h3>${esc(s.name)}</h3><div style="margin-top:10px">${statusHtml(s.status)}</div>
    <dl><dt>What happens</dt><dd>${esc(s.purpose)}</dd><dt>Inputs</dt><dd>${listHtml(s.inputs)}</dd><dt>Outputs</dt><dd>${listHtml(s.outputs)}</dd><dt>Source</dt><dd>${filesHtml(s.files)}</dd></dl>`);
}
function showNode(n, nbrs) {
  if (!n) return closeInspector();
  const facts = n.type === "case"
    ? `<dt>Risk</dt><dd><span class="lvl-${n.risk_level}">${esc(n.risk_level)} · ${n.risk_score}/100</span> <span class="xsmall">(heuristic, not a probability)</span></dd><dt>Tactics matched</dt><dd>${n.tactic_count}</dd>`
    : `<dt>What this is</dt><dd>${esc(n.note)}</dd><dt>Seen in</dt><dd>${n.case_count} case${n.case_count === 1 ? "" : "s"}</dd>`;
  const obs = nbrs.filter((x) => x.edge.basis === "observed"), inf = nbrs.filter((x) => x.edge.basis === "inferred");
  const conn = (x) => `<button data-n="${esc(x.other.id)}"><span class="basis ${x.edge.basis}">${x.edge.basis === "observed" ? "Observed · solid" : `Inferred · dashed · ${esc(x.edge.relation)} ${x.edge.strength}`}</span><br>${esc(nodeTitle(x.other))}<br><span class="xsmall">${esc(x.edge.label)}</span>${x.edge.uncertainty ? `<br><span class="xsmall" style="color:var(--medium)">${esc(x.edge.uncertainty)}</span>` : ""}</button>`;
  openInspector(`<div class="label">Scene C · ${n.type === "case" ? "case" : esc(n.kind_label)}</div><h3 style="text-transform:none">${esc(n.type === "case" ? n.label : n.label)}</h3>
    <div style="margin-top:8px"><span class="chip demo">DEMO DATA</span></div>
    <dl>${facts}<dt>Observed links (${obs.length})</dt><dd><div class="conn">${obs.map(conn).join("") || '<span class="xsmall">None visible under the current filters.</span>'}</div></dd>
    ${n.type === "case" ? `<dt>Inferred links (${inf.length})</dt><dd><div class="conn">${inf.map(conn).join("") || '<span class="xsmall">None.</span>'}</div></dd>` : ""}
    ${n.kind === "org" ? `<dt>Caution</dt><dd class="xsmall">An organisation name is a claim made by the scammer. Cases sharing it are not necessarily related; Campaign Radar treats it as heuristic.</dd>` : ""}</dl>`);
  $("#inspector-body").querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => (sceneC || fbC).select(b.dataset.n)));
}
const selectA = (id) => (sceneA || fbA).select(id);

// ---------- Scene B playback panel ----------
let pbScenario = "multistage";
function renderPlayback(key, frames, idx, inFlight) {
  const sc = SCENARIOS[key];
  const f = idx >= 0 ? frames[idx] : null;
  const c = f && f.case;
  const tacticChips = c ? c.tactics.map((t) => `<span title="${esc(t.stage)} · weight ${t.severity}">${esc(t.title)}</span>`).join("") : "";
  const stageChips = c ? c.stages_observed.map((s) => `<span class="inf">${esc(STAGE_TITLES[s] || s)}</span>`).join("") : "";
  const playing = sceneBApi && sceneBApi.isPlaying();
  $("#playback").innerHTML = `
    <div class="label">Real engine output · DEMO DATA</div>
    <label class="sr-only" for="pb-sel">Scenario</label>
    <select id="pb-sel" style="margin-top:8px;width:100%;background:rgba(8,12,24,.8);border:1px solid var(--line-strong);border-radius:10px;padding:8px">
      ${Object.entries(SCENARIOS).map(([k, v]) => `<option value="${k}" ${k === key ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
    <p class="xsmall" style="margin:6px 0 0">${esc(sc.note)}</p>
    <div class="controls">
      <button class="btn small" id="pb-play">${playing ? "Pause" : idx >= frames.length - 1 ? "Replay" : "Play"}</button>
      <button class="btn small ghost" id="pb-back" ${idx < 0 ? "disabled" : ""} aria-label="Step back">◀ Step</button>
      <button class="btn small ghost" id="pb-fwd" ${idx >= frames.length - 1 ? "disabled" : ""} aria-label="Step forward">Step ▶</button>
      <button class="btn small ghost" id="pb-reset">Reset</button>
    </div>
    <div class="scoreboard">
      <div class="bigscore ${c ? "lvl-" + c.risk_level : ""}">${c && !inFlight ? c.risk_score : inFlight ? "…" : "—"}<small>${c && !inFlight ? esc(c.risk_level) + " · 0–100" : "heuristic score"}</small></div>
      <div class="small">${f ? `${f.duplicate ? "<b>Duplicate evidence.</b> " : ""}${inFlight ? "Evidence is moving through the pipeline…" : `<span class="badge ${esc(f.alert.action)}">${esc(f.alert.action)}</span> ${esc(f.alert.reason)}`}` : "Press Play to send the first piece of evidence."}</div>
    </div>
    ${c && !inFlight ? `<div class="label" style="margin-top:12px">Tactics (observed)</div><div class="tactic-chips">${tacticChips || '<span>none</span>'}</div>
      <div class="label" style="margin-top:10px">Stage progression (inferred)</div><div class="tactic-chips">${stageChips || '<span class="inf">none</span>'}</div>
      ${c.review_required ? `<p class="small" style="color:var(--medium);margin:10px 0 0"><b>Needs review:</b> ${esc(c.review_reasons.join(", "))}.</p>` : ""}
      ${c.conflicts.length ? `<p class="xsmall" style="color:var(--violet);margin:6px 0 0"><b>Conflict:</b> ${esc(c.conflicts[c.conflicts.length - 1])}</p>` : ""}
      ${c.uncertainty && c.uncertainty.level !== "low" ? `<p class="xsmall" style="margin:6px 0 0">Uncertainty ${esc(c.uncertainty.level)}: ${esc(c.uncertainty.reasons[c.uncertainty.reasons.length - 1])}</p>` : ""}` : ""}
    <div class="steps">${frames.map((x, i) => `<div class="stepline ${i <= idx ? "done" : ""} ${i === idx ? "now" : ""}"><span class="k">${i + 1}</span><span>${esc(x.input.label)}<br><span class="xsmall">${esc(x.input.text.length > 90 ? x.input.text.slice(0, 88) + "…" : x.input.text)}</span></span>${i <= idx && !(i === idx && inFlight) ? `<span class="badge ${esc(x.alert.action)}">${x.case.risk_score}</span>` : "<span></span>"}</div>`).join("")}</div>
    <p class="xsmall" style="margin:10px 0 0">Scores are heuristic indicators from transparent rules, not calibrated probabilities. Thresholds: medium ≥ 30, high ≥ 60.</p>`;
  $("#pb-sel").onchange = (e) => { pbScenario = e.target.value; sceneBApi.load(pbScenario, SCENARIOS[pbScenario].frames); };
  $("#pb-play").onclick = () => { if (sceneBApi.isPlaying()) { sceneBApi.pause(); renderPlayback(key, frames, sceneBApi.idx()); } else sceneBApi.play(); };
  $("#pb-back").onclick = () => sceneBApi.step(-1);
  $("#pb-fwd").onclick = () => sceneBApi.step(1);
  $("#pb-reset").onclick = () => sceneBApi.reset();
}

// A thin playback controller used when there is no WebGL (no packet animation, same frames).
function htmlPlayback() {
  let key = "multistage", frames = [], idx = -1, playing = false, timer = null;
  const api = {
    load(k, f) { api.pause(); key = k; frames = f; idx = -1; renderPlayback(key, frames, idx); },
    play() { playing = true; if (idx >= frames.length - 1) idx = -1; const tick = () => { if (!playing) return; if (idx >= frames.length - 1) { playing = false; renderPlayback(key, frames, idx); return; } idx++; renderPlayback(key, frames, idx); timer = setTimeout(tick, 1800); }; tick(); },
    pause() { playing = false; clearTimeout(timer); },
    step(d) { api.pause(); idx = Math.max(-1, Math.min(frames.length - 1, idx + d)); renderPlayback(key, frames, idx); },
    reset() { api.pause(); idx = -1; renderPlayback(key, frames, idx); },
    isPlaying: () => playing, idx: () => idx,
  };
  return api;
}
let sceneBApi = null;

// ---------- Scenes ----------
async function ensureScene(i) {
  if (!gl) {
    if (i === 10 && !fbA) fbA = fallbackA($("#fb-a"), { onSelect: showComponent });
    if (i === 11 && !sceneBApi) { fallbackB($("#fb-b"), { onSelect: showStation }); sceneBApi = htmlPlayback(); sceneBApi.load(pbScenario, SCENARIOS[pbScenario].frames); }
    if (i === 12 && !fbC) fbC = fallbackC($("#fb-c"), graph, { onSelect: showNode });
    return null;
  }
  if (i < 10) {
    if (!ambient) ambient = (await import("./scenes/ambient.js")).createAmbient(engine);
    return ambient;
  }
  if (i === 10) {
    if (!sceneA) sceneA = (await import("./scenes/sceneA.js")).createSceneA(engine, { onSelect: showComponent });
    return sceneA;
  }
  if (i === 11) {
    if (!sceneB) {
      sceneB = (await import("./scenes/sceneB.js")).createSceneB(engine, { onSelect: showStation, onFrame: (k, f, idx, inFlight) => renderPlayback(k, f, idx, inFlight) });
      sceneBApi = sceneB;
      sceneB.load(pbScenario, SCENARIOS[pbScenario].frames);
    }
    return sceneB;
  }
  if (!sceneC) sceneC = (await import("./scenes/sceneC.js")).createSceneC(engine, graph, { onSelect: showNode });
  return sceneC;
}
const activeScene = () => (current === 10 ? sceneA || fbA : current === 11 ? sceneB : current === 12 ? sceneC || fbC : null);

// ---------- Navigation ----------
let navToken = 0;
async function go(i, { fromHash = false } = {}) {
  i = Math.max(0, Math.min(ROUTES.length - 1, i));
  if (i === current) return;
  const token = ++navToken;
  const prev = current;
  const crossesScene = gl && (prev === -1 || (prev < 10) !== (i < 10) || (prev >= 10 && prev !== i));
  closeInspector();
  if (crossesScene && prev !== -1 && !reduced) { $("#fade").classList.add("on"); await wait(360); }
  if (token !== navToken) return;
  current = i;
  if (!fromHash && location.hash !== ROUTES[i].route) history.replaceState(null, "", ROUTES[i].route);
  document.querySelectorAll("#stage .slide").forEach((s) => s.classList.toggle("on", +s.dataset.i === i));
  body.classList.toggle("mode-pitch", i < 10);
  body.classList.toggle("dense", i < 10 && !!PITCH[i].dense);
  const sc = await ensureScene(i);
  if (gl && sc) {
    if (engine.active !== sc) engine.use(sc);
    if (i < 10) ambient.goTo(PITCH[i].camera);
  }
  $("#fade").classList.remove("on");
  updateChrome();
  document.title = `${ROUTES[i].n} · ${ROUTES[i].title} · SafeCircle Guardian`;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function updateChrome() {
  document.querySelectorAll(".tick").forEach((t) => {
    const k = +t.dataset.i;
    t.classList.toggle("done", k < current);
    if (k === current) t.setAttribute("aria-current", "step"); else t.removeAttribute("aria-current");
  });
  const r = ROUTES[current];
  $("#counter").innerHTML = current < 10 ? `<b>${r.n}</b> / 10 · Pitch` : `Scene <b>${r.n}</b> / C · Architecture`;
  $("#prev").disabled = current === 0;
  $("#next").disabled = current === ROUTES.length - 1;
  document.querySelectorAll(".modes a").forEach((a) => a.setAttribute("aria-current", String(a.dataset.mode === (current < 10 ? "pitch" : ["a", "b", "c"][current - 10]))));
}

function routeFromHash() {
  const h = location.hash || "#/pitch/1";
  const i = ROUTES.findIndex((r) => r.route === h);
  return i >= 0 ? i : 0;
}

// ---------- Controls ----------
function closeOverlays() { document.querySelectorAll(".overlay.open").forEach((o) => o.classList.remove("open")); }
function toggleOverlay(id) { const o = $(id); const open = !o.classList.contains("open"); closeOverlays(); o.classList.toggle("open", open); if (open) o.querySelector("button")?.focus(); }

function setReduced(v) {
  reduced = v;
  body.classList.toggle("reduced", v);
  $("#btn-motion").setAttribute("aria-pressed", String(v));
  $("#btn-motion").textContent = v ? "Motion off" : "Motion";
  try { localStorage.setItem("sc.reducedMotion", v ? "1" : "0"); } catch { /* ignore */ }
  if (engine) engine.setReduced(v);
}

let idleTimer = null;
function setPresent(on) {
  body.classList.toggle("present", on);
  $("#btn-present").setAttribute("aria-pressed", String(on));
  if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && body.classList.contains("present")) setPresent(false); });
addEventListener("pointermove", () => { body.classList.remove("idle"); clearTimeout(idleTimer); if (body.classList.contains("present")) idleTimer = setTimeout(() => body.classList.add("idle"), 2500); });

function bindControls() {
  $("#prev").onclick = () => go(current - 1);
  $("#next").onclick = () => go(current + 1);
  $("#btn-help").onclick = () => toggleOverlay("#help");
  $("#btn-overview").onclick = () => toggleOverlay("#overview");
  $("#btn-present").onclick = () => setPresent(!body.classList.contains("present"));
  $("#btn-motion").onclick = () => setReduced(!reduced);
  $("#inspector-close").onclick = () => { closeInspector(); const s = activeScene(); s && s.select && (s === sceneB ? s.selectStation(null) : s.select(null)); };
  document.querySelectorAll(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o || e.target.closest("[data-close]")) closeOverlays(); }));
  document.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () => { const s = activeScene(); s && s.resetView && s.resetView(); }));
  document.querySelectorAll("[data-filter]").forEach((cb) => (cb.onchange = () => (sceneC || fbC).setFilter(cb.dataset.filter, cb.checked)));
  $("#c-shared").onchange = (e) => (sceneC || fbC).setShared(e.target.checked);
  document.querySelectorAll("[data-feature]").forEach((b) => (b.onclick = () => {
    const f = PRODUCT[+b.dataset.feature];
    openInspector(`<div class="label">Product · ${esc(f.route)}</div><h3>${esc(f.name)}</h3><div style="margin-top:10px"><span class="status ${f.chip === "ok" ? "ok" : "partial"}">${esc(f.status)}</span></div>
      <p class="small">${esc(f.desc)}</p>${f.shot ? `<img class="shot" src="assets/screens/${f.shot}.jpg" alt="Screenshot of ${esc(f.name)} with synthetic DEMO DATA" loading="lazy"><p class="shot-cap">${esc(f.shotNote || "Real screenshot of the running app, captured on a scratch database with DEMO DATA.")}</p>` : ""}`);
  }));
  // Guided tour through the request path in Scene A.
  const TOUR = ["user", "dashboard", "extension", "api", "casengine", "detector", "db", "review"];
  let tourAt = -1;
  $("#a-tour").onclick = () => { tourAt = (tourAt + 1) % TOUR.length; selectA(TOUR[tourAt]); $("#a-tour").textContent = `Next on the path (${tourAt + 1}/${TOUR.length})`; };
  addEventListener("hashchange", () => go(routeFromHash(), { fromHash: true }));

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = (tag === "input" && !["checkbox", "radio", "button"].includes(e.target.type)) || tag === "select" || tag === "textarea";
    if (typing) { if (e.key === "Escape") e.target.blur(); return; }
    const k = e.key;
    if (k === "Escape") { if ($(".overlay.open")) closeOverlays(); else if (insp.classList.contains("open")) $("#inspector-close").click(); else if (body.classList.contains("present")) setPresent(false); return; }
    if ($(".overlay.open") && k !== "?" && k !== "g" && k !== "G") return;
    if (k === "ArrowRight" || k === "PageDown" || (k === " " && tag !== "button")) { e.preventDefault(); go(current + 1); }
    else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); go(current - 1); }
    else if (k === "Home") go(0);
    else if (k === "End") go(ROUTES.length - 1);
    else if (/^[0-9]$/.test(k)) go(k === "0" ? 9 : +k - 1);
    else if (k === "a" || k === "A") go(10);
    else if (k === "b" || k === "B") go(11);
    else if (k === "c" || k === "C") go(12);
    else if (k === "p" || k === "P") setPresent(!body.classList.contains("present"));
    else if (k === "g" || k === "G") toggleOverlay("#overview");
    else if (k === "?" || k === "h" || k === "H") toggleOverlay("#help");
    else if (k === "m" || k === "M") setReduced(!reduced);
    else if (k === "r" || k === "R") { const s = activeScene(); s && s.resetView && s.resetView(); }
    else if (current === 11 && sceneBApi && k === "Enter" && tag !== "button") { e.preventDefault(); sceneBApi.isPlaying() ? sceneBApi.pause() : sceneBApi.play(); }
    else if (current === 11 && sceneBApi && k === "]") sceneBApi.step(1);
    else if (current === 11 && sceneBApi && k === "[") sceneBApi.step(-1);
  });
}

function notice(text) { const n = $("#notice"); n.textContent = text; n.classList.add("show"); setTimeout(() => n.classList.remove("show"), 7000); }

// ---------- Boot ----------
async function boot() {
  buildStage();
  bindControls();
  const cap = new URLSearchParams(location.search).get("capture");
  if (cap === "bg" || cap === "scene") body.classList.add(`capture-${cap}`);
  setReduced(reduced);
  mq.addEventListener("change", (e) => setReduced(e.matches));
  const forced2d = new URLSearchParams(location.search).get("gl") === "0";
  if (!forced2d && webglAvailable()) {
    try {
      const { Engine } = await import("./engine.js");
      engine = new Engine($("#gl"), $("#labels"), { reduced });
      engine.onLost = () => { gl = false; body.classList.remove("has-gl"); body.classList.add("no-gl"); $("#labels").replaceChildren(); notice("3D rendering stopped (graphics context lost). Switched to the 2D view."); const i = current; current = -1; go(i); };
      gl = true;
      body.classList.add("has-gl");
    } catch (err) {
      console.error(err);
      notice("3D could not start on this device. Showing the 2D view.");
    }
  }
  if (!gl) { body.classList.add("no-gl"); $("#gl").style.display = "none"; }
  await go(routeFromHash(), { fromHash: true });
  window.__appReady = true;
  // Read-only handle for automated checks (presentation/scripts/check-site.mjs).
  window.__sc = { get engine() { return engine; }, get current() { return current; }, get gl() { return gl; }, get sceneB() { return sceneBApi; }, get sceneC() { return sceneC || fbC; } };
  clearTimeout(window.__bootTimer);
  $("#loader").classList.add("done");
  if (!gl && !forced2d) notice("WebGL is not available, so the architecture scenes are shown in 2D.");
}
boot().catch((err) => {
  console.error(err);
  $("#loader-text").textContent = "Could not start: " + err.message + ". See presentation/README.md (Troubleshooting).";
});
