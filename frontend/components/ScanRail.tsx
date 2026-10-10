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
    const targets = ["#hero", "#analyze", "footer.site"].map((s) => document.querySelector(s)).filter(Boolean) as Element[];
    const vis = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => vis.set(e.target, e.isIntersecting));
      setHidden([...vis.values()].some(Boolean));
    }, { threshold: 0.12 });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
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
