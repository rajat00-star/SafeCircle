"use client";
import { useEffect, useRef, useState } from "react";
import ResultView from "@/components/ResultView";
import { api, ApiError, type Analysis } from "@/lib/api";
import { EXAMPLES } from "@/lib/examples";

export default function CheckPage() {
  const [mode, setMode] = useState<"message" | "url">("message");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ r: Analysis; input: string } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.modelCard().then((m) => setAiAvailable(m.ai_explanations_enabled)).catch(() => setAiAvailable(false));
    // The browser extension opens this page with ?text= or ?url= prefilled.
    const p = new URLSearchParams(window.location.search);
    const t = p.get("text"), u = p.get("url");
    if (t) { setMode("message"); setText(t.slice(0, 5000)); }
    else if (u) { setMode("url"); setUrl(u.slice(0, 2048)); }
  }, []);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = mode === "message" ? text : url.trim();
      const r = mode === "message" ? await api.analyzeMessage(input, useAi && aiAvailable) : await api.analyzeUrl(input);
      setResult({ r, input });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function loadExample(i: number) {
    const ex = EXAMPLES[i];
    setMode(ex.kind);
    if (ex.kind === "message") setText(ex.text); else setUrl(ex.text);
    setResult(null);
  }

  const canSubmit = mode === "message" ? text.trim().length > 0 : url.trim().length >= 3;

  return (
    <div className="stack">
      <div>
        <h1>Is this a scam?</h1>
        <p className="lead">Paste a message, email or link. SafeCircle shows the warning signs it finds, explains them in plain language and tells you what to do next. Links are never opened.</p>
      </div>

      <form className="card" onSubmit={run}>
        <div className="tabs" role="tablist" aria-label="What do you want to check?">
          <button type="button" role="tab" aria-selected={mode === "message"} onClick={() => setMode("message")}>Message</button>
          <button type="button" role="tab" aria-selected={mode === "url"} onClick={() => setMode("url")}>Link</button>
        </div>
        {mode === "message" ? (
          <div>
            <label htmlFor="msg">Message text</label>
            <textarea id="msg" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)}
              placeholder="Paste the SMS, WhatsApp, email or chat message here" />
            <div className="small muted" style={{ textAlign: "right" }}>{text.length}/5000</div>
          </div>
        ) : (
          <div>
            <label htmlFor="url">Link</label>
            <input id="url" type="text" inputMode="url" autoComplete="off" spellCheck={false} value={url}
              onChange={(e) => setUrl(e.target.value)} placeholder="https://…" maxLength={2048} />
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" type="submit" disabled={!canSubmit || busy}>{busy ? "Checking…" : "Check now"}</button>
          <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400, margin: 0 }}>
            <select aria-label="Load an example" defaultValue="" onChange={(e) => { if (e.target.value !== "") loadExample(Number(e.target.value)); e.target.value = ""; }}
              style={{ width: "auto" }}>
              <option value="" disabled>Try an example…</option>
              {EXAMPLES.map((ex, i) => <option key={i} value={i}>{ex.label}</option>)}
            </select>
          </label>
          {mode === "message" && aiAvailable && (
            <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400, margin: 0 }}>
              <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
              Add an AI-written summary (sends a redacted excerpt to the AI provider)
            </label>
          )}
          <span className="spacer" />
          {(text || url || result) && (
            <button type="button" className="btn ghost" onClick={() => { setText(""); setUrl(""); setResult(null); setError(null); }}>Clear</button>
          )}
        </div>
        {error && <div className="alert error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      </form>

      {!result && (
        <div className="hero-strip">
          <div><strong>Explains every warning</strong>Highlights the exact words: urgency, OTP requests, threats, secrecy, fake brands.</div>
          <div><strong>Private by default</strong>Nothing you paste is stored unless you turn on history, and links are never opened.</div>
          <div><strong>Loop in someone you trust</strong>Send a summary to a family member who has agreed to help.</div>
        </div>
      )}

      <div ref={resultRef}>{result && <ResultView result={result.r} input={result.input} />}</div>
    </div>
  );
}
