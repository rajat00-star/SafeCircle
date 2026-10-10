"use client";
import { useEffect, useState } from "react";
import { api, ApiError, getToken, type Analysis, type Contact } from "@/lib/api";

export default function AlertPanel({ result }: { result: Analysis }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [includeExcerpt, setIncludeExcerpt] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "success"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const hasProfile = typeof window !== "undefined" && !!getToken();

  useEffect(() => {
    if (!hasProfile) return;
    api.contacts().then((cs) => setContacts(cs.filter((c) => c.status === "active")))
      .catch((e: ApiError) => setStatus({ kind: "error", msg: e.message }));
  }, [hasProfile]);

  if (!hasProfile) {
    return <p className="muted">To ask someone you trust for a second opinion, <a href="/contacts/">set up a trusted contact</a> first.</p>;
  }
  if (contacts === null) return <p className="muted">Loading your trusted contacts…</p>;
  if (contacts.length === 0) {
    return <p className="muted">You have no trusted contacts who have accepted yet. <a href="/contacts/">Invite someone</a>.</p>;
  }

  async function send() {
    setBusy(true);
    setStatus(null);
    try {
      const r = await api.sendAlert(result.alert_ticket, selected, note, includeExcerpt);
      const names = contacts!.filter((c) => r.sent_to.includes(c.id)).map((c) => c.name);
      setStatus(r.sent_to.length
        ? { kind: "success", msg: `Alert sent to ${names.join(", ")}. They will see it when they open their SafeCircle link.` }
        : { kind: "error", msg: "No alert was sent: the selected contacts are no longer active." });
    } catch (e) {
      setStatus({ kind: "error", msg: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label-caps" style={{ marginBottom: 8 }}>Choose who to alert</legend>
        {contacts.map((c) => (
          <div className="toggle" key={c.id} style={{ borderBottom: 0, padding: "4px 0" }}>
            <input type="checkbox" id={`c-${c.id}`} checked={selected.includes(c.id)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} />
            <label htmlFor={`c-${c.id}`}>{c.name}{c.relationship_label ? ` (${c.relationship_label})` : ""}</label>
          </div>
        ))}
      </fieldset>
      <div>
        <label htmlFor="note">Note (optional)</label>
        <input id="note" type="text" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Got this from an unknown number. Is it real?" />
      </div>
      <div className="toggle" style={{ borderBottom: 0 }}>
        <input type="checkbox" id="incl" checked={includeExcerpt} onChange={(e) => setIncludeExcerpt(e.target.checked)} />
        <div>
          <label htmlFor="incl">Include a redacted excerpt</label>
          <div className="small muted">Codes, card numbers, phone numbers and emails are removed. Preview: “{result.redacted_excerpt}”</div>
        </div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy || selected.length === 0} onClick={send}>
          {busy ? "Sending…" : "Send alert"}
        </button>
        <span className="small muted">Only the risk level, warning signs and your note are shared.</span>
      </div>
      {status && <div className={`alert ${status.kind}`} role="status">{status.msg}</div>}
    </div>
  );
}
