"use client";
import { useCallback, useEffect, useState } from "react";
import CaseView from "@/components/CaseView";
import PageHeader from "@/components/PageHeader";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, parseTime, STAGE_TITLES, type CaseSummary, type DemoScenario } from "@/lib/api";

const LEVEL_LABEL: Record<string, string> = { low: "Low risk", medium: "Suspicious", high: "High risk" };
const STATUS_LABEL: Record<string, string> = { open: "Open", review: "Needs review", closed: "Closed" };

function go(id: string | null) {
  const url = id ? `/cases/?id=${encodeURIComponent(id)}` : "/cases/";
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function CaseList() {
  const [items, setItems] = useState<CaseSummary[] | null>(null);
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [demoLabel, setDemoLabel] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "real" | "demo">("all");

  const load = useCallback(() => api.cases().then(setItems).catch((e: ApiError) => setError(e.message)), []);
  useEffect(() => {
    load();
    api.demoScenarios().then((d) => { setScenarios(d.scenarios); setDemoLabel(d.label); }).catch(() => setScenarios([]));
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(null); }
  }
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    run("create", async () => { const c = await api.createCase(title.trim() || "Untitled investigation"); go(c.id); });
  };

  const shown = (items ?? []).filter((c) => filter === "all" || (filter === "demo") === c.is_demo);
  return (
    <div className="stack-lg">
      <div className="grid2">
        <form className="card glow stack" onSubmit={create} style={{ ["--gap" as string]: "14px" }}>
          <span className="label-caps">New investigation</span>
          <h2 style={{ margin: 0 }}>Start a case</h2>
          <p className="small muted" style={{ margin: 0 }}>Add messages, links and screenshots as they arrive. Each one re-evaluates the whole case and shows what changed.</p>
          <div><label htmlFor="ct">Name (optional)</label>
            <input id="ct" type="text" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 'KYC SMS and caller from bank'" /></div>
          <div><button className="btn primary" type="submit" disabled={busy !== null}>{busy === "create" ? <><span className="spin" aria-hidden="true" />Creating…</> : <>Create case <span className="arrow" aria-hidden="true">→</span></>}</button></div>
          <p className="xsmall faint" style={{ margin: 0 }}>Evidence is stored redacted in your private profile (no OTPs, PINs, card numbers, phone numbers or e-mails) and follows your retention setting.</p>
        </form>
        <div className="card stack" style={{ ["--gap" as string]: "12px" }}>
          <div className="row"><span className="badge medium">DEMO DATA</span><span className="label-caps">Guided scenarios</span></div>
          <h2 style={{ margin: 0 }}>Play a scenario</h2>
          <p className="xsmall faint" style={{ margin: 0 }}>{demoLabel}</p>
          <ul className="clean scenario-list">
            {scenarios.map((s) => (
              <li key={s.key}>
                <div><strong className="small">{s.title}</strong><div className="xsmall muted">{s.summary} · {s.events.length} step{s.events.length > 1 ? "s" : ""}</div></div>
                <button className="btn secondary small" disabled={busy !== null}
                  onClick={() => run(s.key, async () => { const c = await api.startScenario(s.key); go(c.id); })}>
                  {busy === s.key ? "Starting…" : "Play"}
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="btn ghost small" disabled={busy !== null} onClick={() => run("camp", async () => { await api.loadDemoCampaigns(); await load(); })}>
              {busy === "camp" ? "Loading…" : "Load demo campaign cases"}
            </button>
            {items?.some((c) => c.is_demo) && (
              <button className="btn ghost small" disabled={busy !== null} onClick={() => {
                if (window.confirm("Remove all DEMO cases from this profile?")) run("clear", async () => { await api.clearDemo(); await load(); });
              }}>Remove demo cases</button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="alert error" role="alert">{error}</div>}

      <div className="card stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>Investigations</h2>
          {items && <span className="badge neutral">{items.length}</span>}
          <span className="spacer" />
          <div className="row" role="group" aria-label="Filter cases">
            {(["all", "real", "demo"] as const).map((f) => <button key={f} type="button" className="chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "real" ? "Your cases" : "Demo"}</button>)}
          </div>
        </div>
        {items === null ? (
          <div className="stack" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}</div>
        ) : shown.length === 0 ? (
          <div className="empty"><div className="ring" aria-hidden="true" /><h3>No investigations yet</h3>
            <p style={{ margin: 0 }}>Start a case above, or play a demo scenario to see Scam DNA reconstruct an attack.</p></div>
        ) : (
          <ul className="clean case-rows">
            {shown.map((c) => (
              <li key={c.id}>
                <a href={`/cases/?id=${c.id}`} onClick={(e) => { e.preventDefault(); go(c.id); }}>
                  <span className={`risk-pill ${c.risk_level}`}>{c.risk_score}</span>
                  <span className="case-main">
                    <strong>{c.title}</strong>
                    <span className="xsmall muted">{c.event_count} evidence · {c.stages.map((s) => STAGE_TITLES[s]).join(" → ") || "no stages yet"} · updated {parseTime(c.updated_at).toLocaleString()}</span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {c.is_demo && <span className="badge medium">Demo</span>}
                    {c.review_required && c.status !== "closed" && <span className="badge medium">Review</span>}
                    <span className={`badge ${c.risk_level}`}>{LEVEL_LABEL[c.risk_level]}</span>
                    <span className="badge neutral">{STATUS_LABEL[c.status]}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function CasesPage() {
  const [id, setId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => { setId(new URLSearchParams(window.location.search).get("id")); setReady(true); };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  return (
    <div className="container">
      <PageHeader index="01 / Scam DNA" eyebrow="Multi-stage attack reconstruction" title={"Scam\nDNA"}
        lead="Scams unfold over several messages, calls and links. Add each piece as it arrives; SafeCircle rebuilds the attack chain, shows the evidence behind every step, and explains how the risk changed." />
      <ProfileGate purpose="Investigations are kept in a private profile so you can add evidence over time.">
        {() => (ready ? (id ? <CaseView key={id} id={id} onDeleted={() => go(null)} /> : <CaseList />) : null)}
      </ProfileGate>
    </div>
  );
}
