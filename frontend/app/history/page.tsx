"use client";
import { useEffect, useState } from "react";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, CATEGORY_LABELS, type AnalysisRecord, type Profile } from "@/lib/api";

function History({ profile }: { profile: Profile }) {
  const [items, setItems] = useState<AnalysisRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.history().then(setItems).catch((e: ApiError) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    try { await api.deleteAnalysis(id); load(); } catch (e) { setError((e as ApiError).message); }
  }
  async function clearAll() {
    if (!window.confirm("Delete your whole history? This cannot be undone.")) return;
    try { await api.clearHistory(); load(); } catch (e) { setError((e as ApiError).message); }
  }

  if (!profile.store_history) {
    return (
      <div className="card stack">
        <h2>History is off</h2>
        <p className="muted" style={{ margin: 0 }}>By default nothing you check is stored. Turn on history in <a href="/privacy/">Privacy settings</a> to keep a list of results (risk level and warning signs only).</p>
      </div>
    );
  }
  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Your recent checks</h2>
        <span className="spacer" />
        {items && items.length > 0 && <button className="btn secondary small" onClick={clearAll}>Clear history</button>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>Kept for {profile.retention_days} days. {profile.store_excerpts ? "Redacted excerpts are saved." : "Message text is not saved."}</p>
      {error && <div className="alert error" role="alert">{error}</div>}
      {items === null ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">No checks saved yet.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>Type</th><th>Risk</th><th>Warning signs</th><th>Excerpt</th><th></th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="small">{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.kind === "url" ? "Link" : "Message"}</td>
                  <td><span className={`badge ${a.risk_level}`}>{a.risk_score}</span></td>
                  <td className="small">{a.categories.map((c) => CATEGORY_LABELS[c] ?? c).join(", ") || "None"}</td>
                  <td className="small muted">{a.redacted_excerpt ?? "Not stored"}</td>
                  <td><button className="btn ghost small" onClick={() => remove(a.id)} aria-label="Delete this entry">Delete</button></td>
                </tr>
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
    <div className="stack">
      <div><h1>History</h1><p className="lead">Results you chose to keep. You can delete any entry at any time.</p></div>
      <ProfileGate purpose="History is linked to a private profile and is off until you turn it on.">{(p) => <History profile={p} />}</ProfileGate>
    </div>
  );
}
