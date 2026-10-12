// Graph model for Scene C, shared by the 3D view and the 2D fallback.
// Data: GET /api/v1/network on the DEMO DATA snapshot (presentation/site/data/network.json).

export const KIND_META = {
  case: { label: "Case", color: "#e9f0fb" },
  domain: { label: "Domain", color: "#3ee6ff" },
  upi: { label: "UPI handle (masked)", color: "#a08cff" },
  phone: { label: "Phone (keyed hash)", color: "#5cebb0" },
  org: { label: "Claimed organisation", color: "#c3cad8" },
  short_link: { label: "Shortened link", color: "#7fb6ff" },
};
export const RISK_COLOR = { low: "#5cebb0", medium: "#ffb84d", high: "#ff6161" };
export const FILTERS = [
  { key: "domain", label: "Domains" }, { key: "upi", label: "UPI handles" }, { key: "phone", label: "Phone numbers" },
  { key: "org", label: "Organisation claims" }, { key: "short_link", label: "Short links" }, { key: "inferred", label: "Inferred similarity" },
];

export function buildGraph(net) {
  const nodes = net.nodes.map((n) => ({ ...n, kind: n.type === "case" ? "case" : n.kind, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = net.edges.filter((e) => byId[e.from] && byId[e.to]).map((e, i) => ({ ...e, i, a: byId[e.from], b: byId[e.to] }));
  layout(nodes, edges);
  const counts = { inferred: edges.filter((e) => e.basis === "inferred").length };
  for (const k of ["domain", "upi", "phone", "org", "short_link"]) counts[k] = nodes.filter((n) => n.kind === k).length;
  return { nodes, edges, byId, counts, stats: net.stats, legend: net.legend, source: net.source };
}

// Deterministic force layout (seeded), computed once.
function layout(nodes, edges) {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  nodes.forEach((n, i) => {
    const r = n.kind === "case" ? 6 : 3.5;
    const a = (i / nodes.length) * Math.PI * 2;
    n.x = Math.cos(a) * r + rnd(); n.y = rnd() * 3; n.z = Math.sin(a) * r + rnd();
  });
  for (let it = 0; it < 420; it++) {
    const cool = 1 - it / 420;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz + 0.01, f = 9 / d2;
      const d = Math.sqrt(d2); dx /= d; dy /= d; dz /= d;
      a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    }
    for (const e of edges) {
      const a = e.a, b = e.b, rest = e.basis === "inferred" ? 3.8 : 2.6;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
      const f = (d - rest) * 0.06;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; a.vz += (dz / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; b.vz -= (dz / d) * f;
    }
    for (const n of nodes) {
      n.vx -= n.x * 0.012; n.vy -= n.y * 0.03; n.vz -= n.z * 0.012;
      n.x += Math.max(-0.5, Math.min(0.5, n.vx)) * cool; n.y += Math.max(-0.5, Math.min(0.5, n.vy)) * cool; n.z += Math.max(-0.5, Math.min(0.5, n.vz)) * cool;
      n.vx *= 0.55; n.vy *= 0.55; n.vz *= 0.55;
    }
  }
}

// Visibility under the current filters.
export function visibility(g, filters, sharedOnly) {
  const nodeOn = new Set();
  const edgeOn = new Set();
  for (const e of g.edges) {
    if (e.basis === "inferred") { if (filters.inferred) edgeOn.add(e.i); continue; }
    const ind = e.a.type === "indicator" ? e.a : e.b;
    if (!filters[ind.kind]) continue;
    if (sharedOnly && ind.case_count < 2) continue;
    edgeOn.add(e.i);
  }
  for (const n of g.nodes) if (n.type === "case") nodeOn.add(n.id);
  for (const e of g.edges) if (edgeOn.has(e.i)) { nodeOn.add(e.a.id); nodeOn.add(e.b.id); }
  return { nodeOn, edgeOn };
}

export function neighbours(g, id, vis) {
  return g.edges.filter((e) => (e.a.id === id || e.b.id === id) && (!vis || vis.edgeOn.has(e.i)))
    .map((e) => ({ edge: e, other: e.a.id === id ? e.b : e.a }));
}

export function nodeTitle(n) { return n.type === "case" ? n.label : `${n.kind_label}: ${n.label}`; }
