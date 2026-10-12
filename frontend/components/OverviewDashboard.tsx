"use client";
import { useEffect, useState } from "react";
import { ALERT_LABELS, api, getToken, parseTime, type Overview, type Split } from "@/lib/api";

const FEATURES = [
  ["01", "Scam DNA", "Reconstructs a multi-stage attack from messages, calls, links and screenshots, and explains every change in risk.", "/cases/"],
  ["02", "Forensics", "One report for a message, a chat, a link or a screenshot read with local OCR. Shows what was and wasn't analysed.", "/forensics/"],
  ["03", "Campaign Radar", "Groups related cases by shared domains, payment handles and wording, and suppresses duplicate alerts.", "/campaigns/"],
  ["04", "Guardian Shield", "Browser extension: check links and text, and get a warning with a clear way back before a risky page opens.", "/extension/"],
] as const;

const JUDGE_STEPS: [string, string][] = [
  ["Open this overview: metrics below come from your own profile; demo cases are labelled.", "#overview"],
  ["Play “Benign bank debit notification” and inspect the low-risk result.", "/cases/"],
  ["Play “Multi-stage bank impersonation” one step at a time.", "/cases/"],
  ["Watch the attack chain grow and read “What changed” after each step.", "/cases/"],
  ["Open Forensics, choose “Demo screenshot” and add it to the case.", "/forensics/"],
  ["Check a suspicious link with the Guardian Shield extension.", "/extension/"],
  ["Load the demo campaign cases and open Campaign Radar.", "/campaigns/"],
  ["Resubmit an unchanged step and see the duplicate alert suppressed.", "/cases/"],
];

function Tile({ label, v, hint }: { label: string; v: Split | number | null; hint?: string }) {
  const total = v == null ? null : typeof v === "number" ? v : v.total;
  const demo = v != null && typeof v !== "number" ? v.demo : 0;
  return (
    <div className="metric">
      <span className="label-caps">{label}</span>
      <b>{total ?? "—"}</b>
      <span className="xsmall faint">{total == null ? hint ?? "" : demo ? `${demo} from DEMO DATA` : "from your cases"}</span>
    </div>
  );
}

export default function OverviewDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "anon" | "ok" | "error">("loading");

  useEffect(() => {
    if (!getToken()) { setState("anon"); return; }
    api.overview().then((d) => { setData(d); setState("ok"); }).catch((e) => setState(e.status === 401 ? "anon" : "error"));
  }, []);

  return (
    <section id="overview" className="section tight" aria-labelledby="overview-title" style={{ scrollMarginTop: 72 }}>
      <div className="container stack-lg">
        <div className="section-head">
          <div>
            <span className="eyebrow">00 / Overview</span>
            <h2 id="overview-title" className="glow">How scams<br />unfold.</h2>
          </div>
          <p>Scam DNA detects how a financial scam unfolds across several events, explains its evidence, warns at the right moment,
            and links related campaigns. The numbers below are computed from investigations in your private profile, not from a live feed.</p>
        </div>

        <div className="metrics" aria-live="polite" aria-busy={state === "loading"}>
          <Tile label="Investigations" v={data?.investigations ?? null} hint={state === "anon" ? "Create a profile to start" : ""} />
          <Tile label="Open cases" v={data?.open_cases ?? null} />
          <Tile label="Need review" v={data?.review_required ?? null} />
          <Tile label="Potential campaigns" v={data?.campaigns ?? null} />
          <Tile label="Alerts raised" v={data?.alerts_raised ?? null} />
          <Tile label="Duplicates suppressed" v={data?.duplicates_suppressed ?? null} />
        </div>
        {state === "anon" && <p className="small muted" style={{ margin: 0 }}>No private profile in this browser yet. <a href="/cases/">Start an investigation</a> to create one; no e-mail or phone number needed.</p>}
        {state === "error" && <div className="alert error" role="alert">The overview couldn&apos;t be loaded. Is the SafeCircle server running?</div>}
        {data && <p className="xsmall faint" style={{ margin: 0 }}>{data.source}</p>}

        <div className="grid2">
          <div className="card stack" style={{ ["--gap" as string]: "10px" }}>
            <div className="panel-label" style={{ marginBottom: 0 }}><h3 style={{ margin: 0 }}>Recent case activity</h3><span className="label-caps">Audit trail</span></div>
            {!data || data.recent_activity.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>Nothing yet. Activity from your investigations appears here.</p>
            ) : (
              <ul className="clean audit">
                {data.recent_activity.slice(0, 7).map((r, i) => (
                  <li key={i}>
                    <span className="mono xsmall faint">{parseTime(r.at).toLocaleTimeString()}</span>
                    <a className="small" href={`/cases/?id=${r.case_id}`}>{r.case_title}</a>
                    <span className="badge neutral">{r.alert_action ? ALERT_LABELS[r.alert_action] : r.action.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card stack judge" style={{ ["--gap" as string]: "10px" }}>
            <div className="row"><span className="badge medium">DEMO DATA</span><span className="label-caps">Judge walkthrough · no paid services</span></div>
            <ol className="steps small">
              {JUDGE_STEPS.map(([t, href], i) => <li key={i}><a href={href}>{t}</a></li>)}
            </ol>
          </div>
        </div>

        <div className="feature-cards">
          {FEATURES.map(([n, t, d, href]) => (
            <a key={n} href={href} className="card feature-card">
              <span className="mono xsmall faint">{n}</span>
              <h3>{t}</h3>
              <p className="small muted">{d}</p>
              <span className="small">Open <span aria-hidden="true">→</span></span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
