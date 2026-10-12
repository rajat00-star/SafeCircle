"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, type Campaign, type CampaignLink, type CampaignView } from "@/lib/api";

const REL_TONE = { strong: "high", likely: "medium", possible: "neutral" } as const;
const REL_WORD = { strong: "Exact indicator", likely: "Likely (similarity)", possible: "Possible (weak)" } as const;

function Radar({ view, focus, onFocus }: { view: CampaignView; focus: string | null; onFocus: (id: string) => void }) {
  // Each campaign is a constellation around the centre; spokes are the links between its cases.
  const S = 520, C = S / 2;
  const layout = useMemo(() => {
    const n = Math.max(1, view.campaigns.length);
    return view.campaigns.map((c, i) => {
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const R = 150, cx = C + Math.cos(ang) * R, cy = C + Math.sin(ang) * R;
      const pts: Record<string, { x: number; y: number }> = {};
      c.members.forEach((m, j) => {
        const a2 = (j / c.members.length) * Math.PI * 2 + ang;
        const r2 = 30 + c.members.length * 6;
        pts[m.id] = { x: cx + Math.cos(a2) * r2, y: cy + Math.sin(a2) * r2 };
      });
      return { c, cx, cy, pts };
    });
  }, [view, C]);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="radar" role="img" aria-label={`Radar of ${view.campaigns.length} potential campaigns`}>
      {[60, 130, 200, 250].map((r) => <circle key={r} cx={C} cy={C} r={r} className="ring" />)}
      <line x1={C} y1={10} x2={C} y2={S - 10} className="axis" /><line x1={10} y1={C} x2={S - 10} y2={C} className="axis" />
      <g className="sweep"><path d={`M${C},${C} L${C},${C - 250} A250,250 0 0,1 ${C + 177},${C - 177} Z`} /></g>
      {layout.map(({ c, cx, cy, pts }) => (
        <g key={c.id} className={`constellation${focus && focus !== c.id ? " dim" : ""}`} onClick={() => onFocus(c.id)}>
          {c.links.map((l) => (
            <line key={l.pair} x1={pts[l.a]?.x} y1={pts[l.a]?.y} x2={pts[l.b]?.x} y2={pts[l.b]?.y}
              className={`spoke ${l.exact.length ? "exact" : "heuristic"}`} />
          ))}
          {c.members.map((m) => <circle key={m.id} cx={pts[m.id].x} cy={pts[m.id].y} r={7} className={`blip ${m.risk_level}`} />)}
          <text x={cx} y={cy - (30 + c.members.length * 6) - 16} textAnchor="middle" className="c-count">{c.members.length} cases</text>
        </g>
      ))}
      <text x={C} y={C + 4} textAnchor="middle" className="c-center">{view.cases_considered} cases</text>
    </svg>
  );
}

function LinkRow({ l, titles, onDismiss, dismissed }: { l: CampaignLink; titles: Record<string, string>; onDismiss: (l: CampaignLink) => void; dismissed?: boolean }) {
  return (
    <li className="link-row">
      <div className="row">
        <span className="small"><strong>{titles[l.a] ?? "Case"}</strong> ↔ <strong>{titles[l.b] ?? "Case"}</strong></span>
        <span className="spacer" />
        <span className={`badge ${REL_TONE[l.relation]}`}>{REL_WORD[l.relation]} · {Math.round(l.strength * 100)}</span>
        <button className="btn ghost small" onClick={() => onDismiss(l)}>{dismissed ? "Restore" : "Not related"}</button>
      </div>
      <ul className="clean small indicator-list">
        {l.exact.map((e, i) => <li key={"x" + i}><span className="badge high">exact</span><span className="ind-text">{e.label}: <span className="mono">{e.value}</span></span></li>)}
        {l.heuristic.map((e, i) => <li key={"h" + i}><span className="badge neutral">similar</span><span className="ind-text">{e.label}: <span className="mono">{e.value}</span></span></li>)}
      </ul>
      <p className="xsmall faint" style={{ margin: 0 }}>{l.uncertainty}</p>
    </li>
  );
}

