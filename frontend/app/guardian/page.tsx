"use client";
import { useEffect, useState } from "react";
import { api, ApiError, CATEGORY_LABELS, type AlertItem, type InviteInfo } from "@/lib/api";

// The trusted contact's page. The access token lives in the URL fragment (#t=...),
// which browsers never send to servers, and is passed to the API in a header.
export default function GuardianPage() {
  const [token, setTok] = useState<string | null>(null);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load(t: string) {
    setError(null);
    try {
      const i = await api.inviteInfo(t);
      setInfo(i);
      if (i.status === "active") setAlerts((await api.inbox(t)).alerts);
    } catch (e) { setError((e as ApiError).message); }
  }
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    setTok(t);
    if (t) load(t); else setError("This page needs the private link you were sent.");
  }, []);

  async function accept() { try { await api.acceptInvite(token!); await load(token!); } catch (e) { setError((e as ApiError).message); } }
  async function decline(withdraw: boolean) {
    const q = withdraw ? "Stop receiving alerts? You can't undo this; they would need to invite you again." : "Decline this invitation?";
    if (!window.confirm(q)) return;
    try { await api.declineInvite(token!); setDone(withdraw ? "You will no longer receive alerts." : "You declined. Nothing will be shared with you."); await load(token!); }
    catch (e) { setError((e as ApiError).message); }
  }
  async function ack(id: string) {
    try { const a = await api.ack(token!, id); setAlerts((xs) => xs?.map((x) => (x.id === id ? a : x)) ?? null); }
    catch (e) { setError((e as ApiError).message); }
  }

  return (
    <div className="stack">
      <h1>SafeCircle trusted contact</h1>
      {error && <div className="alert error" role="alert">{error}</div>}
      {done && <div className="alert success" role="status">{done}</div>}
      {info && info.status === "pending" && (
        <div className="card stack" style={{ maxWidth: 720 }}>
          <h2>{info.requester_name} would like you as a trusted contact</h2>
          <p className="muted" style={{ margin: 0 }}>If you accept, {info.requester_name} can ask for your opinion when a message looks like a scam.</p>
          <div className="grid2">
            <div><h3>You will receive</h3><ul className="small" style={{ paddingLeft: 18 }}>{info.what_you_will_receive.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><h3>You will not receive</h3><ul className="small" style={{ paddingLeft: 18 }}>{info.what_you_will_not_receive.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Invitation expires {new Date(info.invite_expires_at).toLocaleString()}. Bookmark this page: it is also where alerts will appear.</p>
          <div className="row">
            <button className="btn" onClick={accept}>I agree to be a trusted contact</button>
            <button className="btn secondary" onClick={() => decline(false)}>Decline</button>
          </div>
        </div>
      )}
      {info && info.status === "active" && (
        <div className="stack">
          <p className="lead">You are a trusted contact for <strong>{info.requester_name}</strong>. Alerts they send you appear below. Bookmark this page.</p>
          <div className="row"><button className="btn secondary small" onClick={() => load(token!)}>Refresh</button>
            <span className="spacer" /><button className="btn ghost small" onClick={() => decline(true)}>Stop being a trusted contact</button></div>
          {alerts && alerts.length === 0 && <div className="card muted">No alerts yet.</div>}
          {alerts?.map((a) => (
            <div className="card stack" key={a.id}>
              <div className="row">
                <span className={`badge ${a.risk_level}`}>{a.risk_level === "high" ? "High risk" : a.risk_level === "medium" ? "Suspicious" : "Low risk"} · {a.risk_score}/100</span>
                <span className="small muted">{new Date(a.created_at).toLocaleString()}</span>
                <span className="spacer" />
                {a.acknowledged_at ? <span className="small muted">Seen</span> : <button className="btn small" onClick={() => ack(a.id)}>Mark as seen</button>}
              </div>
              <div><strong>Warning signs:</strong> {a.categories.map((c) => CATEGORY_LABELS[c] ?? c).join(", ") || "none"}</div>
              {a.note && <div><strong>{info.requester_name} says:</strong> {a.note}</div>}
              {a.redacted_excerpt && <div className="highlighted small">{a.redacted_excerpt}</div>}
              <p className="small muted" style={{ margin: 0 }}>Tip: call {info.requester_name} on the number you already have for them. Don't use numbers or links from the message.</p>
            </div>
          ))}
        </div>
      )}
      {info && ["declined", "revoked", "expired"].includes(info.status) && !done && (
        <div className="card">This link has {info.status === "expired" ? "expired" : "ended"}. Nothing will be shared with you through it.</div>
      )}
    </div>
  );
}
