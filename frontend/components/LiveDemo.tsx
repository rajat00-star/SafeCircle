"use client";
import { useEffect, useRef, useState } from "react";
import { api, type Analysis } from "@/lib/api";
import { EXAMPLES } from "@/lib/examples";
import Highlighted from "./Highlighted";

const LEVEL_LABEL = { low: "Low risk", medium: "Suspicious", high: "High risk" } as const;

// A real request to the detector, made when this section scrolls into view. Nothing here is canned:
// if the API can't be reached, the section says so. Sent without the profile key, so it never
// lands in anyone's history.
export default function LiveDemo() {
  const [idx, setIdx] = useState(0);
  const samples = EXAMPLES.filter((e) => e.kind === "message").slice(0, 4);
  const sample = samples[idx];
  const [res, setRes] = useState<Analysis | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);

  const run = (i: number) => {
    setIdx(i);
    setState("loading");
    api.analyzeMessageAnonymous(samples[i].text).then((r) => { setRes(r); setState("done"); }).catch(() => setState("error"));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !seen.current) { seen.current = true; run(0); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="demo" ref={ref}>
      <div className="card glow">
        <div className="panel-label">
          <span className="label-caps"><span className={`live-dot${state === "error" ? " off" : ""}`} style={{ marginRight: 10 }} />Live detector response</span>
          <div className="row" role="group" aria-label="Choose a sample message">
            {samples.map((s, i) => (
              <button key={s.label} type="button" className="chip-btn" aria-pressed={i === idx} onClick={() => run(i)}>{s.label}</button>
            ))}
          </div>
        </div>
        {state === "done" && res ? <Highlighted text={sample.text} result={res} /> : <div className="highlighted">{sample.text}</div>}
        <p className="xsmall faint" style={{ marginTop: 12, marginBottom: 0 }}>Sample written by the SafeCircle team. Highlights come from the detector&apos;s evidence spans.</p>
      </div>
      <div className="card" aria-live="polite">
        {state === "loading" || state === "idle" ? (
          <div className="stack"><div className="skeleton" style={{ width: "30%" }} /><div className="skeleton" style={{ height: 90, width: "55%" }} /><div className="skeleton" style={{ width: "80%" }} /><div className="skeleton" style={{ width: "65%" }} /></div>
        ) : state === "error" || !res ? (
          <div className="stack">
            <span className="label-caps">Detector offline</span>
            <p className="muted" style={{ margin: 0 }}>The SafeCircle API didn&apos;t respond, so there is no live result to show. Start the backend on port 8000 and reload.</p>
            <button className="btn secondary small" onClick={() => run(idx)}>Try again</button>
          </div>
        ) : (
          <div className="stack">
            <span className={`badge ${res.risk_level}`}>{LEVEL_LABEL[res.risk_level]}</span>
            <div className="score-big" style={{ color: `var(--${res.risk_level})` }}>{res.risk_score}<span className="faint" style={{ fontSize: "0.3em" }}> / 100</span></div>
            <p style={{ margin: 0, fontWeight: 600 }}>{res.verdict}</p>
            <ul className="arrows caps">
              {res.categories.length ? res.categories.map((c) => <li key={c.code}>{c.title}</li>) : <li>No scam tactics matched</li>}
            </ul>
            <div className="term"><b>{res.processing_ms} ms</b> server analysis · engine <b>{res.engine_version}</b></div>
          </div>
        )}
      </div>
    </div>
  );
}
