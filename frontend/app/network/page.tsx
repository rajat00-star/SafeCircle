"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, type NetEdge, type NetNode, type NetworkGraph } from "@/lib/api";

const W = 900, H = 600;
const KIND_ICON: Record<string, string> = { domain: "◇", short_link: "↗", upi: "₹", phone: "☎", org: "⌂" };

// Small deterministic force layout: repulsion between all nodes, springs on edges, gentle pull to the centre.
function layout(g: NetworkGraph): Record<string, { x: number; y: number }> {
  const n = g.nodes.length;
  const pos = g.nodes.map((node, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = node.type === "case" ? 140 : 240;
    return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r * 0.75 };
  });
  const idx = Object.fromEntries(g.nodes.map((node, i) => [node.id, i]));
  const links = g.edges.map((e) => [idx[e.from], idx[e.to], e.basis === "observed" ? 90 : 150] as const).filter(([a, b]) => a !== undefined && b !== undefined);
  for (let step = 0; step < 320; step++) {
    const cool = 1 - step / 320;
    const f = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
      const d2 = Math.max(dx * dx + dy * dy, 25), k = 2600 / d2, d = Math.sqrt(d2);
      f[i].x += (dx / d) * k; f[i].y += (dy / d) * k; f[j].x -= (dx / d) * k; f[j].y -= (dy / d) * k;
    }
    for (const [a, b, len] of links) {
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y, d = Math.max(1, Math.hypot(dx, dy));
      const k = (d - len) * 0.04;
      f[a].x += (dx / d) * k; f[a].y += (dy / d) * k; f[b].x -= (dx / d) * k; f[b].y -= (dy / d) * k;
    }
    pos.forEach((p, i) => {
      f[i].x += (W / 2 - p.x) * 0.01; f[i].y += (H / 2 - p.y) * 0.014;
      p.x = Math.min(W - 40, Math.max(40, p.x + Math.max(-12, Math.min(12, f[i].x)) * cool));
      p.y = Math.min(H - 30, Math.max(30, p.y + Math.max(-12, Math.min(12, f[i].y)) * cool));
    });
  }
  // Fit the result to the canvas so small graphs are not huddled in the middle.
  if (n > 1) {
    const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const sx = (W - 160) / Math.max(1, x1 - x0), sy = (H - 110) / Math.max(1, y1 - y0);
    pos.forEach((p) => { p.x = 80 + (p.x - x0) * sx; p.y = 45 + (p.y - y0) * sy; });
  }
  return Object.fromEntries(g.nodes.map((node, i) => [node.id, pos[i]]));
}

function short(s: string, n = 22) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

