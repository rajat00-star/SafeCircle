"use client";
import { useCallback, useEffect, useState } from "react";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, STAGE_TITLES, type EvidenceReport, type ReportOptions } from "@/lib/api";

const LEVEL_LABEL = { low: "Low risk", medium: "Suspicious", high: "High risk" } as const;

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileBase = (r: EvidenceReport) =>
  "safecircle-report-" + r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + r.content_sha256.slice(0, 8);
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "");

function ReportBuilder({ id }: { id: string }) {
  const [opts, setOpts] = useState<ReportOptions>({ include_excerpts: true, include_related: true });
  const [r, setR] = useState<EvidenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.caseReport(id, opts).then(setR).catch((e: ApiError) => setError(e.message));
  }, [id, opts]);
  useEffect(() => { load(); setReviewed(false); }, [load]);

  async function exportMd() {
    if (!r) return;
    setBusy(true); setError(null);
    try {
      download(fileBase(r) + ".md", await api.caseReportMarkdown(id, opts), "text/markdown");
      setDone("Markdown file saved to your device.");
    } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  if (error && !r) return <div className="alert error" role="alert">{error}</div>;
  if (!r) return <div className="skeleton" style={{ height: 320 }} aria-busy="true" />;
  const a = r.assessment;
  return (
    <div className="stack-lg">
      <div className="card glow stack no-print" style={{ ["--gap" as string]: "14px" }}>
        <div className="row">
          <a href={`/cases/?id=${encodeURIComponent(id)}`} className="btn ghost small">← Back to the case</a>
          <span className="spacer" />
          <span className="label-caps">Review before you export</span>
        </div>
        <p className="small" style={{ margin: 0 }}>This report is built from the redacted evidence already in your case. Read it below, choose what to include, then save it. SafeCircle does not send it to anyone.</p>
        <div className="row">
          <label className="check"><input type="checkbox" checked={opts.include_excerpts}
            onChange={(e) => setOpts({ ...opts, include_excerpts: e.target.checked })} /> Include message excerpts</label>
          <label className="check"><input type="checkbox" checked={opts.include_related}
            onChange={(e) => setOpts({ ...opts, include_related: e.target.checked })} /> Include related cases</label>
        </div>
        <label className="check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          I have reviewed this report and understand it has not been submitted to any authority.</label>
        <div className="row">
          <button className="btn primary small" disabled={!reviewed} onClick={() => window.print()}>Print or save as PDF</button>
          <button className="btn secondary small" disabled={!reviewed || busy} onClick={exportMd}>{busy ? "Preparing…" : "Download Markdown"}</button>
          <button className="btn secondary small" disabled={!reviewed}
            onClick={() => { download(fileBase(r) + ".json", JSON.stringify(r, null, 2), "application/json"); setDone("JSON file saved to your device."); }}>Download JSON</button>
          {done && <span className="xsmall faint" role="status">{done}</span>}
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
      </div>

      <article className="card solid report-doc" aria-label="Evidence report">
        {r.is_demo && <div className="alert info"><span className="badge medium">DEMO DATA</span> {r.demo_notice}</div>}
        <span className="label-caps">Scam evidence report · SafeCircle Guardian</span>
        <h2 style={{ margin: "6px 0 4px" }}>{r.title}</h2>
        <p className="alert info small" style={{ margin: "10px 0" }}>{r.submission_status}</p>
        <dl className="facts">
          <div><dt>Generated</dt><dd>{when(r.generated_at)}</dd></div>
          <div><dt>Case opened</dt><dd>{when(r.created_at)}</dd></div>
          <div><dt>Last updated</dt><dd>{when(r.updated_at)}</dd></div>
          <div><dt>Status</dt><dd>{r.case_status}</dd></div>
          <div><dt>Report fingerprint</dt><dd className="mono">{r.content_sha256.slice(0, 16)}…</dd></div>
        </dl>

        <h3>Assessment</h3>
        <p><span className={`badge ${a.risk_level}`}>{LEVEL_LABEL[a.risk_level]} · {a.risk_score}/100</span>{" "}
          {a.review_required && <span className="badge medium">Needs review: {a.review_reasons.join(", ")}</span>}</p>
        <p className="xsmall faint">{a.score_label}</p>
        {a.stages_observed.length > 0 && <p className="small">Attack stages seen: {a.stages_observed.map((s) => STAGE_TITLES[s] ?? s).join(" → ")}</p>}
        {a.components.length > 0 && (
          <table className="report-table"><thead><tr><th>Weight</th><th>What contributed</th></tr></thead>
            <tbody>{a.components.map((c, i) => <tr key={i}><td className="mono">{c.weight.toFixed(2)}</td><td>{c.label} <span className="faint">({c.kind})</span></td></tr>)}</tbody></table>
        )}
        <p className="small"><strong>Uncertainty: {a.uncertainty.level ?? "n/a"}.</strong> {(a.uncertainty.reasons ?? []).join(" ")}</p>
        {a.conflicts.length > 0 && <><h4>Conflicting evidence</h4><ul className="small">{a.conflicts.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        {a.missing_evidence.length > 0 && <><h4>Missing or unverified</h4><ul className="small">{a.missing_evidence.map((x, i) => <li key={i}>{x}</li>)}</ul></>}

        <h3>Tactics detected</h3>
        {r.tactics.length === 0 ? <p className="small muted">No scam tactics were detected.</p> : (
          <ul className="small">{r.tactics.map((t, i) => (
            <li key={i}><strong>{t.title}</strong> <span className="faint">({STAGE_TITLES[t.stage] ?? t.stage}, {t.basis}, weight {t.severity.toFixed(2)})</span>
              {t.evidence.length > 0 && <div className="ev">{t.evidence.map((e, j) => <span className="chip" key={j}>{e}</span>)}</div>}</li>
          ))}</ul>
        )}

        <h3>Evidence timeline</h3>
        {a.order_note && <p className="xsmall faint">{a.order_note}</p>}
        {r.timeline.map((e) => (
          <div key={e.seq} className="report-event">
            <div className="row"><strong>#{e.seq}</strong><span className="badge neutral">{e.kind}</span><span className="small muted">{e.channel}</span>
              <span className="spacer" /><span className="xsmall faint">{e.source}</span></div>
            <p className="xsmall muted" style={{ margin: "4px 0" }}>Received: {e.received_at ? when(e.received_at) : e.received_at_note} · Added: {when(e.added_at)} · SHA-256 <span className="mono">{e.content_sha256.slice(0, 12)}…</span></p>
            {e.screenshot && <p className="xsmall muted" style={{ margin: "4px 0" }}>Screenshot {e.screenshot.width}×{e.screenshot.height}, OCR confidence {e.screenshot.ocr_confidence ?? "n/a"} (image not stored)</p>}
            <pre className="report-excerpt">{e.excerpt}</pre>
            {e.tactics.length > 0 && <p className="small" style={{ margin: "4px 0" }}>Tactics: {e.tactics.map((t) => t.title).join("; ")}</p>}
            {e.links.map((u, i) => <p key={i} className="small" style={{ margin: "4px 0" }}>Link <span className="mono">{u.url}</span>{u.signals.length ? `: ${u.signals.join(", ")}` : ""}</p>)}
          </div>
        ))}

        <h3>Indicators</h3>
        <ul className="small">
          {r.indicators.domains.length > 0 && <li>Domains: <span className="mono">{r.indicators.domains.join(", ")}</span></li>}
          {r.indicators.shortened_links.length > 0 && <li>Shortened links: <span className="mono">{r.indicators.shortened_links.join(", ")}</span></li>}
          {r.indicators.upi_handles_masked.length > 0 && <li>UPI handles (masked): <span className="mono">{r.indicators.upi_handles_masked.join(", ")}</span></li>}
          {r.indicators.phone_numbers && <li>Phone numbers: {r.indicators.phone_numbers}</li>}
          {r.indicators.claimed_organisations.length > 0 && <li>Claimed organisations: {r.indicators.claimed_organisations.join(", ")}</li>}
        </ul>

        <h3>Related cases</h3>
        <p className="small muted">{r.related_note}</p>
        {r.related_cases.length > 0 && <ul className="small">{r.related_cases.map((c, i) => (
          <li key={i}>{c.is_demo && <span className="badge medium">DEMO</span>} <strong>{c.case_title}</strong> ({c.relation}): {[...c.exact, ...c.heuristic].join("; ")}. <span className="faint">{c.uncertainty}</span></li>
        ))}</ul>}

        {r.alert_history.length > 0 && <>
          <h3>Alert decisions</h3>
          <ul className="small">{r.alert_history.map((x, i) => <li key={i}>{when(x.at)}: {x.decision}{x.notified ? " (notified)" : ""}. {x.reason}</li>)}</ul>
        </>}

        <h3>Recommended actions</h3>
        <ol className="small">{r.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ol>
        <p className="small"><strong>{r.how_to_report}</strong></p>
        <h4>Not included by design</h4>
        <ul className="xsmall muted">{r.excluded_by_design.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p className="xsmall faint">{r.generator} · report format v{r.report_version} · fingerprint {r.content_sha256}</p>
      </article>
    </div>
  );
}

export default function ReportPage() {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => { setId(new URLSearchParams(window.location.search).get("id")); }, []);
  return (
    <div className="container stack-lg">
      <ProfileGate purpose="Evidence reports are built from the investigations in your private profile.">
        {() => id === undefined ? null : id ? <ReportBuilder id={id} /> : (
          <div className="empty"><h3>No case selected</h3><p style={{ margin: 0 }}>Open an investigation and choose “Evidence report”. <a href="/cases/">Go to Scam DNA →</a></p></div>
        )}
      </ProfileGate>
    </div>
  );
}
