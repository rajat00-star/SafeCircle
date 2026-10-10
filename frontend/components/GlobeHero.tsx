"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABELS } from "@/lib/api";
import { getThreatProvider, RANGE_LABEL, RANGES, TACTICS, total, type Range, type Tactic, type ThreatSnapshot } from "@/lib/threatData";
import Scramble from "./Scramble";

const GlobeScene = dynamic(() => import("./GlobeScene"), { ssr: false });

const HEADLINE = ["The world", "is connected.", "So are scams."];

// Hero: interactive threat globe + headline + activity panel. The panel, filters and location list
// are plain DOM, so they work with a keyboard, a screen reader, and without WebGL.
export default function GlobeHero() {
  const [snap, setSnap] = useState<ThreatSnapshot | null>(null);
  const [err, setErr] = useState(false);
  const [range, setRange] = useState<Range>("7d");
  const [tactic, setTactic] = useState<Tactic | "all">("all");
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [glFailed, setGlFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { getThreatProvider().load().then(setSnap).catch(() => setErr(true)); }, []);

  const visible = useMemo(() => (snap?.hotspots ?? []).filter((h) => total(h, range, tactic) > 0)
    .sort((a, b) => total(b, range, tactic) - total(a, range, tactic)), [snap, range, tactic]);
  const max = Math.max(1, ...visible.map((h) => total(h, range, tactic)));
  const selected = visible.find((h) => h.id === sel) ?? null;
  const hovered = hover ? snap?.hotspots.find((h) => h.id === hover.id) : null;
  const isDemo = snap?.provider.kind === "demo";
  useEffect(() => { if (sel && !visible.some((h) => h.id === sel)) setSel(null); }, [visible, sel]);

  const tierOf = (c: number) => (c / max > 0.6 ? "high" : c / max > 0.25 ? "medium" : "low");
  const tierWord = { high: "Highest", medium: "Elevated", low: "Lower" } as const;

  return (
    <section id="hero" className="hero globe-hero" aria-labelledby="hero-title">
      <div className="hero-stage globe-stage">
        {snap && !glFailed && (
          <GlobeScene hotspots={snap.hotspots} links={snap.links} range={range} tactic={tactic} selectedId={sel}
            onSelect={setSel} onHover={(id, x, y) => setHover(id ? { id, x, y } : null)} onReady={() => setReady(true)} onFail={() => setGlFailed(true)} />
        )}
        {glFailed && <div className="globe-fallback" aria-hidden="true" />}
      </div>

      {/* Technical labels around the planet (decorative) */}
      <div className="globe-labels" aria-hidden="true">
        <span style={{ top: "11%", right: "4%" }}>Natural Earth · 1:50m land mask</span>
        <span style={{ top: "70%", right: "34%" }}>Terminator · fixed sun</span>
        <span style={{ top: "11%", right: "44%" }}>{isDemo ? "Synthetic sample feed" : snap ? snap.provider.label : "Loading feed"}</span>
      </div>

      {hovered && hover && (
        <div className="globe-tip" style={{ left: hover.x + 14, top: hover.y + 14 }} aria-hidden="true">
          <b>{hovered.name}</b> · {hovered.region}<br />{total(hovered, range, tactic).toLocaleString()} {isDemo ? "sample " : ""}reports · {RANGE_LABEL[range]}
        </div>
      )}

      <div className="container" style={{ width: "100%" }}>
        <div className="hero-grid">
          <div>
            <span className="eyebrow fade-up" style={{ ["--d" as string]: 200 }}>SafeCircle Guardian · Scam &amp; phishing intelligence</span>
            <h1 id="hero-title" className="display" aria-label="The world is connected. So are scams.">
              {HEADLINE.map((line, i) => (
                <span className="line" key={line} aria-hidden="true">
                  <span className="rise" style={{ ["--d" as string]: 300 + i * 180 }}>
                    <Scramble text={line.toUpperCase()} delay={420 + i * 180} duration={650} startOnView={false} />
                  </span>
                </span>
              ))}
            </h1>
            <p className="label-caps fade-up" style={{ ["--d" as string]: 1000, color: "var(--silver)", lineHeight: 1.9, margin: "22px 0 22px" }}>
              See the signals. Understand the threats.<br />Protect your next move.
            </p>
            <div className="row fade-up" style={{ ["--d" as string]: 1200 }}>
              <a href="#analyze" className="btn primary">Analyze a message <span className="arrow" aria-hidden="true">→</span></a>
              <a href="#protection" className="btn glass">Explore threat intelligence</a>
            </div>
          </div>

          <aside className="activity card fade-up" style={{ ["--d" as string]: 1400 }} aria-label="Scam activity panel">
            <div className="panel-label" style={{ marginBottom: 10 }}>
              <span className="label-caps">Scam activity</span>
              {snap && (isDemo
                ? <span className="badge medium demo-badge" title={snap.provider.description}>Demo data</span>
                : <span className="badge low">{snap.provider.label}</span>)}
            </div>
            {err && <p className="small muted">The activity feed couldn&apos;t be loaded.</p>}
            {snap && (
              <>
                {isDemo && <p className="xsmall muted" style={{ margin: "0 0 12px" }}>{snap.provider.description}</p>}
                <div className="row" role="group" aria-label="Time range" style={{ gap: 6 }}>
                  {RANGES.map((r) => <button key={r} type="button" className="chip-btn" aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}
                </div>
                <label htmlFor="g-tactic" className="sr-only">Threat category</label>
                <select id="g-tactic" value={tactic} onChange={(e) => setTactic(e.target.value as Tactic | "all")} style={{ marginTop: 10 }}>
                  <option value="all">All tactics</option>
                  {TACTICS.map((t) => <option key={t} value={t}>{CATEGORY_LABELS[t] ?? t}</option>)}
                </select>
                <label htmlFor="g-loc" className="sr-only">Location</label>
                <select id="g-loc" value={sel ?? ""} onChange={(e) => setSel(e.target.value || null)} style={{ marginTop: 8 }}>
                  <option value="">Choose a location ({visible.length})…</option>
                  {visible.map((h) => <option key={h.id} value={h.id}>{h.name}, {h.region}</option>)}
                </select>

                <div className="activity-detail" aria-live="polite">
                  {selected ? (
                    <>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong>{selected.name}</strong>
                        <span className={`badge ${tierOf(total(selected, range, tactic))}`}>{tierWord[tierOf(total(selected, range, tactic))]}</span>
                      </div>
                      <div className="xsmall muted">{selected.region} · {selected.confidence === "confirmed" ? "Confirmed observations" : "Unverified / incomplete"}</div>
                      <div className="big-count">{total(selected, range, tactic).toLocaleString()}<span> {isDemo ? "sample " : ""}reports · {RANGE_LABEL[range]}</span></div>
                      <ul className="arrows caps" style={{ marginTop: 8 }}>
                        {TACTICS.filter((t) => (selected.counts[range][t] ?? 0) > 0 && (tactic === "all" || t === tactic))
                          .sort((a, b) => (selected.counts[range][b] ?? 0) - (selected.counts[range][a] ?? 0)).slice(0, 4)
                          .map((t) => <li key={t}>{CATEGORY_LABELS[t]} · {selected.counts[range][t]}</li>)}
                      </ul>
                      <div className="xsmall faint" style={{ marginTop: 8 }}>Last updated: {selected.lastUpdated ? new Date(selected.lastUpdated).toLocaleString() : isDemo ? "n/a (synthetic data has no real timestamps)" : "not provided by the feed"}</div>
                    </>
                  ) : (
                    <p className="xsmall muted" style={{ margin: 0 }}>{glFailed ? "Choose a location above to see its details." : "Hover or tap a marker on the globe, or choose a location above."}</p>
                  )}
                </div>

                <div className="legend" aria-label="Legend">
                  <span><i className="lg-dot" style={{ background: "var(--high)" }} />Highest</span>
                  <span><i className="lg-dot" style={{ background: "var(--medium)" }} />Elevated</span>
                  <span><i className="lg-dot" style={{ background: "var(--ice)" }} />Lower</span>
                  <span><i className="lg-ring solid" />Confirmed</span>
                  <span><i className="lg-ring" />Unverified</span>
                </div>
                <p className="xsmall faint" style={{ margin: "8px 0 0" }}>Marker height and colour are relative to the busiest location in the current filter.{!ready && !glFailed ? " Loading globe…" : ""}</p>
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