function Graph({ g, showInferred, selected, onSelect }:
  { g: NetworkGraph; showInferred: boolean; selected: string | null; onSelect: (id: string | null) => void }) {
  const pos = useMemo(() => layout(g), [g]);
  const edges = g.edges.filter((e) => showInferred || e.basis === "observed");
  const near = useMemo(() => {
    if (!selected) return null;
    const s = new Set([selected]);
    edges.forEach((e) => { if (e.from === selected) s.add(e.to); if (e.to === selected) s.add(e.from); });
    return s;
  }, [selected, edges]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="netgraph" role="img"
      aria-label={`Network of ${g.stats.cases} cases and ${g.stats.indicators} indicators`} onClick={() => onSelect(null)}>
      {edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to];
        if (!a || !b) return null;
        const dim = near && !(near.has(e.from) && near.has(e.to));
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge ${e.basis}${dim ? " dim" : ""}`}><title>{e.label}</title></line>;
      })}
      {g.nodes.map((node) => {
        const p = pos[node.id];
        const dim = near && !near.has(node.id);
        const activate = (ev: React.SyntheticEvent) => { ev.stopPropagation(); onSelect(selected === node.id ? null : node.id); };
        const common = {
          className: `node ${node.type}${dim ? " dim" : ""}${selected === node.id ? " sel" : ""}`, tabIndex: 0, role: "button",
          "aria-label": node.type === "case" ? `Case ${node.label}, ${node.risk_level} risk` : `${node.kind_label} ${node.label}, in ${node.case_count} cases`,
          onClick: activate, onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activate(ev); } },
        };
        if (node.type === "case") {
          return (
            <g key={node.id} transform={`translate(${p.x},${p.y})`} {...common}>
              <circle r={13} className={`case-dot ${node.risk_level}`} />
              {node.is_demo && <text y={4} textAnchor="middle" className="demo-d">D</text>}
              <text y={28} textAnchor="middle" className="nlabel">{short(node.label.replace(/^DEMO · /, ""))}</text>
            </g>
          );
        }
        const r = 7 + Math.min(6, node.case_count * 1.5);
        return (
          <g key={node.id} transform={`translate(${p.x},${p.y})`} {...common}>
            <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={4} className={`ind-dot ${node.kind}${node.case_count > 1 ? " shared" : ""}`} transform="rotate(45)" />
            <text y={4} textAnchor="middle" className="ind-icon">{KIND_ICON[node.kind]}</text>
            {(node.case_count > 1 || selected === node.id) && <text y={r + 16} textAnchor="middle" className="nlabel ind">{short(node.label, 26)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Details({ g, id }: { g: NetworkGraph; id: string }) {
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n])) as Record<string, NetNode>;
  const node = byId[id];
  if (!node) return null;
  const edges = g.edges.filter((e) => e.from === id || e.to === id);
  const other = (e: NetEdge) => byId[e.from === id ? e.to : e.from];
  if (node.type === "case") {
    const inds = edges.filter((e) => e.basis === "observed").map(other).filter((n): n is Extract<NetNode, { type: "indicator" }> => n?.type === "indicator");
    const inferred = edges.filter((e) => e.basis === "inferred");
    return (
      <div className="stack" style={{ ["--gap" as string]: "10px" }}>
        <div className="row">{node.is_demo && <span className="badge medium">DEMO DATA</span>}<span className={`badge ${node.risk_level}`}>{node.risk_level} · {node.risk_score}</span></div>
        <h3 style={{ margin: 0 }}>{node.label}</h3>
        <a href={`/cases/?id=${node.case_id}`} className="small">Open the investigation →</a>
        <span className="label-caps">Indicators found in its evidence</span>
        {inds.length ? <ul className="clean small">{inds.map((n) => <li key={n.id}><span className="mono">{KIND_ICON[n.kind]} {n.label}</span> <span className="faint">({n.kind_label}{n.case_count > 1 ? `, in ${n.case_count} cases` : ""})</span></li>)}</ul>
          : <p className="small muted" style={{ margin: 0 }}>None extracted.</p>}
        {inferred.length > 0 && <>
          <span className="label-caps">Similarity links (inferred)</span>
          <ul className="clean small">{inferred.map((e, i) => <li key={i}><strong>{other(e)?.label}</strong>: {e.label}. <span className="faint">{e.uncertainty}</span></li>)}</ul>
        </>}
      </div>
    );
  }
  const cases = edges.map(other).filter((n): n is Extract<NetNode, { type: "case" }> => n?.type === "case");
  return (
    <div className="stack" style={{ ["--gap" as string]: "10px" }}>
      <span className="label-caps">{node.kind_label}</span>
      <h3 className="mono" style={{ margin: 0, wordBreak: "break-all" }}>{node.label}</h3>
      <p className="xsmall faint" style={{ margin: 0 }}>{node.note}</p>
      <span className="label-caps">Observed in {cases.length} case{cases.length === 1 ? "" : "s"}</span>
      <ul className="clean small">{cases.map((c) => <li key={c.id} className="row"><span className={`risk-pill small ${c.risk_level}`}>{c.risk_score}</span><a href={`/cases/?id=${c.case_id}`}>{c.label}</a></li>)}</ul>
    </div>
  );
}

function Network() {
  const [g, setG] = useState<NetworkGraph | null>(null);
  const [sharedOnly, setSharedOnly] = useState(false);
  const [showInferred, setShowInferred] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.network(sharedOnly).then((x) => { setG(x); setError(null); }).catch((e: ApiError) => setError(e.message)), [sharedOnly]);
  useEffect(() => { load(); }, [load]);
  async function loadDemo() {
    setBusy(true);
    try { await api.loadDemoCampaigns(); await load(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  if (error && !g) return <div className="alert error" role="alert">{error}</div>;
  if (!g) return <div className="skeleton" style={{ height: 360 }} aria-busy="true" />;
  const anyDemo = g.nodes.some((n) => n.type === "case" && n.is_demo);
  const shared = g.nodes.filter((n): n is Extract<NetNode, { type: "indicator" }> => n.type === "indicator" && n.case_count > 1)
    .sort((a, b) => b.case_count - a.case_count);
  return (
    <div className="stack-lg">
      <div className="row">
        <label className="check"><input type="checkbox" checked={sharedOnly} onChange={(e) => { setSharedOnly(e.target.checked); setSelected(null); }} /> Only indicators shared by two or more cases</label>
        <label className="check"><input type="checkbox" checked={showInferred} onChange={(e) => setShowInferred(e.target.checked)} /> Show similarity links (inferred)</label>
        <span className="spacer" />
        <button className="btn secondary small" onClick={loadDemo} disabled={busy}>{busy ? "Loading…" : "Load demo campaign cases"}</button>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {g.nodes.length === 0 ? (
        <div className="empty"><div className="ring" aria-hidden="true" /><h3>Nothing to connect yet</h3>
          <p style={{ margin: 0 }}>The graph links your investigations through the domains, UPI IDs, phone numbers and organisations found in their evidence. Add evidence to a case or load the demo cases.</p></div>
      ) : (
        <div className="radar-grid">
          <div className="card solid" style={{ padding: 8 }}>
            <Graph g={g} showInferred={showInferred} selected={selected} onSelect={setSelected} />
            <div className="legend" style={{ justifyContent: "center" }}>
              <span><i className="lg-dot" style={{ color: "var(--high)" }} /> case (colour = risk)</span>
              <span>◇ indicator (bigger = more cases)</span>
              <span>— observed</span><span>┄ inferred</span>
              {anyDemo && <span><span className="badge medium">D</span> DEMO DATA</span>}
            </div>
          </div>
          <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
            {selected ? <Details g={g} id={selected} /> : (
              <>
                <span className="label-caps">How to read it</span>
                <p className="small" style={{ margin: 0 }}>{g.legend.observed}</p>
                <p className="small" style={{ margin: 0 }}>{g.legend.inferred}</p>
                <dl className="facts">
                  <div><dt>Cases</dt><dd>{g.stats.cases}</dd></div>
                  <div><dt>Indicators</dt><dd>{g.stats.indicators}</dd></div>
                  <div><dt>Shared indicators</dt><dd>{g.stats.shared_indicators}</dd></div>
                  <div><dt>Inferred links</dt><dd>{g.stats.inferred_edges}</dd></div>
                </dl>
                <p className="xsmall faint" style={{ margin: 0 }}>{g.source} Phone numbers are compared only as keyed hashes; UPI IDs are masked. Select a node for details.</p>
                {anyDemo && <p className="xsmall" style={{ margin: 0 }}><span className="badge medium">DEMO DATA</span> Cases marked D are synthetic.</p>}
              </>
            )}
          </div>
        </div>
      )}
      {shared.length > 0 && (
        <div className="card">
          <div className="panel-label"><h3 style={{ margin: 0 }}>Shared indicators</h3><span className="label-caps">Observed in more than one case</span></div>
          <ul className="clean stack" style={{ ["--gap" as string]: "8px" }}>
            {shared.map((n) => (
              <li key={n.id} className="row">
                <span className="badge neutral">{n.kind_label}</span>
                <button className="linklike mono small" onClick={() => setSelected(n.id)}>{n.label}</button>
                <span className="spacer" /><span className="small muted">{n.case_count} cases</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function NetworkPage() {
  return (
    <div className="container">
      <PageHeader index="03 / Scam network" eyebrow="Observed links · inferred similarity" title={"Scam\nnetwork"}
        lead="See how your investigations connect through the same domains, UPI IDs, phone numbers and claimed organisations. Solid lines are indicators found in the evidence; dashed lines are similarity that still needs your judgement." />
      <ProfileGate purpose="The network graph is built from the investigations in your private profile.">{() => <Network />}</ProfileGate>
    </div>
  );
}
