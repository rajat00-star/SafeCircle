"use client";
import { useState } from "react";
import ProfileGate from "@/components/ProfileGate";
import { api, ApiError, setToken, type Profile } from "@/lib/api";

function Settings({ profile, refresh }: { profile: Profile; refresh: () => void }) {
  const [p, setP] = useState(profile);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function save(change: Partial<Profile>) {
    setMsg(null);
    const previous = p;
    setP({ ...p, ...change }); // optimistic; reverted if the server rejects it
    try {
      const updated = await api.updateSettings(change);
      setP(updated);
      setMsg({ kind: "success", text: "Saved." });
    } catch (e) {
      setP(previous);
      setMsg({ kind: "error", text: (e as ApiError).message });
    }
  }
  async function exportData() {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "safecircle-my-data.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setMsg({ kind: "error", text: (e as ApiError).message }); }
  }
  async function deleteAll() {
    if (!window.confirm("Delete your profile, history, trusted contacts and alerts permanently?")) return;
    try {
      await api.deleteProfile();
      setToken(null);
      refresh();
    } catch (e) { setMsg({ kind: "error", text: (e as ApiError).message }); }
  }

  return (
    <div className="card">
      <h2>Your settings</h2>
      <div className="toggle">
        <input type="checkbox" id="h" checked={p.store_history} onChange={(e) => save({ store_history: e.target.checked })} />
        <div><label htmlFor="h">Keep a history of my checks</label>
          <div className="small muted">Stores the date, risk score and warning-sign names. Off by default.</div></div>
      </div>
      <div className="toggle">
        <input type="checkbox" id="x" disabled={!p.store_history} checked={p.store_excerpts} onChange={(e) => save({ store_excerpts: e.target.checked })} />
        <div><label htmlFor="x">Also keep a redacted excerpt</label>
          <div className="small muted">Up to 280 characters with codes, card numbers, phone numbers and emails removed. Requires history.</div></div>
      </div>
      <div className="toggle">
        <div style={{ width: 20 }} />
        <div style={{ flex: 1 }}>
          <label htmlFor="r">Delete history after</label>
          <select id="r" value={p.retention_days} onChange={(e) => save({ retention_days: Number(e.target.value) })} style={{ maxWidth: 200 }}>
            {[1, 7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn secondary" onClick={exportData}>Download my data</button>
        <button className="btn danger" onClick={deleteAll}>Delete everything</button>
      </div>
      {msg && <div className={`alert ${msg.kind}`} role="status" style={{ marginTop: 12 }}>{msg.text}</div>}
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="stack">
      <div>
        <h1>Privacy</h1>
        <p className="lead">What happens to what you paste, in plain language.</p>
      </div>
      <div className="grid2">
        <div className="card stack">
          <h2>How your data is processed</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Checks run on our server and are not stored by default.</strong> The text is analysed in memory and discarded when the result is returned.</li>
            <li><strong>Links are never opened.</strong> We read the address only, so the sender can't tell you checked it.</li>
            <li><strong>No account details.</strong> Profiles have a first name only. Your access key stays in this browser.</li>
            <li><strong>Logs contain no content.</strong> Server logs record the page requested, the status and timing, never your text, links or keys.</li>
            <li><strong>Optional AI summary.</strong> Only if the operator enabled it and you tick the box: a redacted excerpt and the findings go to the AI provider. The score never depends on it.</li>
            <li><strong>Trusted contacts see only what you send</strong>, only after they accept, and either of you can end it.</li>
          </ul>
        </div>
        <div className="card stack">
          <h2>What SafeCircle can't do</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            <li>It does not read your SMS, WhatsApp, email or calls. Phones and apps don't allow that, and we don't try to get around it. You choose what to check.</li>
            <li>The browser extension only acts on a link or text you right-click, or the page you ask it to check.</li>
            <li>No detector is perfect. A low score is not a guarantee. When money or codes are involved, verify through a channel you already trust.</li>
          </ul>
        </div>
      </div>
      <ProfileGate purpose="Settings apply to your private profile.">{(p, refresh) => <Settings profile={p} refresh={refresh} />}</ProfileGate>
    </div>
  );
}
