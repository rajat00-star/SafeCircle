"use client";
import { useState } from "react";
import type { Analysis } from "@/lib/api";
import AlertPanel from "./AlertPanel";
import Gauge from "./Gauge";
import Highlighted from "./Highlighted";
import RiskSculpture from "./RiskSculpture";

const LEVEL_LABEL = { low: "Low risk", medium: "Suspicious", high: "High risk" } as const;
const LEVEL_WORD = { low: "Low risk", medium: "Caution", high: "High risk" } as const;

export default function ResultView({ result, input }: { result: Analysis; input: string }) {
  const [showAlert, setShowAlert] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copySummary() {
    const lines = [
      `SafeCircle Guardian: ${LEVEL_LABEL[result.risk_level]} (${result.risk_score}/100)`,
      result.verdict,
      ...result.categories.map((c) => `- ${c.title}`),
      "",
      "What to do:",
      ...result.recommendations.map((r) => `- ${r}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const hasSpans = result.kind === "message" && result.categories.some((c) => c.evidence.some((e) => e.start != null));

  return (
    <section className="stack fade-up" aria-label="Analysis result">
      <div className={`card risk-head with-sculpture ${result.risk_level}`}>
        <Gauge score={result.risk_score} level={result.risk_level} />
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="row">
            <span className={`badge ${result.risk_level}`}>{LEVEL_LABEL[result.risk_level]}</span>
            <span className="meta">{result.kind === "url" ? "Link" : "Message"} · {result.processing_ms} ms · engine {result.engine_version}</span>
          </div>
          <div className="level-word" aria-hidden="true">{LEVEL_WORD[result.risk_level]}</div>
          <h2 className="verdict">{result.verdict}</h2>
          {result.combinations.length > 0 && (
            <p className="muted" style={{ margin: 0 }}>Dangerous combination: {result.combinations.join("; ")}.</p>
          )}
          {result.ai_summary && (
            <p style={{ margin: 0 }}><strong>AI summary:</strong> {result.ai_summary}{" "}
              <span className="small muted">(explains the findings only; it does not change the score)</span></p>
          )}
          {result.ai_status === "unavailable" && <p className="small muted" style={{ margin: 0 }}>The optional AI summary was unavailable; the result above is complete without it.</p>}
        </div>
        <RiskSculpture score={result.risk_score} level={result.risk_level} />
      </div>

      <div className="caveat" role="note">
        <span className="i" aria-hidden="true">i</span>
        <span>
          {result.risk_level === "low"
            ? "Low risk means no known scam tactics were found. It is not proof that this is safe. If money, codes or passwords are involved, check through a channel you already trust."
            : "These are the signals SafeCircle detected, not a final judgement. Pressure tactics are common in scams but can appear in genuine messages too. Verify with the sender through a channel you already trust."}
        </span>
      </div>

      {hasSpans && (
        <div className="card evidence-layer">
          <div className="panel-label"><h2 style={{ margin: 0 }}>Where the warning signs are</h2><span className="label-caps">Detected evidence</span></div>
          <Highlighted text={input} result={result} />
        </div>
      )}

      <div className="grid2">
        <div className="card">
          <div className="panel-label"><h2 style={{ margin: 0 }}>Why</h2><span className="label-caps">{result.categories.length} signal{result.categories.length === 1 ? "" : "s"}</span></div>
          {result.categories.length === 0 ? (
            <p className="muted">No scam tactics matched. Absence of warning signs is not proof that something is safe.</p>
          ) : (
            <div className="stack" style={{ ["--gap" as string]: "10px" }}>
              {result.categories.map((c) => (
                <div className="cat" key={c.code}>
                  <h3>{c.title}<span className="w">weight {c.weight}</span></h3>
                  <div className="small muted">{c.explanation}</div>
                  {c.evidence.length > 0 && (
                    <div className="ev">{c.evidence.map((e, i) => <span className="chip" key={i}>{e.text}</span>)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {result.ml && (
            <p className="small muted" style={{ marginTop: 16 }}>
              <span className="label-caps" style={{ display: "block", marginBottom: 4 }}>Statistical signal (uncertain)</span>
              Language model: {Math.round(result.ml.probability * 100)}% similarity to known spam/scam texts
              {result.ml.top_terms.length > 0 && <> (words that contributed: {result.ml.top_terms.map((t) => `“${t}”`).join(", ")})</>}.
              This is a similarity estimate, not evidence on its own.
            </p>
          )}
        </div>
        <div className="card">
          <div className="panel-label"><h2 style={{ margin: 0 }}>What to do</h2><span className="label-caps">Next steps</span></div>
          <ul className="clean recs">{result.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      </div>

      {result.urls.length > 0 && (
        <div className="card">
          <div className="panel-label"><h2 style={{ margin: 0 }}>Links</h2><span className="label-caps">Read, never opened</span></div>
          <p className="small muted">Links are checked from their text only. SafeCircle never opens them.</p>
          <div className="stack">
            {result.urls.map((u, i) => (
              <div className="cat" key={i}>
                <div className="row">
                  <span className="chip">{u.url}</span>
                  <span className={`badge ${u.risk_score >= 60 ? "high" : u.risk_score >= 30 ? "medium" : "low"}`}>{u.risk_score}/100</span>
                </div>
                {u.registered_domain && <div className="small muted" style={{ marginTop: 8 }}>Real domain: <strong style={{ color: "var(--text)" }}>{u.registered_domain}</strong></div>}
                {u.signals.length > 0 ? (
                  <ul className="clean small arrows" style={{ marginTop: 10 }}>
                    {u.signals.map((s) => <li key={s.code}><strong>{s.title}.</strong> <span className="muted">{s.detail}</span></li>)}
                  </ul>
                ) : <p className="small muted">No warning signs in the address.</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="row">
          <button className="btn primary" onClick={() => setShowAlert((v) => !v)} aria-expanded={showAlert}>
            {showAlert ? "Hide" : "Ask a trusted contact"}
          </button>
          <button className="btn secondary" onClick={copySummary}>{copied ? "Copied" : "Copy summary"}</button>
          <span className="spacer" />
          <span className="small muted">
            {result.stored
              ? "Saved to your history (summary only)."
              : <>Not saved. Your text was analysed and discarded. <a href="/privacy/">Turn on history</a> to keep results.</>}
          </span>
        </div>
        {showAlert && <div style={{ marginTop: 18 }}><AlertPanel result={result} /></div>}
      </div>
    </section>
  );
}
