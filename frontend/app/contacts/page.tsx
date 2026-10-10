"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, type Contact } from "@/lib/api";

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting for consent", cls: "medium" },
  active: { label: "Active", cls: "low" },
  declined: { label: "Declined", cls: "neutral" },
  revoked: { label: "Ended", cls: "neutral" },
  expired: { label: "Invite expired", cls: "neutral" },
};

function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [rel, setRel] = useState("");
  const [invite, setInvite] = useState<{ name: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => api.contacts().then(setContacts).catch((e: ApiError) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const c = await api.addContact(name, rel);
      setInvite({ name: c.name, url: c.invite_url });
      setName(""); setRel("");
      load();
    } catch (err) { setError((err as ApiError).message); }
  }
  async function revoke(c: Contact) {
    if (!window.confirm(`End the trusted-contact link with ${c.name}? They will stop receiving alerts immediately.`)) return;
    try { await api.revokeContact(c.id); load(); } catch (err) { setError((err as ApiError).message); }
  }
  async function copy() {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* user can copy manually */ }
  }

  return (
    <div className="stack">
      <div className="grid2">
        <form className="card glow stack" onSubmit={add}>
          <span className="label-caps">Step 1 · Create an invite</span>
          <h2 style={{ margin: 0 }}>Invite a trusted contact</h2>
          <div>
            <label htmlFor="cn">Their name</label>
            <input id="cn" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="cr">Relationship (optional)</label>
            <input id="cr" type="text" maxLength={40} value={rel} onChange={(e) => setRel(e.target.value)} placeholder="e.g. Daughter" />
          </div>
          <div><button className="btn primary" type="submit" disabled={!name.trim()}>Create invite link</button></div>
          {error && <div className="alert error" role="alert">{error}</div>}
        </form>
        <div className="card stack">
          <span className="label-caps">How consent works</span>
          <ol className="steps">
            <li><strong>You send the link yourself</strong>You create a private invite link and send it to them. SafeCircle never messages anyone for you.</li>
            <li><strong>They decide</strong>They open it, see exactly what they would receive, and accept or decline.</li>
            <li><strong>You choose each alert</strong>Alerts are only sent when you press “Ask a trusted contact” on a result. They appear on the contact&apos;s SafeCircle page; there are no SMS or email notifications.</li>
            <li><strong>Either side can stop</strong>Either of you can end the link at any time. Invites expire after 72 hours.</li>
          </ol>
        </div>
      </div>

      {invite && (
        <div className="card glow stack" role="status">
          <span className="label-caps">Step 2 · Share privately</span>
          <h2 style={{ margin: 0 }}>Send this link to {invite.name}</h2>
          <p className="small muted" style={{ margin: 0 }}>This link is shown only once. Anyone with it can act as {invite.name}, so send it privately.</p>
          <div className="row">
            <input type="text" readOnly value={invite.url} aria-label="Invite link" onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn secondary" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="panel-label"><h2 style={{ margin: 0 }}>Your trusted contacts</h2><span className="label-caps">{contacts.length} / 5</span></div>
        {contacts.length === 0 ? <div className="empty"><div className="ring" aria-hidden="true" /><h3>No contacts yet</h3><p style={{ margin: 0 }}>Create an invite above. Nobody is added until they accept.</p></div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Status</th><th>Added</th><th></th></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}{c.relationship_label && <span className="muted"> · {c.relationship_label}</span>}</td>
                    <td><span className={`badge ${STATUS[c.status]?.cls ?? "neutral"}`}>{STATUS[c.status]?.label ?? c.status}</span></td>
                    <td className="small muted">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td>{(c.status === "pending" || c.status === "active") &&
                      <button className="btn secondary small" onClick={() => revoke(c)}>{c.status === "pending" ? "Cancel invite" : "End link"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactsPage() {
  return (
    <div className="container">
      <PageHeader index="03 / Trusted circle" eyebrow="Consent on both sides" title={"Trusted\ncontacts"}
        lead="Choose up to five people who can give you a second opinion. They only ever see what you choose to send, and only after they agree." />
      <ProfileGate purpose="Trusted contacts are linked to a private profile.">{() => <Contacts />}</ProfileGate>
    </div>
  );
}
