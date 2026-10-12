"use client";
import { useMemo, useState } from "react";
import { CHANNEL_LABELS, STAGE_TITLES, type Assessment, type ChainEdge, type ChainNode } from "@/lib/api";

const CHAIN = ["hook", "pressure", "harvest", "control", "extraction"];
const W = 1000;
const EV_Y = 70;
const TAC_Y0 = 250;
const ROW = 118;

const sevTier = (s = 0) => (s >= 0.5 ? "high" : s >= 0.3 ? "medium" : "low");

type Pos = { x: number; y: number };

// Interactive attack chain. Top row: observed evidence in order. Columns: attack stages.
// Solid lines are observed (evidence text supports them); dashed lines are inferred.
export default function AttackChain({ a, onSelectEvent }: { a: Assessment; onSelectEvent?: (eventId: string) => void }) {
  const { nodes, edges } = a.chain;
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const events = nodes.filter((n) => n.type === "event").sort((x, y) => (x.position ?? 0) - (y.position ?? 0));
    const tactics = nodes.filter((n) => n.type === "tactic");
    const hasEvasion = tactics.some((t) => t.stage === "evasion");
    const cols = hasEvasion ? [...CHAIN, "evasion"] : CHAIN;
    const colX = (i: number) => 90 + (i * (W - 180)) / Math.max(1, cols.length - 1);
    const pos: Record<string, Pos> = {};
    events.forEach((e, i) => { pos[e.id] = { x: events.length === 1 ? W / 2 : 90 + (i * (W - 180)) / (events.length - 1), y: EV_Y }; });
    const perCol: Record<string, number> = {};
    for (const t of [...tactics].sort((p, q) => (q.severity ?? 0) - (p.severity ?? 0))) {
      const c = cols.indexOf(t.stage ?? "evasion");
      const k = (perCol[t.stage ?? ""] = (perCol[t.stage ?? ""] ?? -1) + 1);
      pos[t.id] = { x: colX(c), y: TAC_Y0 + k * ROW };
    }
    const maxRows = Math.max(1, ...Object.values(perCol).map((n) => n + 1));
    return { events, tactics, cols, colX, pos, height: TAC_Y0 + maxRows * ROW + 10 };
  }, [nodes]);

  const focus = hover ?? sel;
  const linked = useMemo(() => {
    if (!focus) return null;
    const s = new Set<string>([focus]);
    for (const e of edges) if (e.from === focus || e.to === focus) { s.add(e.from); s.add(e.to); }
    return s;
  }, [focus, edges]);
  const selected = nodes.find((n) => n.id === sel) ?? null;

  if (!nodes.length) {
    return <div className="empty"><div className="ring" aria-hidden="true" /><h3>No evidence yet</h3>
      <p style={{ margin: 0 }}>Add a message, link or screenshot and the attack chain will be reconstructed here.</p></div>;
  }

  const path = (e: ChainEdge) => {
    const p = layout.pos[e.from], q = layout.pos[e.to];
    if (!p || !q) return "";
    if (e.kind === "sequence") return `M${p.x + 34},${p.y} L${q.x - 34},${q.y}`;
    if (e.kind === "progression") {
      const mx = (p.x + q.x) / 2, my = Math.max(p.y, q.y) + 46;
      return `M${p.x},${p.y + 24} Q${mx},${my} ${q.x},${q.y + 24}`;
    }
    const my = (p.y + q.y) / 2;
    return `M${p.x},${p.y + 22} C${p.x},${my} ${q.x},${my} ${q.x},${q.y - 26}`;
  };

  const act = (n: ChainNode) => {
    setSel(sel === n.id ? null : n.id);
    if (n.type === "event" && n.event_id) onSelectEvent?.(n.event_id);
  };

  return (
    <div className="chain-wrap">
      <div className="chain-canvas">
        <svg viewBox={`0 0 ${W} ${layout.height}`} role="group" aria-label="Attack chain graph. Use Tab to move between nodes and Enter to see details.">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
            <radialGradient id="glowHigh"><stop offset="0" stopColor="var(--high)" stopOpacity=".55" /><stop offset="1" stopColor="var(--high)" stopOpacity="0" /></radialGradient>
            <radialGradient id="glowMedium"><stop offset="0" stopColor="var(--medium)" stopOpacity=".45" /><stop offset="1" stopColor="var(--medium)" stopOpacity="0" /></radialGradient>
            <radialGradient id="glowLow"><stop offset="0" stopColor="var(--ice)" stopOpacity=".3" /><stop offset="1" stopColor="var(--ice)" stopOpacity="0" /></radialGradient>
          </defs>

          {/* stage columns */}
          {layout.cols.map((c, i) => {
            const active = a.stages_observed.includes(c) || (c === "evasion");
            return (
              <g key={c} className={`stage-col${active ? " on" : ""}`}>
                <line x1={layout.colX(i)} x2={layout.colX(i)} y1={TAC_Y0 - 64} y2={layout.height - 8} />
                <text x={layout.colX(i)} y={TAC_Y0 - 74} textAnchor="middle">{String(i + 1).padStart(2, "0")} · {STAGE_TITLES[c].toUpperCase()}</text>
              </g>
            );
          })}
          <text className="lane-label" x={12} y={EV_Y - 44}>OBSERVED EVIDENCE · {a.order.known ? "REPORTED TIME ORDER" : "ORDER ADDED (UNCONFIRMED)"}</text>

          {/* edges */}
          {edges.map((e, i) => {
            const dim = linked && !(linked.has(e.from) && linked.has(e.to));
            return (
              <path key={i} d={path(e)} className={`edge ${e.kind} ${e.basis === "observed" ? "observed" : "inferred"}${dim ? " dim" : ""}`}
                markerEnd={e.kind !== "evidence" ? "url(#arr)" : undefined}>
                <title>{e.note}</title>
              </path>
            );
          })}

          {/* event nodes */}
          {layout.events.map((n) => {
            const p = layout.pos[n.id];
            const tier = n.event_score! >= 60 ? "high" : n.event_score! >= 30 ? "medium" : "low";
            return (
              <g key={n.id} className={`node event pop${sel === n.id ? " sel" : ""}${linked && !linked.has(n.id) ? " dim" : ""}`}
                transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button"
                aria-label={`Evidence ${n.seq}: ${CHANNEL_LABELS[n.channel ?? "unknown"]}, ${n.signals?.length ?? 0} signals. ${n.excerpt}`}
                onClick={() => act(n)} onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); act(n); } }}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}>
                <rect x={-34} y={-22} width={68} height={44} rx={14} className={`ev-box ${tier}`} />
                <text y={-2} textAnchor="middle" className="ev-num">#{n.seq}</text>
                <text y={13} textAnchor="middle" className="ev-sub">{(n.kind === "url" ? "LINK" : n.kind === "screenshot" ? "IMAGE" : (CHANNEL_LABELS[n.channel ?? "unknown"] ?? "MSG")).toUpperCase().slice(0, 9)}</text>
              </g>
            );
          })}

          {/* tactic nodes */}
          {layout.tactics.map((n) => {
            const p = layout.pos[n.id];
            const tier = sevTier(n.severity);
            const r = 16 + (n.severity ?? 0) * 18;
            const glow = tier === "high" ? "glowHigh" : tier === "medium" ? "glowMedium" : "glowLow";
            return (
              <g key={n.id} className={`node tactic pop ${tier}${n.basis === "inferred" ? " inferred" : ""}${sel === n.id ? " sel" : ""}${linked && !linked.has(n.id) ? " dim" : ""}`}
                transform={`translate(${p.x},${p.y})`} tabIndex={0} role="button"
                aria-label={`${n.label}. ${n.stage_title} stage. Weight ${n.severity?.toFixed(2)}. ${n.confidence}.`}
                onClick={() => act(n)} onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); act(n); } }}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}>
                <circle r={r * 2.1} fill={`url(#${glow})`} className="halo" />
                <circle r={r} className="core" />
                <text y={r + 20} textAnchor="middle" className="t-label">
                  {wrap(n.label).map((ln, i) => <tspan key={i} x={0} dy={i === 0 ? 0 : 17}>{ln}</tspan>)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <aside className="chain-detail card solid" aria-live="polite">
        {selected ? <NodeDetail n={selected} /> : (
          <div className="stack" style={{ ["--gap" as string]: "10px" }}>
            <span className="label-caps">How to read this</span>
            <ul className="clean small chain-legend">
              <li><span className="lg solid" /> Observed: supported by text or a link you submitted</li>
              <li><span className="lg dashed" /> Inferred: proposed by the stage model, not confirmed</li>
              <li><span className="lg seq" /> {a.order.known ? "Time order you reported" : "Order evidence was added (unconfirmed)"}</li>
              <li><span className="lg dot high" /> Larger, redder nodes carry more weight</li>
            </ul>
            <p className="small muted" style={{ margin: 0 }}>Select any node to see its evidence, explanation and next step.</p>
          </div>
        )}
      </aside>

      {/* Text equivalent of the graph for screen readers and small screens */}
      <ol className="chain-list" aria-label="Attack chain as a list">
        {layout.events.map((n) => (
          <li key={n.id}>
            <strong>Evidence #{n.seq}</strong> <span className="muted small">({CHANNEL_LABELS[n.channel ?? "unknown"]}{n.observed_at ? `, ${new Date(n.observed_at).toLocaleString()}` : ""})</span>
            {n.signals?.length ? <> → {n.signals.map((s) => layout.tactics.find((t) => t.code === s)?.label ?? s).join("; ")}</> : <span className="muted"> → no tactic found</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Two short lines fit between stage columns at any width the graph is drawn at.
function wrap(s: string, max = 19): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of s.split(" ")) {
    if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) return [lines[0], lines[1].slice(0, max - 1).trimEnd() + "…"];
  return lines;
}

function NodeDetail({ n }: { n: ChainNode }) {
  if (n.type === "event") {
    return (
      <div className="stack" style={{ ["--gap" as string]: "10px" }}>
        <span className="label-caps">Observed evidence #{n.seq}</span>
        <h3 style={{ margin: 0 }}>{n.kind === "url" ? "Link" : n.kind === "screenshot" ? "Screenshot text" : "Message"} · {CHANNEL_LABELS[n.channel ?? "unknown"]}</h3>
        <p className="small mono" style={{ margin: 0, wordBreak: "break-word" }}>{n.excerpt || "(no readable text)"}</p>
        <div className="small muted">
          {n.observed_at ? <>Received {new Date(n.observed_at).toLocaleString()} (reported by you)</> : "Received time not given; none is assumed."}
        </div>
        <div className="small">Signals in this item: {n.signals?.length ? n.signals.length : "none"} · item score {n.event_score}/100 · data quality {n.data_quality}</div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ ["--gap" as string]: "10px" }}>
      <span className="label-caps">{n.stage_title} stage · {n.basis === "inferred" ? "Inferred" : "Observed"}</span>
      <h3 style={{ margin: 0 }}>{n.label}</h3>
      <div className="row"><span className={`badge ${sevTier(n.severity)}`}>weight {n.severity?.toFixed(2)}</span><span className="badge neutral">{n.confidence}</span></div>
      <p className="small muted" style={{ margin: 0 }}>{n.explanation}</p>
      {n.evidence && n.evidence.length > 0 && (
        <div>
          <span className="label-caps">Evidence</span>
          <ul className="clean small" style={{ marginTop: 6 }}>
            {n.evidence.map((e, i) => <li key={i}><span className="chip">{e.text}</span>{e.seq ? <span className="muted"> · from #{e.seq}</span> : null}</li>)}
          </ul>
        </div>
      )}
      <p className="small" style={{ margin: 0 }}><strong>Next step:</strong> {n.recommendation}</p>
    </div>
  );
}
