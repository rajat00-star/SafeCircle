"use client";
import { useEffect, useRef, useState } from "react";
import Gauge from "@/components/Gauge";
import PageHeader from "@/components/PageHeader";
import { ALERT_LABELS, api, ApiError, getToken, STAGE_TITLES, type CaseSummary, type UpiCheck } from "@/lib/api";

const LEVEL_LABEL = { low: "No warning signs", medium: "Warning signs", high: "Strong warning signs" } as const;
const BASIS = { observed: ["low", "In the request"], heuristic: ["neutral", "Heuristic"], your_cases: ["medium", "Your cases"] } as const;
// Synthetic DEMO DATA written by the SafeCircle team; the handles are not real.
const DEMO_SCAM = "upi://pay?pa=sbi.refund@ybl&pn=SBI%20Refund%20Desk&am=4999&cu=INR&tn=Scan%20to%20receive%20your%20refund";
const DEMO_SCAM_MSG = "Dear customer, SBI has approved your refund of Rs 4999. Scan the QR and enter your UPI PIN to receive it within 10 minutes.";
const DEMO_QR = "/demo/demo-upi-qr.png"; // encodes DEMO_SCAM
const DEMO_SHOP = "upi://pay?pa=ravistores@okicici&pn=Ravi%20Stores&am=120&cu=INR";

type Detector = { detect: (src: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

async function qrDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = BD.getSupportedFormats ? await BD.getSupportedFormats() : ["qr_code"];
    return formats.includes("qr_code") ? new BD({ formats: ["qr_code"] }) : null;
  } catch { return null; }
}

