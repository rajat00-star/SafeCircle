"use client";
import { useEffect, useState } from "react";
import { SCAN_EVENT, type ScanRequest } from "./Analyzer";

const looksLikeUrl = (v: string) => /^\S+$/.test(v) && (/^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v));

// Fixed bottom-left rail (reference layout): a short list and a pill input that hands the
// text to the real analysis workspace. Hidden over the hero, the workspace itself and the footer.
export default function ScanRail() {
  const [value, setValue] = useState("");
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Hidden over the hero, the workspace, the tactic scene and the footer (checked on scroll, so
    // sections that mount later are included).
    let raf = 0;
    const check = () => {
      raf = 0;
      const vh = window.innerHeight;
      const over = ["#hero", "#analyze", ".tactic-sticky", "footer.site"].some((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return Math.min(r.bottom, vh) - Math.max(r.top, 0) > vh * 0.12;
      });
      setHidden(over);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    const detail: ScanRequest = { mode: looksLikeUrl(v) ? "url" : "message", value: v };
    window.dispatchEvent(new CustomEvent(SCAN_EVENT, { detail }));
    setValue("");
  }

  return (
    <div className={`scan-rail${hidden ? " hidden" : ""}`} aria-hidden={hidden || undefined}>
      <div className="rail-list">
      <p className="label-caps" style={{ margin: "0 0 10px" }}>What looks wrong?</p>
      <ul className="arrows caps">
        <li>Urgent bank or KYC warnings</li>
        <li>Requests for an OTP or PIN</li>
        <li>&quot;Hi Mum, new number&quot;</li>
        <li>Look-alike links</li>
        <li>Remote-access app requests</li>
      </ul>
      </div>
      <form onSubmit={submit} role="search" aria-label="Quick scan">
        <label htmlFor="rail-input" className="sr-only">Paste a message or link to analyze</label>
        <input id="rail-input" type="text" value={value} maxLength={5000} onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a message or link…" autoComplete="off" tabIndex={hidden ? -1 : 0} />
        <button className="go" type="submit" disabled={!value.trim()} aria-label="Analyze" tabIndex={hidden ? -1 : 0}>→</button>
      </form>
    </div>
  );
}
