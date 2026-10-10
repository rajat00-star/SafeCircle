"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ResultView from "@/components/ResultView";
import { api, ApiError, type Analysis } from "@/lib/api";
import { EXAMPLES } from "@/lib/examples";

export type ScanRequest = { mode: "message" | "url"; value: string };
export const SCAN_EVENT = "safecircle:scan";

const LEVEL_WORD = { low: "Low risk", medium: "Suspicious", high: "High risk" } as const;

// The analysis workspace. Business logic is unchanged from the original check page:
// same API calls, same limits, same ?text= / ?url= prefill used by the browser extension.
export default function Analyzer() {
  const [mode, setMode] = useState<"message" | "url">("message");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ r: Analysis; input: string; n: number } | null>(null);
  const [announce, setAnnounce] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const runs = useRef(0);

  const runWith = useCallback(async (m: "message" | "url", raw: string, ai: boolean) => {
    const input = m === "message" ? raw : raw.trim();
    if (m === "message" ? !input.trim() : input.length < 3) {
      setError(m === "message" ? "Paste the message you want to check." : "Enter a link of at least 3 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setAnnounce("Analysing…");
    try {
      const r = m === "message" ? await api.analyzeMessage(input, ai) : await api.analyzeUrl(input);
      runs.current += 1;
      setResult({ r, input, n: runs.current });
      setAnnounce(`Analysis complete. ${LEVEL_WORD[r.risk_level]}, score ${r.risk_score} out of 100. ${r.verdict}`);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (err) {
      setError((err as ApiError).message);
      setAnnounce("");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    api.modelCard().then((m) => setAiAvailable(m.ai_explanations_enabled)).catch(() => setAiAvailable(false));
    // The browser extension opens this page with ?text= or ?url= prefilled.
    const p = new URLSearchParams(window.location.search);
    const t = p.get("text"), u = p.get("url");
    if (t) { setMode("message"); setText(t.slice(0, 5000)); }
    else if (u) { setMode("url"); setUrl(u.slice(0, 2048)); }
    if (t || u) setTimeout(() => sectionRef.current?.scrollIntoView({ block: "start" }), 80);
  }, []);

  // Entry point used by the landing page's scan rail.
  useEffect(() => {
    const on = (e: Event) => {
      const { mode: m, value } = (e as CustomEvent<ScanRequest>).detail;
      setMode(m);
      if (m === "message") setText(value.slice(0, 5000)); else setUrl(value.slice(0, 2048));
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      runWith(m, m === "message" ? value.slice(0, 5000) : value.slice(0, 2048), false);
    };
    window.addEventListener(SCAN_EVENT, on);
    return () => window.removeEventListener(SCAN_EVENT, on);
  }, [runWith]);

  function run(e?: React.FormEvent) {
    e?.preventDefault();
    runWith(mode, mode === "message" ? text : url, useAi && aiAvailable);
  }

  function loadExample(i: number) {
    const ex = EXAMPLES[i];
    setMode(ex.kind);
    if (ex.kind === "message") setText(ex.text); else setUrl(ex.text);
    setResult(null);
    setError(null);
  }

  const canSubmit = mode === "message" ? text.trim().length > 0 : url.trim().length >= 3;

  return (
    <section id="analyze" ref={sectionRef} className="section tight" aria-labelledby="analyze-title" style={{ scrollMarginTop: 72 }}>
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">01 / Analysis workspace</span>
            <h2 id="analyze-title" className="glow">Is this<br />a scam?</h2>
          </div>
          <p>Paste a message, email or link. SafeCircle shows the warning signs it finds, explains them in plain language and tells you what to do next. Links are never opened.</p>
        </div>

        <div className="workspace">
          <form className={`card glow scan-box${busy ? " busy" : ""}`} onSubmit={run} aria-busy={busy}>
            <div className="panel-label">
              <div className="tabs" role="tablist" aria-label="What do you want to check?">
                <button type="button" role="tab" aria-selected={mode === "message"} onClick={() => { setMode("message"); setError(null); }}>Message</button>
                <button type="button" role="tab" aria-selected={mode === "url"} onClick={() => { setMode("url"); setError(null); }}>Link</button>
              </div>
              <span className="label-caps">{mode === "message" ? "Text analysis" : "Static URL inspection"}</span>
            </div>
            <p className="mode-note">
              {mode === "message"
                ? "Checks the wording for pressure tactics and inspects any links inside it."
                : "Reads the address only: look-alike brands, odd domains, shorteners. The page is never visited."}
            </p>
            {mode === "message" ? (
              <div className="field">
                <label htmlFor="msg" className="sr-only">Message text</label>
                <textarea id="msg" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the SMS, WhatsApp, email or chat message here" />
                <span className="count" aria-hidden="true">{text.length}/5000</span>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="url" className="sr-only">Link</label>
                <input id="url" type="text" inputMode="url" autoComplete="off" spellCheck={false} value={url}
                  onChange={(e) => setUrl(e.target.value)} placeholder="https://…" maxLength={2048} />
              </div>
            )}
            <div className="controls">
              <button className="btn primary" type="submit" disabled={!canSubmit || busy}>
                {busy ? <><span className="spin" aria-hidden="true" />Analysing…</> : <>Analyze now <span className="arrow" aria-hidden="true">→</span></>}
              </button>
              <select aria-label="Load an example" defaultValue="" onChange={(e) => { if (e.target.value !== "") loadExample(Number(e.target.value)); e.target.value = ""; }}>
                <option value="" disabled>Try an example…</option>
                {EXAMPLES.map((ex, i) => <option key={i} value={i}>{ex.label}</option>)}
              </select>
              <span className="spacer" />
              {(text || url || result) && (
                <button type="button" className="btn ghost" onClick={() => { setText(""); setUrl(""); setResult(null); setError(null); setAnnounce(""); }}>Clear</button>
              )}
            </div>
            {mode === "message" && aiAvailable && (
              <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, margin: "14px 0 0" }}>
                <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                Add an AI-written summary (sends a redacted excerpt to the AI provider)
              </label>
            )}
            <p className="hint">Examples are written by the SafeCircle team for demonstration. They contain no real numbers or links.</p>
            {error && <div className="alert error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
          </form>

          <aside className="card side-facts" aria-label="What happens to what you paste">
            <span className="label-caps" style={{ marginBottom: 6 }}>What happens when you press analyze</span>
            <div className="fact"><strong>Analysed on the SafeCircle server</strong><span>Your text goes to the API, is checked in memory and discarded unless you turned on history.</span></div>
            <div className="fact"><strong>Every warning is explained</strong><span>Highlights the exact words: urgency, OTP requests, threats, secrecy, fake brands.</span></div>
            <div className="fact"><strong>Links are never opened</strong><span>The address is inspected as text, so the sender can't tell you checked it.</span></div>
            <div className="fact"><strong>Loop in someone you trust</strong><span>Send a summary to a contact who has agreed to help. Only if you choose to.</span></div>
          </aside>
        </div>

        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        <div ref={resultRef} className="result" style={{ marginTop: result ? 28 : 0 }}>
          {result && <ResultView key={result.n} result={result.r} input={result.input} />}
        </div>
      </div>
    </section>
  );
}
