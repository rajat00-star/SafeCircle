"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { api, type ModelCard } from "@/lib/api";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ROWS: [string, string][] = [
  ["hybrid@30", "Messages: full detector (flag at score ≥ 30)"],
  ["hybrid@60", "Messages: full detector (flag at score ≥ 60, 'high risk')"],
  ["ml_only@0.5", "Messages: language model only"],
  ["rules_only@30", "Messages: tactic rules only"],
  ["url_full_url", "Links: rules + domain model (full URL)"],
  ["url_hostname_only", "Links: rules + domain model (hostname only)"],
  ["url_full_url_heuristics_only", "Links: rules only (full URL)"],
];

export default function HowPage() {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { api.modelCard().then(setCard).catch(() => setErr(true)); }, []);
  const ev = card?.evaluation;

  return (
    <div className="container stack">
      <PageHeader index="05 / The lab" eyebrow="// How it decides" title={"How SafeCircle\ndecides"}
        lead="Three independent checks run on the server for each request, typically in about a millisecond, with no paid AI service required. Each finding comes with the evidence that triggered it." />
      <div className="lab-strip">
        <div className="lab-panel"><span className="label-caps">Signal 01</span><h3>Tactic rules</h3><p>Hand-written, explainable patterns for the pressure tactics scammers use: urgency, impersonation, OTP and PIN requests, payment pressure, threats, secrecy, prize lures, remote-access apps and hidden characters. Safety advice like “never share your OTP” is recognised and not flagged.</p></div>
        <div className="lab-panel center"><span className="label-caps">Signal 02</span><h3>Link inspection</h3><p>Every link is read, never opened: look-alike brand domains, typos like “amaz0n”, raw IP addresses, shorteners, free hosting, risky downloads, plus a small model trained on thousands of reported phishing domains.</p></div>
        <div className="lab-panel"><span className="label-caps">Signal 03</span><h3>Language model</h3><p>A lightweight TF-IDF and logistic-regression model trained on the public SMS Spam Collection, with the words that pushed the score up shown to you.</p></div>
      </div>
      <div className="card glow">
        <div className="panel-label"><h2 style={{ margin: 0 }}>Measured results</h2><span className="label-caps">Held-out test data</span></div>
        {err && <p className="muted">Couldn't load the results from the server.</p>}
        {!ev && !err && <p className="muted">Loading…</p>}
        {ev && (
          <>
            <p className="small muted">Held-out test data only. Messages: {ev.messages_dataset}. Links: {ev.urls_dataset}, {ev.n_urls_per_class} per class. Generated {new Date(ev.generated_at).toLocaleDateString()}.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Setting</th><th>Precision</th><th>Recall</th><th>F1</th><th>False-positive rate</th></tr></thead>
                <tbody>{ROWS.filter(([k]) => ev.metrics[k]).map(([k, label]) => (
                  <tr key={k}><td>{label}</td><td>{pct(ev.metrics[k].precision)}</td><td>{pct(ev.metrics[k].recall)}</td><td>{ev.metrics[k].f1.toFixed(3)}</td><td>{pct(ev.metrics[k].false_positive_rate)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="small muted">Median analysis time per message: {ev.latency_message_p50_ms} ms (95th percentile {ev.latency_message_p95_ms} ms).</p>
            <h3 style={{ marginTop: 16 }}>Limits you should know</h3>
            <ul className="small muted bullets">
              <li>The SMS dataset is from 2011 and mostly UK marketing spam, not modern scams, so rule recall on it is low by design: the rules look for social-engineering tactics, not adverts.</li>
              <li>The benign link set is popular hostnames without paths, which are easier than real everyday links. Real-world error rates will differ.</li>
              <li>English only. Messages in other languages and images are not analysed yet.</li>
            </ul>
          </>
        )}
      </div>
      {card && (
        <div className="card">
          <h2>Warning signs and their weights</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>Warning sign</th><th>Weight</th><th>Why it matters</th></tr></thead>
            <tbody>{card.tactic_categories.map((c) => <tr key={c.code}><td>{c.title}</td><td>{c.weight}</td><td className="small">{c.explanation}</td></tr>)}</tbody>
          </table></div>
          <p className="small muted">Scores combine as 1 − Π(1 − weight), so independent tactics add up. Score ≥ {card.thresholds.suspicious} is “Suspicious”, ≥ {card.thresholds.high} “High risk”.</p>
        </div>
      )}
    </div>
  );
}