export default function UpiGuardPage() {
  const [input, setInput] = useState("");
  const [context, setContext] = useState("");
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [caseId, setCaseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrNote, setQrNote] = useState<string | null>(null);
  const [qrSupported, setQrSupported] = useState<boolean | null>(null);
  const [result, setResult] = useState<UpiCheck | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (getToken()) api.cases().then((c) => setCases(c.filter((x) => x.status !== "closed"))).catch(() => setCases(null));
    qrDetector().then((d) => setQrSupported(!!d));
  }, []);

  async function demoQr() {
    try {
      const b = await (await fetch(DEMO_QR)).blob();
      setContext(DEMO_SCAM_MSG);
      await readQr(new File([b], "demo-upi-qr.png", { type: "image/png" }));
    } catch { setError("Couldn't load the demo QR image."); }
  }

  async function readQr(file: File | undefined) {
    setQrNote(null); setError(null);
    if (!file) return;
    if (file.size > 5_000_000) { setError("QR images must be smaller than 5 MB."); return; }
    const det = await qrDetector();
    if (!det) { setQrNote("This browser cannot read QR codes on the device. Use your phone's camera to read the code, then paste the upi:// link here."); return; }
    try {
      const bmp = await createImageBitmap(file);
      const codes = await det.detect(bmp);
      bmp.close();
      const upi = codes.map((c) => c.rawValue).find((v) => /^upi:/i.test(v.trim()));
      if (upi) { setInput(upi.trim()); setQrNote("QR code read on this device. The image was not uploaded."); }
      else if (codes.length) setQrNote("A QR code was found, but it does not contain a UPI payment link, so there is nothing to check here.");
      else setQrNote("No QR code was found in that image. Try a sharper, uncropped picture.");
    } catch { setQrNote("That image could not be read."); }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.upiCheck(input.trim(), context.trim(), caseId || null);
      setResult(r);
      if (r.case_update) api.cases().then((c) => setCases(c.filter((x) => x.status !== "closed"))).catch(() => undefined);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setResult(null);
      setError((err as ApiError).message);
    } finally { setBusy(false); }
  }

  return (
    <div className="container stack-lg">
      <PageHeader index="04 / UPI Guard" eyebrow="Before you pay · UPI IDs · payment QR codes" title={"UPI scam\nguard"}
        lead="Check a UPI ID or a payment QR before you pay. SafeCircle reads the payee, amount and note, checks the message that came with it, and looks for the same UPI ID in your own investigations. It never sees, blocks or approves a real payment." />

      <form className="card glow stack" onSubmit={run} aria-busy={busy} style={{ ["--gap" as string]: "14px" }}>
        <div className="panel-label" style={{ marginBottom: 0 }}>
          <h3 style={{ margin: 0 }}>What are you being asked to pay?</h3>
          <span className="label-caps">Static check · no bank or NPCI lookup</span>
        </div>
        <div>
          <label htmlFor="upi-in">UPI ID or payment link</label>
          <input id="upi-in" type="text" spellCheck={false} autoComplete="off" maxLength={2048} value={input}
            onChange={(e) => setInput(e.target.value)} placeholder="name@bank or upi://pay?pa=…" />
        </div>
        <div className="row">
          <label htmlFor="upi-qr" className="small muted" style={{ margin: 0 }}>Or read a QR image on this device</label>
          <input id="upi-qr" type="file" accept="image/png,image/jpeg,image/webp" style={{ width: "auto" }}
            onChange={(e) => readQr(e.target.files?.[0])} />
          {qrSupported === false && <span className="xsmall faint">This browser cannot decode QR codes; paste the link instead.</span>}
        </div>
        {qrNote && <div className="alert info" role="status">{qrNote}</div>}
        <div className="field">
          <label htmlFor="upi-ctx">The message that came with it (optional, makes the check much stronger)</label>
          <textarea id="upi-ctx" value={context} maxLength={5000} onChange={(e) => setContext(e.target.value)} style={{ minHeight: 90 }} />
        </div>
        <div className="row">
          {cases && (
            <>
              <label htmlFor="upi-case" className="small muted" style={{ margin: 0 }}>Add to</label>
              <select id="upi-case" value={caseId} onChange={(e) => setCaseId(e.target.value)} style={{ width: "auto", maxWidth: 280 }}>
                <option value="">No case (don&apos;t store)</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.is_demo ? "[DEMO] " : ""}{c.title}</option>)}
              </select>
            </>
          )}
          <span className="spacer" />
          <button className="btn primary" type="submit" disabled={input.trim().length < 3 || busy}>
            {busy ? <><span className="spin" aria-hidden="true" />Checking…</> : <>Check before paying <span className="arrow" aria-hidden="true">→</span></>}
          </button>
        </div>
        <div className="row">
          <span className="small muted">Try:</span>
          <button type="button" className="btn ghost small" onClick={() => { setInput(DEMO_SCAM); setContext(DEMO_SCAM_MSG); }}>Refund QR scam</button>
          <button type="button" className="btn ghost small" onClick={demoQr}>Refund QR image</button>
          <button type="button" className="btn ghost small" onClick={() => { setInput(DEMO_SHOP); setContext(""); }}>Shop QR</button>
          <button type="button" className="btn ghost small" onClick={() => { setInput("hdfc.customer.care@ybl"); setContext(""); }}>“Customer care” UPI ID</button>
          <span className="xsmall faint">Examples are synthetic DEMO DATA; the UPI IDs are made up.</span>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
      </form>

      <div ref={resultRef} style={{ scrollMarginTop: 96 }}>{result && <UpiResult r={result} />}</div>
    </div>
  );
}