function CampaignRadar() {
  const [view, setView] = useState<CampaignView | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [v, cs] = await Promise.all([api.campaigns(), api.cases()]);
      setView(v);
      setTitles(Object.fromEntries(cs.map((c) => [c.id, c.title])));
    } catch (e) { setError((e as ApiError).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(l: CampaignLink, restore = false) {
    try {
      if (restore) await api.restoreLink(l.a, l.b); else await api.dismissLink(l.a, l.b);
      await load();
    } catch (e) { setError((e as ApiError).message); }
  }
  async function loadDemo() {
    setBusy(true);
    try { await api.loadDemoCampaigns(); await load(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  if (error && !view) return <div className="alert error" role="alert">{error}</div>;
  if (!view) return <div className="skeleton" style={{ height: 320 }} aria-busy="true" />;
  const anyDemo = view.campaigns.some((c) => c.is_demo);
  return (
    <div className="stack-lg">
      <div className="radar-grid">
        <div className="card solid radar-card">
          <Radar view={view} focus={focus} onFocus={(id) => setFocus(focus === id ? null : id)} />
          <div className="legend" style={{ justifyContent: "center" }}>
            <span><i className="lg-dot" style={{ color: "var(--high)" }} /> high-risk case</span>
            <span><i className="lg-dot" style={{ color: "var(--medium)" }} /> suspicious</span>
            <span>— exact link</span><span>┄ similarity</span>
          </div>
        </div>
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <span className="label-caps">Method</span>
          <p className="small" style={{ margin: 0 }}>{view.method}</p>
          <dl className="facts">
            <div><dt>Potential campaigns</dt><dd>{view.campaigns.length}</dd></div>
            <div><dt>Cases compared</dt><dd>{view.cases_considered}</dd></div>
            <div><dt>Low-risk cases left out</dt><dd>{view.cases_excluded_low_risk}</dd></div>
            <div><dt>Uncertain links (not grouped)</dt><dd>{view.uncertain_links.length}</dd></div>
          </dl>
          <p className="xsmall faint" style={{ margin: 0 }}>{view.external_note} A shared indicator means the cases look related; it does not prove the same people are behind them.</p>
          {anyDemo && <p className="xsmall" style={{ margin: 0 }}><span className="badge medium">DEMO DATA</span> Some cases are synthetic demo cases, not real reports.</p>}
          <div className="row"><button className="btn secondary small" onClick={loadDemo} disabled={busy}>{busy ? "Loading…" : "Load demo campaign cases"}</button></div>
        </div>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}

      {view.campaigns.length === 0 ? (
        <div className="empty"><div className="ring" aria-hidden="true" /><h3>No related cases yet</h3>
          <p style={{ margin: 0 }}>Campaigns appear when two or more of your suspicious cases share a domain, payment handle, link pattern or wording. Load the demo cases to see how it works.</p></div>
      ) : view.campaigns.map((c: Campaign) => (
        <div key={c.id} className={`card campaign${focus === c.id ? " focus" : ""}`}>
          <div className="row">
            {c.is_demo && <span className="badge medium">DEMO DATA</span>}
            <span className="label-caps">Potential campaign · {c.members.length} cases · {c.confidence}</span>
          </div>
          <h3 style={{ margin: "10px 0 6px" }}>{c.label}</h3>
          <p className="xsmall faint" style={{ margin: 0 }}>{c.disclaimer}</p>
          <div className="grid2" style={{ marginTop: 16 }}>
            <div>
              <span className="label-caps">Cases</span>
              <ul className="clean small" style={{ marginTop: 8 }}>
                {c.members.map((m) => <li key={m.id} className="row"><span className={`risk-pill small ${m.risk_level}`}>{m.risk_score}</span><a href={`/cases/?id=${m.id}`}>{m.title}</a></li>)}
              </ul>
            </div>
            <div>
              <span className="label-caps">Shared indicators</span>
              <ul className="clean small indicator-list" style={{ marginTop: 8 }}>
                {c.exact_indicators.map((x) => <li key={x}><span className="badge high">exact</span><span className="ind-text">{x}</span></li>)}
                {c.heuristic_indicators.map((x) => <li key={x}><span className="badge neutral">similar</span><span className="ind-text">{x}</span></li>)}
              </ul>
            </div>
          </div>
          <details style={{ marginTop: 14 }}>
            <summary className="small">Why each pair is linked ({c.links.length}) · dismiss a relationship</summary>
            <ul className="clean">{c.links.map((l) => <LinkRow key={l.pair} l={l} titles={titles} onDismiss={(x) => toggle(x)} />)}</ul>
          </details>
        </div>
      ))}

      {view.uncertain_links.length > 0 && (
        <div className="card">
          <div className="panel-label"><h3 style={{ margin: 0 }}>Uncertain relationships</h3><span className="label-caps">Shown for review · not grouped</span></div>
          <ul className="clean">{view.uncertain_links.map((l) => <LinkRow key={l.pair} l={l} titles={titles} onDismiss={(x) => toggle(x)} />)}</ul>
        </div>
      )}
      {view.dismissed_links.length > 0 && (
        <div className="card">
          <div className="panel-label"><h3 style={{ margin: 0 }}>Dismissed by you</h3><span className="label-caps">Excluded from campaigns</span></div>
          <ul className="clean">{view.dismissed_links.map((l) => <LinkRow key={l.pair} l={l} titles={titles} dismissed onDismiss={(x) => toggle(x, true)} />)}</ul>
        </div>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <div className="container">
      <PageHeader index="03 / Campaign Radar" eyebrow="Related scams · fewer duplicate alerts" title={"Campaign\nradar"}
        lead="Groups your suspicious cases that share a domain, a payment handle, a link pattern or near-identical wording, and shows exactly which indicators connect them. You decide what is related." />
      <ProfileGate purpose="Campaign Radar compares the investigations in your private profile.">{() => <CampaignRadar />}</ProfileGate>
    </div>
  );
}
