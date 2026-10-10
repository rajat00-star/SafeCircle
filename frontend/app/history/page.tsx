"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, CATEGORY_LABELS, type AnalysisRecord, type Profile } from "@/lib/api";

const LEVELS = [["all", "All"], ["high", "High risk"], ["medium", "Suspicious"], ["low", "Low risk"]] as const;
const KINDS = [["all", "All types"], ["message", "Messages"], ["url", "Links"]] as const;
const LEVEL_LABEL: Record<string, string> = { high: "High risk", medium: "Suspicious", low: "Low risk" };

function History({ profile }: { profile: Profile }) {
  const [items, setItems] = useState<AnalysisRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const load = () => api.history().then(setItems).catch((e: ApiError) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    try { await api.deleteAnalysis(id); load(); } catch (e) { setError((e as ApiError).message); }
  }
  async function clearAll() {
    if (!window.confirm("Delete your whole history? This cannot be undone.")) return;
    try { await api.clearHistory(); load(); } catch (e) { setError((e as ApiError).message); }
  }

  // Filtering happens in the browser over what the API returned; nothing extra is requested or stored.
  const shown = useMemo(() => {
    if (!items) return null;
    const needle = q.trim().toLowerCase();
    return items.filter((a) =>
      (level === "all" || a.risk_level === level) &&
      (kind === "all" || a.kind === kind) &&
      (!needle || [a.redacted_excerpt ?? "", ...a.categories.map((c) => CATEGORY_LABELS[c] ?? c)].join(" ").toLowerCase().includes(needle)));
  }, [items, q, level, kind]);

  if (!profile.store_history) {
    return (
      <div className="empty">
        <div className="ring" aria-hidden="true" />
        <h3>History is off</h3>
        <p style={{ margin: "0 auto", maxWidth: 480 }}>By default nothing you check is stored. Turn on history in <a href="/privacy/">Privacy settings</a> to keep a list of results (risk level and warning signs only).</p>
      </div>
    );
  }
  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Your recent checks</h2>
        {items && <span className="badge neutral">{items.length} saved</span>}
        <span className="spacer" />
        {items && items.length > 0 && <button className="btn danger small" onClick={clearAll}>Clear history</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Kept for {profile.retention_days} days. {profile.store_excerpts ? "Redacted excerpts are saved." : "Message text is not saved."}</p>
      {items && items.length > 0 && (
        <div className="filters">
          <label htmlFor="hq" className="sr-only">Search history</label>
          <input id="hq" type="search" placeholder="Search warning signs or excerpts…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="row" role="group" aria-label="Filter by risk">
            {LEVELS.map(([v, l]) => <button key={v} type="button" className="chip-btn" aria-pressed={level === v} onClick={() => setLevel(v)}>{l}</button>)}
          </div>
          <div className="row" role="group" aria-label="Filter by type">
            {KINDS.map(([v, l]) => <button key={v} type="button" className="chip-btn" aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}
          </div>
        </div>
      )}
      {error && <div className="alert error" role="alert">{error}</div>}
      {shown === null ? (
        <div className="stack" aria-busy="true"><span className="sr-only">Loading…</span>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 40 }} />)}</div>
      ) : items!.length === 0 ? (
        <div className="empty"><div className="ring" aria-hidden="true" /><h3>No checks saved yet</h3><p style={{ margin: 0 }}>Results are saved here when you <a href="/#analyze">analyze a message or link</a> while history is on.</p></div>
      ) : shown.length === 0 ? (
        <p className="muted">No saved checks match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Type</th><th>Risk</th><th>Warning signs</th><th>Excerpt</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td className="small"><span className="mono xsmall">{new Date(a.created_at).toLocaleString()}</span></td>
                    <td>{a.kind === "url" ? "Link" : "Message"}</td>
                    <td><span className={`badge ${a.risk_level}`}>{a.risk_score}</span></td>
                    <td className="small">{a.categories.map((c) => CATEGORY_LABELS[c] ?? c).join(", ") || "None"}</td>
                    <td className="small muted" style={{ maxWidth: 320 }}>{a.redacted_excerpt ?? "Not stored"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn ghost small" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? "Hide" : "Details"}</button>
                      <button className="btn ghost small" onClick={() => remove(a.id)} aria-label="Delete this entry">Delete</button>
                    </td>
                  </tr>
                  {open === a.id && (
                    <tr className="detail">
                      <td colSpan={6}>
                        <div className="grid2 small">
                          <div className="stack" style={{ ["--x" as string]: 0 }}>
                            <div><span className="label-caps">Result</span><div>{LEVEL_LABEL[a.risk_level] ?? a.risk_level}, score {a.risk_score}/100</div></div>
                            <div><span className="label-caps">Warning signs</span>
                              {a.categories.length ? <ul className="arrows" style={{ marginTop: 6 }}>{a.categories.map((c) => <li key={c}>{CATEGORY_LABELS[c] ?? c}</li>)}</ul> : <div className="muted">None matched</div>}
                            </div>
                          </div>
                          <div className="stack">
                            <div><span className="label-caps">Saved excerpt (redacted)</span><div className="muted">{a.redacted_excerpt ?? "Not stored. Turn on excerpts in Privacy to keep one."}</div></div>
                            <div><span className="label-caps">Engine</span><div className="mono xsmall">v{a.engine_version} · {new Date(a.created_at).toISOString()}</div></div>
                            <p className="xsmall faint" style={{ margin: 0 }}>The full message and the explanation text are not stored, so they can&apos;t be shown again.</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <div className="container">
      <PageHeader index="02 / History" eyebrow="Your saved checks" title={"History"}
        lead="Results you chose to keep. You can delete any entry at any time." />
      <ProfileGate purpose="History is linked to a private profile and is off until you turn it on.">{(p) => <History profile={p} />}</ProfileGate>
    </div>
  );
}
