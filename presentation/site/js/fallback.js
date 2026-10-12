// 2D fallbacks used when WebGL is unavailable or lost. Same data, same inspector, same controls.
import { COMPONENTS, FLOWS, TIERS, esc } from "./content.js";
import { STATIONS } from "./scenes/sceneB.js";
import { KIND_META, RISK_COLOR, visibility, neighbours } from "./graph.js";

export function fallbackA(el, { onSelect }) {
  el.innerHTML = `<div class="fb-grid">${TIERS.map((t, i) => `<div class="fb-tier"><div class="tn">${esc(t)}</div><div class="row">${
    COMPONENTS.filter((c) => c.tier === i).map((c) => `<button class="fb-node" data-id="${c.id}"><b>${esc(c.short)}</b><br><span class="xsmall">${c.status.map(([, s]) => esc(s)).join(" · ")}</span></button>`).join("")
  }</div></div>`).join("")}<p class="xsmall">2D view: WebGL is not available on this device. Flows: ${FLOWS.map(([a, b]) => `${a} → ${b}`).join(", ")}.</p></div>`;
  const select = (id) => {
    el.querySelectorAll(".fb-node").forEach((b) => b.classList.toggle("sel", b.dataset.id === id));
    onSelect(id ? COMPONENTS.find((c) => c.id === id) : null, id ? FLOWS.filter(([a, b]) => a === id || b === id).map(([from, to, label, optional]) => ({ from, to, label, optional })) : []);
  };
  el.addEventListener("click", (e) => { const b = e.target.closest(".fb-node"); if (b) select(b.dataset.id); });
  return { select };
}

export function fallbackB(el, { onSelect }) {
  el.innerHTML = `<div class="fb-grid"><div class="row" style="display:flex;gap:8px;flex-wrap:wrap">${STATIONS.map((s, i) => `<button class="fb-node" data-id="${s.id}"><span class="label">0${i + 1}</span><br><b>${esc(s.name)}</b></button>`).join("")}</div>
    <p class="xsmall">2D view: WebGL is not available on this device. The playback panel still replays the real engine output.</p></div>`;
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".fb-node");
    if (!b) return;
    el.querySelectorAll(".fb-node").forEach((x) => x.classList.toggle("sel", x === b));
    onSelect(STATIONS.find((s) => s.id === b.dataset.id));
  });
}

export function fallbackC(el, graph, { onSelect }) {
  const W = 1000, H = 560;
  const xs = graph.nodes.map((n) => n.x), zs = graph.nodes.map((n) => n.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const px = (n) => 40 + ((n.x - x0) / (x1 - x0 || 1)) * (W - 80);
  const py = (n) => 30 + ((n.z - z0) / (z1 - z0 || 1)) * (H - 60);
  const state = { filters: { domain: true, upi: true, phone: true, org: true, short_link: true, inferred: true }, sharedOnly: false, selected: null };
  function draw() {
    const vis = visibility(graph, state.filters, state.sharedOnly);
    const sel = state.selected;
    const near = new Set(sel ? [sel, ...neighbours(graph, sel, vis).map((x) => x.other.id)] : []);
    el.innerHTML = `<svg class="fb-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scam network, 2D view">
      ${graph.edges.filter((e) => vis.edgeOn.has(e.i)).map((e) => `<line x1="${px(e.a)}" y1="${py(e.a)}" x2="${px(e.b)}" y2="${py(e.b)}" stroke="${e.basis === "inferred" ? "#a08cff" : "#3ee6ff"}" stroke-width="1.4" ${e.basis === "inferred" ? 'stroke-dasharray="6 5"' : ""} opacity="${!sel || e.a.id === sel || e.b.id === sel ? 0.85 : 0.08}"/>`).join("")}
      ${graph.nodes.filter((n) => vis.nodeOn.has(n.id)).map((n) => {
        const c = n.type === "case" ? RISK_COLOR[n.risk_level] : KIND_META[n.kind].color;
        const o = !sel || near.has(n.id) ? 1 : 0.2;
        return `<g data-id="${esc(n.id)}" style="cursor:pointer" opacity="${o}">${n.type === "case" ? `<circle cx="${px(n)}" cy="${py(n)}" r="9" fill="${c}"/>` : `<rect x="${px(n) - 6}" y="${py(n) - 6}" width="12" height="12" transform="rotate(45 ${px(n)} ${py(n)})" fill="${c}"/>`}
          <text x="${px(n) + 12}" y="${py(n) + 4}" fill="#e9f0fb" font-size="11">${esc(n.type === "case" ? n.label.replace(/^DEMO · /, "") : n.label)}</text></g>`;
      }).join("")}</svg>`;
  }
  el.addEventListener("click", (e) => {
    const g = e.target.closest("g[data-id]");
    api.select(g ? g.dataset.id : null);
  });
  const api = {
    state,
    select(id) { state.selected = id; draw(); const vis = visibility(graph, state.filters, state.sharedOnly); onSelect(id ? graph.byId[id] : null, id ? neighbours(graph, id, vis) : []); },
    setFilter(k, v) { state.filters[k] = v; this.select(state.selected && visibility(graph, state.filters, state.sharedOnly).nodeOn.has(state.selected) ? state.selected : null); },
    setShared(v) { state.sharedOnly = v; this.setFilter("domain", state.filters.domain); },
    resetView() { this.select(null); },
  };
  draw();
  return api;
}
