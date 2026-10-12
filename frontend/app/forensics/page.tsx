"use client";
import { useEffect, useRef, useState } from "react";
import Gauge from "@/components/Gauge";
import PageHeader from "@/components/PageHeader";
import { ALERT_LABELS, api, ApiError, CHANNEL_LABELS, getToken, STAGE_TITLES, type CaseSummary, type ForensicsReport } from "@/lib/api";

const LEVEL_LABEL = { low: "Low risk", medium: "Suspicious", high: "High risk" } as const;
const STATUS_TONE = { completed: "low", partial: "medium", unavailable: "high" } as const;
const STATUS_WORD = { completed: "Analysis completed", partial: "Partial analysis", unavailable: "Analysis unavailable" } as const;
const DEMO_SHOT = "/demo/scam-sms-demo.png";
const CONVO_EXAMPLE = "Agent: Dear SBI customer, your KYC is pending and your account will be blocked today.\nMe: What do I need to do?\nAgent: Update at http://sbi-kyc-update.example/kyc/login and share the OTP you receive.\nAgent: Then approve the collect request in your UPI app to confirm.";

export default function ForensicsPage() {
  const [mode, setMode] = useState<"text" | "url" | "screenshot">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [channel, setChannel] = useState("unknown");
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [caseId, setCaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ForensicsReport | null>(null);
  const [submitted, setSubmitted] = useState<{ kind: string; text?: string; image?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (getToken()) api.cases().then((c) => setCases(c.filter((x) => x.status !== "closed"))).catch(() => setCases(null));
    const p = new URLSearchParams(window.location.search).get("case");
    if (p) setCaseId(p);
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function pick(f: Blob | null, name = "") {
    setFile(f); setFileName(name);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return f ? URL.createObjectURL(f) : null; });
  }
  async function useDemoShot() {
    setError(null);
    try {
      const r = await fetch(DEMO_SHOT);
      pick(await r.blob(), "scam-sms-demo.png (DEMO DATA)");
      setMode("screenshot");
    } catch { setError("Couldn't load the demo screenshot."); }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      let r: ForensicsReport;
      if (mode === "text") { r = await api.forensicText(text, caseId || null, channel); setSubmitted({ kind: "text", text }); }
      else if (mode === "url") { r = await api.forensicUrl(url.trim(), caseId || null); setSubmitted({ kind: "url", text: url.trim() }); }
      else {
        if (!file) throw new ApiError(0, "Choose a screenshot first.");
        if (file.size > 5_000_000) throw new ApiError(413, "Screenshots must be smaller than 5 MB.");
        r = await api.forensicScreenshot(file, caseId || null, channel);
        setSubmitted({ kind: "screenshot", image: preview ?? undefined });
      }
      setReport(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setError((err as ApiError).message);
    } finally { setBusy(false); }
  }

  const can = mode === "text" ? text.trim().length > 0 : mode === "url" ? url.trim().length >= 3 : !!file;
  return (
    <div className="container stack-lg">
      <PageHeader index="02 / Forensics" eyebrow="Messages · conversations · links · screenshots" title={"Scam\nforensics"}
        lead="One workspace for every kind of evidence. Text is checked for impersonation, pressure, payment and credential tactics; links are read as text and never opened; screenshots are read on the server with local OCR." />

      <form className="card glow stack" onSubmit={run} aria-busy={busy} style={{ ["--gap" as string]: "14px" }}>
        <div className="panel-label" style={{ marginBottom: 0 }}>
          <div className="tabs" role="tablist" aria-label="Evidence type">
            {([["text", "Message or chat"], ["url", "Link"], ["screenshot", "Screenshot"]] as const).map(([m, l]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{l}</button>
            ))}
          </div>
          <span className="label-caps">{mode === "screenshot" ? "Local OCR · image not stored" : mode === "url" ? "Static inspection · never fetched" : "Rules + link checks + local model"}</span>
        </div>
        {mode === "text" && (
          <div className="field">
            <label htmlFor="fx-text">Paste one message, or a whole chat with one “Name: message” per line to analyse each turn.</label>
            <textarea id="fx-text" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} style={{ minHeight: 160 }} />
            <span className="count" aria-hidden="true">{text.length}/5000</span>
          </div>
        )}
        {mode === "url" && (
          <div><label htmlFor="fx-url">Link</label>
            <input id="fx-url" type="text" inputMode="url" spellCheck={false} autoComplete="off" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
        )}
        {mode === "screenshot" && (
          <div className="shot-pick">
            <div>
              <label htmlFor="fx-file">PNG, JPEG or WebP, up to 5 MB</label>
              <input id="fx-file" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
                onChange={(e) => { const f = e.target.files?.[0] ?? null; pick(f, f?.name ?? ""); }} />
              {fileName && <p className="xsmall muted" style={{ margin: "6px 0 0" }}>Selected: {fileName}</p>}
            </div>
            {preview && <img src={preview} alt="Selected screenshot preview" className="shot-preview" />}
          </div>
        )}
        <div className="row">
          <label htmlFor="fx-ch" className="small muted" style={{ margin: 0 }}>Channel</label>
          <select id="fx-ch" value={channel} onChange={(e) => setChannel(e.target.value)} style={{ width: "auto" }}>
            {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {cases && (
            <>
              <label htmlFor="fx-case" className="small muted" style={{ margin: 0 }}>Add findings to</label>
              <select id="fx-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} style={{ width: "auto", maxWidth: 280 }}>
                <option value="">No case (don&apos;t store)</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.is_demo ? "[DEMO] " : ""}{c.title}</option>)}
              </select>
            </>
          )}
          <span className="spacer" />
          <button className="btn primary" type="submit" disabled={!can || busy}>
            {busy ? <><span className="spin" aria-hidden="true" />Investigating…</> : <>Investigate <span className="arrow" aria-hidden="true">→</span></>}
          </button>
        </div>
        <div className="row">
          <span className="small muted">Try:</span>
          <button type="button" className="btn ghost small" onClick={() => { setMode("text"); setText(CONVO_EXAMPLE); }}>Demo conversation</button>
          <button type="button" className="btn ghost small" onClick={useDemoShot}>Demo screenshot</button>
          <button type="button" className="btn ghost small" onClick={() => { setMode("url"); setUrl("http://sbi-kyc-update.example/kyc/login?ref=sms"); }}>Demo link</button>
          <span className="xsmall faint">Demo inputs are synthetic DEMO DATA written by the SafeCircle team.</span>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
      </form>

      <div ref={resultRef} style={{ scrollMarginTop: 96 }}>
        {report && <Report r={report} submitted={submitted} />}
      </div>
    </div>
  );
}

