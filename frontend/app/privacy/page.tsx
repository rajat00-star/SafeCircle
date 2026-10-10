"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import ProfileGate from "@/components/ProfileGate";
import SpatialBackdrop from "@/components/SpatialBackdrop";
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
    <div className="card glow">
      <div className="panel-label"><h2 style={{ margin: 0 }}>Your settings</h2><span className="label-caps">Profile · {p.display_name}</span></div>
      <div className="toggle">
        <input type="checkbox" className="switch" id="h" checked={p.store_history} onChange={(e) => save({ store_history: e.target.checked })} />
        <div><label htmlFor="h">Keep a history of my checks</label>
          <div className="small muted">Stores the date, risk score and warning-sign names. Off by default.</div></div>
      </div>
      <div className="toggle">
        <input type="checkbox" className="switch" id="x" disabled={!p.store_history} checked={p.store_excerpts} onChange={(e) => save({ store_excerpts: e.target.checked })} />
        <div><label htmlFor="x">Also keep a redacted excerpt</label>
          <div className="small muted">Up to 280 characters with codes, card numbers, phone numbers and emails removed. Requires history.</div></div>
      </div>
      <div className="toggle">
        <div style={{ width: 42, flex: "none" }} />
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
    <div className="container">
      <PageHeader index="04 / Privacy" eyebrow="Transparent processing" title={"Privacy"}
        lead="What happens to what you paste, in plain language, based on how this app actually works."
        scene={<SpatialBackdrop variant="privacy" />} />
      <div className="stack-lg">
        <section aria-labelledby="flow-title">
          <span className="eyebrow" id="flow-title">Where your data goes</span>
          <div className="flow" style={{ marginTop: 18 }}>
            <div className="card stack">
              <h3><span className="dot" style={{ background: "var(--low)" }} />Stays in this browser</h3>
              <ul className="arrows small muted">
                <li>Your profile access key, in local storage (<span className="kbd">safecircle.profileToken</span>). Clearing browser data removes it.</li>
                <li>What you type before you press Analyze.</li>
              </ul>
            </div>
            <div className="card stack">
              <h3><span className="dot" style={{ background: "var(--medium)" }} />Sent to the SafeCircle server</h3>
              <ul className="arrows small muted">
                <li>The message or link you choose to analyze. It is checked in memory; links are never opened.</li>
                <li>Your first name and settings, if you create a profile.</li>
                <li>Contact names and the alerts you choose to send.</li>
              </ul>
            </div>
            <div className="card stack">
              <h3><span className="dot" style={{ background: "var(--violet)" }} />Stored only if you opt in</h3>
              <ul className="arrows small muted">
                <li>History: date, type, risk score, warning-sign names, and a fingerprint (SHA-256 hash) of the text.</li>
                <li>Optionally a redacted excerpt of up to 280 characters.</li>
                <li>Deleted after your retention period, or whenever you delete it.</li>
              </ul>
            </div>
          </div>
        </section>
        <div className="grid2">
          <div className="card stack">
            <span className="label-caps">How your data is processed</span>
            <ul className="arrows small">
              <li><strong>Checks run on our server and are not stored by default.</strong> <span className="muted">The text is analysed in memory and discarded when the result is returned.</span></li>
              <li><strong>Links are never opened.</strong> <span className="muted">We read the address only, so the sender can&apos;t tell you checked it.</span></li>
              <li><strong>No account details.</strong> <span className="muted">Profiles have a first name only. Your access key stays in this browser.</span></li>
              <li><strong>Logs contain no content.</strong> <span className="muted">Server logs record the page requested, the status and timing, never your text, links or keys.</span></li>
              <li><strong>Optional AI summary.</strong> <span className="muted">Only if the operator enabled it and you tick the box: a redacted excerpt and the findings go to the AI provider. The score never depends on it.</span></li>
              <li><strong>Trusted contacts see only what you send</strong>, <span className="muted">only after they accept, and either of you can end it.</span></li>
            </ul>
          </div>
          <div className="card stack">
            <span className="label-caps">What SafeCircle can&apos;t do</span>
            <ul className="arrows small muted">
              <li>It does not read your SMS, WhatsApp, email or calls. Phones and apps don&apos;t allow that, and we don&apos;t try to get around it. You choose what to check.</li>
              <li>The browser extension only acts on a link or text you right-click, or the page you ask it to check.</li>
              <li>No detector is perfect. A low score is not a guarantee. When money or codes are involved, verify through a channel you already trust.</li>
            </ul>
          </div>
        </div>
        <ProfileGate purpose="Settings apply to your private profile.">{(p, refresh) => <Settings profile={p} refresh={refresh} />}</ProfileGate>
      </div>
    </div>
  );
}