function UpiResult({ r }: { r: UpiCheck }) {
  const p = r.parsed;
  return (
    <section className="stack fade-up" aria-label="UPI check result">
      <div className={`card risk-head ${r.risk_level}`}>
        <Gauge score={r.risk_score} level={r.risk_level} />
        <div className="stack" style={{ minWidth: 0, ["--gap" as string]: "12px" }}>
          <div className="row">
            <span className={`badge ${r.risk_level}`}>{LEVEL_LABEL[r.risk_level]}</span>
            {r.review_required && <span className="badge medium">Needs review</span>}
            <span className={`badge ${r.uncertainty.level === "low" ? "neutral" : r.uncertainty.level}`}>Uncertainty: {r.uncertainty.level}</span>
          </div>
          <h3 className="verdict" style={{ margin: 0 }}>{r.verdict}</h3>
          <p className="small" style={{ margin: 0 }}>{r.primary_action}</p>
          <p className="xsmall faint" style={{ margin: 0 }}>{r.score_label}</p>
          {r.case_update && (
            <div className="alert info">
              <strong>{r.case_update.duplicate ? "Already in the case:" : "Added to case:"}</strong>{" "}
              {ALERT_LABELS[r.case_update.alert.action]}: {r.case_update.alert.reason}{" "}
              <a href={`/cases/?id=${r.case_update.case_id}`}>Open the attack chain →</a>
            </div>
          )}
        </div>
      </div>

      <div className="grid2">
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <div className="panel-label" style={{ marginBottom: 0 }}><h3 style={{ margin: 0 }}>Request details</h3><span className="label-caps">{p.kind === "upi_link" ? `upi://${p.link_type}` : "UPI ID only"}</span></div>
          <dl className="facts">
            <div><dt>Payee UPI ID</dt><dd className="mono">{p.handle_masked}</dd></div>
            <div><dt>Handle suffix</dt><dd className="mono">@{p.psp}{p.psp_known ? "" : " (not in our list)"}</dd></div>
            {p.payee_name && <div><dt>Payee name shown</dt><dd>{p.payee_name}</dd></div>}
            {p.amount && <div><dt>You would pay</dt><dd className="mono">₹{p.amount}</dd></div>}
            {p.note && <div><dt>Note</dt><dd>{p.note}</dd></div>}
          </dl>
          <p className="xsmall faint" style={{ margin: 0 }}>{r.retention} The UPI ID is shown masked.</p>
        </div>
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <div className="panel-label" style={{ marginBottom: 0 }}><h3 style={{ margin: 0 }}>Warning signs</h3><span className="label-caps">{r.signals.length} found</span></div>
          {r.signals.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Nothing unusual in the request itself.</p> : (
            <ul className="clean stack" style={{ ["--gap" as string]: "10px" }}>
              {r.signals.map((s, i) => (
                <li key={i}>
                  <div className="row"><span className={`badge ${BASIS[s.basis][0]}`}>{BASIS[s.basis][1]}</span><strong className="small">{s.title}</strong></div>
                  <p className="small muted" style={{ margin: "4px 0 0" }}>{s.detail}</p>
                </li>
              ))}
            </ul>
          )}
          {r.case_matches.length > 0 && (
            <>
              <span className="label-caps">Same UPI ID in your investigations</span>
              <ul className="clean small">
                {r.case_matches.map((m) => <li key={m.case_id} className="row"><span className={`risk-pill small ${m.risk_level}`}>{m.risk_level[0].toUpperCase()}</span>
                  {m.is_demo && <span className="badge medium">DEMO</span>}<a href={`/cases/?id=${m.case_id}`}>{m.title}</a></li>)}
              </ul>
            </>
          )}
        </div>
      </div>

      {r.tactics.length > 0 && (
        <div className="card">
          <div className="panel-label"><h3 style={{ margin: 0 }}>Scam tactics</h3><span className="label-caps">From the request and its message</span></div>
          <div className="tactic-grid">
            {r.tactics.map((t) => (
              <div className="cat" key={t.code}>
                <div className="row"><span className="label-caps">{STAGE_TITLES[t.stage]}</span><span className="spacer" />
                  <span className={`badge ${t.severity >= 0.5 ? "high" : t.severity >= 0.3 ? "medium" : "low"}`}>{t.severity.toFixed(2)}</span></div>
                <h4 style={{ margin: "8px 0" }}>{t.title}</h4>
                <div className="ev">{t.evidence.map((e, i) => <span className="chip" key={i}>{e.text}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <h3 style={{ margin: 0 }}>What to do</h3>
          <ul className="clean recs">{r.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <h3 style={{ margin: 0 }}>What this check cannot tell you</h3>
          <ul className="clean arrows small">{r.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {r.uncertainty.reasons.length > 0 && <ul className="clean arrows small">{r.uncertainty.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </div>
      </div>
    </section>
  );
}