function Report({ r, submitted }: { r: ForensicsReport; submitted: { kind: string; text?: string; image?: string } | null }) {
  const assessed = r.analysis_status !== "unavailable" && !(r.input_kind === "screenshot" && !r.extracted_text);
  return (
    <section className="stack fade-up" aria-label="Evidence report">
      <div className={`alert ${r.analysis_status === "completed" ? "success" : r.analysis_status === "partial" ? "info" : "error"}`} role="status">
        <span className={`badge ${STATUS_TONE[r.analysis_status]}`}>{STATUS_WORD[r.analysis_status]}</span> {r.status_detail}
      </div>

      {assessed && (
        <div className={`card risk-head ${r.risk_level}`}>
          <Gauge score={r.risk_score} level={r.risk_level} />
          <div className="stack" style={{ minWidth: 0, ["--gap" as string]: "12px" }}>
            <div className="row">
              <span className={`badge ${r.risk_level}`}>{LEVEL_LABEL[r.risk_level]}</span>
              {r.review_required && <span className="badge medium">Needs review</span>}
              <span className={`badge ${r.uncertainty.level === "low" ? "neutral" : r.uncertainty.level}`}>Uncertainty: {r.uncertainty.level}</span>
              <span className="badge neutral">{r.input_kind}</span>
            </div>
            <h3 className="verdict" style={{ margin: 0 }}>{r.primary_action}</h3>
            <p className="xsmall faint" style={{ margin: 0 }}>{r.score_label}</p>
            {r.case_update && (
              <div className="alert info"><strong>Added to case:</strong> {r.case_update.events_added} new, {r.case_update.duplicates} duplicate.{" "}
                {ALERT_LABELS[r.case_update.alert.action]}: {r.case_update.alert.reason}{" "}
                <a href={`/cases/?id=${r.case_update.case_id}`}>Open the attack chain →</a></div>
            )}
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <div className="panel-label" style={{ marginBottom: 0 }}><h3 style={{ margin: 0 }}>Original evidence</h3><span className="label-caps">As submitted</span></div>
          {submitted?.image && <img src={submitted.image} alt="Submitted screenshot" className="shot-preview" />}
          {submitted?.text && <p className="small mono" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{submitted.text}</p>}
          <dl className="facts">
            {Object.entries(r.original).filter(([k]) => !["redacted_text", "retention"].includes(k)).map(([k, v]) => (
              <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd className="mono">{String(v ?? "n/a")}</dd></div>
            ))}
          </dl>
          <p className="xsmall faint" style={{ margin: 0 }}>{String(r.original.retention)} The preview above is only in your browser.</p>
        </div>
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <div className="panel-label" style={{ marginBottom: 0 }}><h3 style={{ margin: 0 }}>{r.input_kind === "screenshot" ? "Extracted text" : "Redacted text"}</h3>
            <span className="label-caps">{r.ocr ? `${r.ocr.engine} · ${r.ocr.mean_confidence ?? "n/a"}/100 · ${r.ocr.word_count} words` : "Secrets removed"}</span></div>
          {r.input_kind === "screenshot"
            ? (r.extracted_text ? <p className="small mono" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.extracted_text}</p>
              : <p className="small muted" style={{ margin: 0 }}>No text could be extracted. {r.ocr?.detail}</p>)
            : <p className="small mono" style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{String(r.original.redacted_text ?? "")}</p>}
          {r.ocr?.notes?.map((n, i) => <p key={i} className="xsmall faint" style={{ margin: 0 }}>{n}</p>)}
        </div>
      </div>

      {assessed && (
        <>
          <div className="card">
            <div className="panel-label"><h3 style={{ margin: 0 }}>Detected tactics</h3><span className="label-caps">{r.tactics.length} found · each with its evidence</span></div>
            {r.tactics.length === 0 ? <p className="muted small">No scam tactics matched. Absence of warning signs is not proof of safety.</p> : (
              <div className="tactic-grid">
                {r.tactics.map((t) => (
                  <div className="cat" key={t.code}>
                    <div className="row"><span className="label-caps">{STAGE_TITLES[t.stage]}</span><span className="spacer" />
                      <span className={`badge ${t.severity >= 0.5 ? "high" : t.severity >= 0.3 ? "medium" : "low"}`}>{t.severity.toFixed(2)}</span></div>
                    <h4 style={{ margin: "8px 0" }}>{t.title}</h4>
                    <div className="ev">{t.evidence.map((e, i) => <span className="chip" key={i}>{e.text}</span>)}</div>
                    {t.basis === "inferred" && <p className="xsmall faint">Inferred across several turns.</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {r.url_indicators.length > 0 && (
            <div className="card">
              <div className="panel-label"><h3 style={{ margin: 0 }}>Link indicators</h3><span className="label-caps">Read as text, never opened</span></div>
              <div className="stack">
                {r.url_indicators.map((u, i) => (
                  <div className="cat" key={i}>
                    <div className="row"><span className="chip">{u.url}</span>
                      <span className={`badge ${u.risk_score >= 60 ? "high" : u.risk_score >= 30 ? "medium" : "low"}`}>{u.risk_score}/100</span></div>
                    {u.registered_domain && <div className="small muted" style={{ marginTop: 8 }}>Real domain: <strong style={{ color: "var(--text)" }}>{u.registered_domain}</strong></div>}
                    {u.signals.length ? <ul className="clean small arrows" style={{ marginTop: 10 }}>{u.signals.map((s) => <li key={s.code}><strong>{s.title}.</strong> <span className="muted">{s.detail}</span></li>)}</ul>
                      : <p className="small muted">No warning signs in the address.</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="grid2">
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <h3 style={{ margin: 0 }}>Recommended action</h3>
          <ul className="clean recs">{r.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <h3 style={{ margin: 0 }}>Uncertainty</h3>
          {r.uncertainty.reasons.length ? <ul className="clean arrows small">{r.uncertainty.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>No specific uncertainty flags.</p>}
          {r.conflicts.length > 0 && <ul className="clean arrows small">{r.conflicts.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {r.missing_evidence.length > 0 && <><span className="label-caps">Not known</span><ul className="clean arrows small">{r.missing_evidence.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {r.model_signal && <p className="xsmall faint" style={{ margin: 0 }}>Language model similarity (not used in the score): {Math.round(r.model_signal.max_probability * 100)}%.</p>}
        </div>
      </div>
    </section>
  );
}
