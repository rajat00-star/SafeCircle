"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AttackChain from "@/components/AttackChain";
import Gauge from "@/components/Gauge";
import {
  ALERT_LABELS, api, ApiError, CHANNEL_LABELS, parseTime, STAGE_TITLES,
  type AlertDecision, type CaseDetail, type CaseStatus, type DemoScenario,
} from "@/lib/api";

const LEVEL_LABEL = { low: "Low risk", medium: "Suspicious", high: "High risk" } as const;
const ALERT_TONE: Record<string, string> = { new: "high", escalated: "high", updated: "medium", suppressed: "neutral", deescalated: "low", none: "neutral" };

export default function CaseView({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [c, setC] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAlert, setLastAlert] = useState<AlertDecision | null>(null);
  const [announce, setAnnounce] = useState("");
  const [scenario, setScenario] = useState<DemoScenario | null>(null);

  const load = useCallback(() => api.getCase(id).then(setC).catch((e: ApiError) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!c?.is_demo || !c.demo_scenario || c.demo_scenario.startsWith("campaign:")) return;
    api.demoScenarios().then((d) => setScenario(d.scenarios.find((s) => s.key === c.demo_scenario) ?? null)).catch(() => setScenario(null));
  }, [c?.is_demo, c?.demo_scenario]);

  function applied(next: CaseDetail, alert: AlertDecision, lines: string[]) {
    setC(next);
    setLastAlert(alert);
    setAnnounce(`${ALERT_LABELS[alert.action]}. Risk ${next.risk_score} out of 100, ${LEVEL_LABEL[next.risk_level]}. ${lines.join(" ")}`);
  }

  async function setStatus(status: CaseStatus) {
    try { setC(await api.updateCase(id, { status })); } catch (e) { setError((e as ApiError).message); }
  }
  async function remove() {
    if (!window.confirm("Delete this investigation and all its evidence? This cannot be undone.")) return;
    try { await api.deleteCase(id); onDeleted(); } catch (e) { setError((e as ApiError).message); }
  }
  async function removeEvidence(eventId: string, seq: number) {
    if (!window.confirm(`Remove evidence #${seq} and re-evaluate the case?`)) return;
    try { setC(await api.removeEvidence(id, eventId)); } catch (e) { setError((e as ApiError).message); }
  }

  if (error && !c) return <div className="alert error" role="alert">{error}</div>;
  if (!c) return <div className="card stack" aria-busy="true"><span className="sr-only">Loading…</span><div className="skeleton" style={{ width: "40%" }} /><div className="skeleton" style={{ height: 240 }} /></div>;
  const a = c.assessment;

  return (
    <div className="stack-lg">
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div className="row">
        <a href="/cases/" className="btn ghost small">← All investigations</a>
        <span className="spacer" />
        <label htmlFor="case-status" className="small muted" style={{ margin: 0 }}>Status</label>
        <select id="case-status" value={c.status} onChange={(e) => setStatus(e.target.value as CaseStatus)} style={{ width: "auto" }}>
          <option value="open">Open</option><option value="review">Needs review</option><option value="closed">Closed</option>
        </select>
        <button className="btn danger small" onClick={remove}>Delete</button>
      </div>

      <div className="case-title">
        <div className="row">
          {c.is_demo && <span className="badge medium demo-flag" title="Synthetic scenario written by the SafeCircle team">DEMO DATA</span>}
          <span className="label-caps">Scam DNA investigation · {c.events.length} evidence item{c.events.length === 1 ? "" : "s"}</span>
        </div>
        <h2 className="glow" style={{ margin: "8px 0 0" }}>{c.title}</h2>
      </div>

      {scenario && <ScenarioPlayer c={c} sc={scenario} onApplied={applied} />}

      {a ? (
        <div className={`card risk-head ${a.risk_level}`}>
          <Gauge score={a.risk_score} level={a.risk_level} />
          <div className="stack" style={{ minWidth: 0, ["--gap" as string]: "12px" }}>
            <div className="row">
              <span className={`badge ${a.risk_level}`}>{LEVEL_LABEL[a.risk_level]}</span>
              {a.review_required && <span className="badge medium">Needs review</span>}
              <span className={`badge ${a.uncertainty.level === "low" ? "neutral" : a.uncertainty.level}`}>Uncertainty: {a.uncertainty.level}</span>
              <span className="badge neutral">Data quality: {a.data_quality.level}</span>
            </div>
            <h3 className="verdict" style={{ margin: 0 }}>{a.primary_action}</h3>
            <p className="xsmall faint" style={{ margin: 0 }}>{a.score_label} Thresholds: suspicious ≥ {a.thresholds.medium}, high ≥ {a.thresholds.high}.</p>
            <div className="stage-strip" aria-label="Attack stages reached">
              {["hook", "pressure", "harvest", "control", "extraction"].map((s) => (
                <span key={s} className={a.stages_observed.includes(s) ? "on" : ""}>{STAGE_TITLES[s]}</span>
              ))}
            </div>
            {lastAlert && (
              <div className={`alert ${lastAlert.notify ? "error" : "info"}`} role="status">
                <strong>{ALERT_LABELS[lastAlert.action]}.</strong> {lastAlert.reason}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="caveat"><span className="i" aria-hidden="true">i</span><span>No evidence yet. Add the first suspicious message, link or screenshot below.</span></div>
      )}

      {c.last_change && a && (
        <div className="card change-card">
          <div className="panel-label"><h3 style={{ margin: 0 }}>What changed</h3>
            <span className="label-caps">{c.last_change.score_before} → {c.last_change.score_after} ({c.last_change.delta >= 0 ? "+" : ""}{c.last_change.delta})</span></div>
          <ul className="clean arrows small">{c.last_change.explanation.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <details className="small" style={{ marginTop: 10 }}>
            <summary>How the score is built</summary>
            <ul className="clean small" style={{ marginTop: 8 }}>
              {a.components.map((x, i) => <li key={i} className="row" style={{ justifyContent: "space-between" }}>
                <span>{x.label} <span className="faint">({x.kind.replace("_", " ")})</span></span><span className="mono">{x.weight.toFixed(2)}</span></li>)}
            </ul>
            <p className="xsmall faint">Weights combine with a noisy-OR: each one closes part of the remaining gap to 100. The language-model similarity is shown separately and never changes the score.</p>
          </details>
        </div>
      )}

      {a && (
        <section aria-labelledby="chain-h">
          <div className="panel-label" style={{ alignItems: "baseline" }}><h3 id="chain-h" style={{ margin: 0, whiteSpace: "nowrap" }}>Attack chain</h3>
            <span className="small muted" style={{ textAlign: "right" }}>{a.order.note}</span></div>
          <AttackChain a={a} />
        </section>
      )}

      <AddEvidence caseId={c.id} onApplied={applied} onError={setError} />
      {error && <div className="alert error" role="alert">{error}</div>}

      {a && (
        <div className="grid2">
          <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
            <h3 style={{ margin: 0 }}>What to do</h3>
            <ul className="clean recs">{a.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
          <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
            <h3 style={{ margin: 0 }}>Uncertainty and gaps</h3>
            {a.uncertainty.reasons.length > 0 ? <ul className="clean arrows small">{a.uncertainty.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              : <p className="small muted" style={{ margin: 0 }}>No specific uncertainty flags.</p>}
            {a.conflicts.length > 0 && <><span className="label-caps">Conflicting evidence</span>
              <ul className="clean arrows small">{a.conflicts.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
            {a.missing_evidence.length > 0 && <><span className="label-caps">Not known yet</span>
              <ul className="clean arrows small">{a.missing_evidence.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
            {a.model_signal && <p className="xsmall faint" style={{ margin: 0 }}>Language model similarity (separate, uncalibrated): {Math.round(a.model_signal.max_probability * 100)}%. {a.model_signal.note}</p>}
          </div>
        </div>
      )}

      {c.events.length > 0 && (
        <div className="card">
          <div className="panel-label"><h3 style={{ margin: 0 }}>Evidence</h3><span className="label-caps">Stored redacted · codes, numbers and e-mails removed</span></div>
          <ol className="evidence-list">
            {c.events.map((e) => (
              <li key={e.id}>
                <div className="row">
                  <span className="mono xsmall">#{e.seq}</span>
                  <span className="badge neutral">{e.kind === "url" ? "Link" : e.kind === "screenshot" ? "Screenshot" : "Message"}</span>
                  <span className="small muted">{CHANNEL_LABELS[e.channel]}{e.observed_at ? ` · received ${new Date(e.observed_at).toLocaleString()}` : ""}</span>
                  {e.source === "demo_fixture" && <span className="badge medium">Fixture input</span>}
                  <span className="spacer" />
                  <button className="btn ghost small" onClick={() => removeEvidence(e.id, e.seq)} aria-label={`Remove evidence ${e.seq}`}>Remove</button>
                </div>
                <p className="small" style={{ margin: "8px 0", wordBreak: "break-word" }}>{e.excerpt || <span className="muted">(no readable text)</span>}</p>
                {e.media && <p className="xsmall faint" style={{ margin: 0 }}>Screenshot not stored · {e.media.width}×{e.media.height} {e.media.mime} · SHA-256 {e.media.sha256.slice(0, 16)}… · OCR {e.media.ocr_status}{e.media.ocr_confidence != null ? ` (${e.media.ocr_confidence}/100)` : ""}</p>}
                {e.detection.tactics.length > 0 && <div className="tags" style={{ marginTop: 6 }}>{e.detection.tactics.map((t) => <span key={t.code} className="tag">{t.title}</span>)}</div>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {c.log.length > 0 && (
        <div className="card">
          <div className="panel-label"><h3 style={{ margin: 0 }}>Audit trail</h3><span className="label-caps">Alerts, suppressions and changes</span></div>
          <ul className="clean audit">
            {c.log.map((l) => (
              <li key={l.id}>
                <span className="mono xsmall faint">{parseTime(l.at).toLocaleString()}</span>
                {l.alert_action ? <span className={`badge ${ALERT_TONE[l.alert_action] ?? "neutral"}`}>{ALERT_LABELS[l.alert_action]}</span>
                  : <span className="badge neutral">{l.action.replace(/_/g, " ")}</span>}
                <span className="small muted">{(l.detail?.reason as string) ?? (l.action === "evidence_added" ? `Evidence #${l.detail?.seq} added` : "")}</span>
                {l.risk_score != null && <span className="mono xsmall">{l.risk_score}/100</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AddEvidence({ caseId, onApplied, onError }: {
  caseId: string; onApplied: (c: CaseDetail, a: AlertDecision, lines: string[]) => void; onError: (m: string | null) => void;
}) {
  const [mode, setMode] = useState<"message" | "url" | "screenshot">("message");
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("unknown");
  const [when, setWhen] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setBusy(true);
    try {
      if (mode === "screenshot") {
        if (!file) throw new ApiError(0, "Choose a screenshot first.");
        const r = await api.forensicScreenshot(file, caseId, channel);
        if (!r.case_update) throw new ApiError(0, r.status_detail);
        onApplied(await api.getCase(caseId), r.case_update.alert, r.case_update.change.explanation);
      } else {
        const observed_at = when ? new Date(when).toISOString() : null;
        const r = await api.addEvidence(caseId, { kind: mode, content: mode === "url" ? text.trim() : text, channel, observed_at });
        onApplied(r.case, r.alert, r.change.explanation);
      }
      setText(""); setWhen(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      onError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const can = mode === "screenshot" ? !!file : text.trim().length > 0;
  return (
    <form className="card glow stack" onSubmit={submit} aria-busy={busy} style={{ ["--gap" as string]: "14px" }}>
      <div className="panel-label" style={{ marginBottom: 0 }}>
        <h3 style={{ margin: 0 }}>Add evidence</h3>
        <div className="tabs" role="tablist" aria-label="Evidence type">
          {(["message", "url", "screenshot"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
              {m === "message" ? "Message" : m === "url" ? "Link" : "Screenshot"}
            </button>
          ))}
        </div>
      </div>
      {mode === "screenshot" ? (
        <div>
          <label htmlFor="ev-file">Screenshot (PNG, JPEG or WebP, up to 5 MB). Read locally with OCR; the image itself is not stored.</label>
          <input id="ev-file" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="ev-text" className="sr-only">{mode === "url" ? "Link" : "Message"}</label>
          {mode === "url"
            ? <input id="ev-text" type="text" inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://… (never opened)" />
            : <textarea id="ev-text" maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the next message, or describe what a caller said" style={{ minHeight: 110 }} />}
        </div>
      )}
      <div className="row">
        <label htmlFor="ev-ch" className="small muted" style={{ margin: 0 }}>Channel</label>
        <select id="ev-ch" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ width: "auto" }}>
          {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {mode !== "screenshot" && <>
          <label htmlFor="ev-when" className="small muted" style={{ margin: 0 }}>Received (optional)</label>
          <input id="ev-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ width: "auto" }} />
        </>}
        <span className="spacer" />
        <button className="btn primary" type="submit" disabled={!can || busy}>
          {busy ? <><span className="spin" aria-hidden="true" />Re-evaluating…</> : <>Add and re-evaluate <span className="arrow" aria-hidden="true">→</span></>}
        </button>
      </div>
      <p className="xsmall faint" style={{ margin: 0 }}>Leave “received” empty if you don&apos;t know it: the chain will say the order is unconfirmed rather than guess.</p>
    </form>
  );
}

function ScenarioPlayer({ c, sc, onApplied }: { c: CaseDetail; sc: DemoScenario; onApplied: (c: CaseDetail, a: AlertDecision, l: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{ matches: boolean; problems: string[] } | null>(null);
  const done = c.events.filter((e) => e.source === "demo_fixture").length;
  const next = sc.events[done];

  useEffect(() => {
    if (done >= sc.events.length) api.checkScenario(sc.key, c.id).then(setCheck).catch(() => setCheck(null));
  }, [done, sc, c.id]);

  async function step() {
    if (!next) return;
    setBusy(true);
    try {
      const r = await api.addEvidence(c.id, { kind: next.kind, content: next.content, channel: next.channel });
      onApplied(r.case, r.alert, r.change.explanation);
    } finally { setBusy(false); }
  }
  async function resend() {
    const first = sc.events[0];
    setBusy(true);
    try {
      const r = await api.addEvidence(c.id, { kind: first.kind, content: first.content, channel: first.channel });
      onApplied(r.case, r.alert, r.change.explanation);
    } finally { setBusy(false); }
  }

  return (
    <div className="card fixture">
      <div className="row">
        <span className="badge medium">Fixture playback</span>
        <span className="small muted">Inputs are scripted DEMO DATA. Every step is analysed live by the engine; nothing is replayed.</span>
      </div>
      <div className="fixture-steps">
        {sc.events.map((e, i) => (
          <div key={i} className={`fx ${i < done ? "done" : i === done ? "next" : ""}`}>
            <span className="mono xsmall">STEP {i + 1}</span>
            <strong className="small">{e.note}</strong>
            <span className="xsmall muted">{CHANNEL_LABELS[e.channel]} · {e.kind}</span>
          </div>
        ))}
      </div>
      <div className="row">
        {next ? (
          <button className="btn primary" onClick={step} disabled={busy}>{busy ? <><span className="spin" aria-hidden="true" />Analysing…</> : <>Add step {done + 1}: {next.note} <span className="arrow" aria-hidden="true">→</span></>}</button>
        ) : (
          <button className="btn secondary" onClick={resend} disabled={busy}>Resubmit step 1 unchanged (duplicate test)</button>
        )}
        <span className="spacer" />
        <span className="small muted">Expected: {LEVEL_LABEL[sc.expected.risk_level]}{sc.expected.tactics_include.length ? `, with ${sc.expected.tactics_include.length} key tactics` : ""}</span>
        {check && <span className={`badge ${check.matches ? "low" : "high"}`}>{check.matches ? "Live result matches fixture" : "Differs: " + check.problems.join("; ")}</span>}
      </div>
    </div>
  );
}
