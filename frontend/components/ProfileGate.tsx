"use client";
import { useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, type Profile } from "@/lib/api";

// Shows a one-field form to create an anonymous profile, then renders children with it.
export default function ProfileGate({ children, purpose }: { children: (p: Profile, refresh: () => void) => React.ReactNode; purpose: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!getToken()) { setLoading(false); setProfile(null); return; }
    api.me().then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const p = await api.createProfile(name);
      setToken(p.token);
      setProfile(p);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card stack" aria-busy="true"><span className="sr-only">Loading…</span><div className="skeleton" style={{ width: "30%" }} /><div className="skeleton" style={{ width: "70%" }} /></div>;
  if (profile) return <>{children(profile, load)}</>;
  return (
    <div className="grid2">
      <form className="card glow stack" onSubmit={create}>
        <span className="label-caps">Private profile</span>
        <h2 style={{ margin: 0 }}>Create your private profile</h2>
        <p className="muted" style={{ margin: 0 }}>{purpose} No email, phone number or password needed: a private key is kept in this browser.
          If you clear your browser data you will need to create a new profile.</p>
        <div>
          <label htmlFor="dn">Your first name (shown to your trusted contacts)</label>
          <input id="dn" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div><button className="btn primary" type="submit" disabled={!name.trim() || busy}>{busy ? <><span className="spin" aria-hidden="true" />Creating…</> : "Create profile"}</button></div>
        {error && <div className="alert error" role="alert">{error}</div>}
      </form>
      <div className="card stack">
        <span className="label-caps">What a profile is</span>
        <ul className="arrows small muted">
          <li>A random ID with the first name you choose. Nothing else about you.</li>
          <li>Its access key is stored in this browser&apos;s local storage and sent with your requests.</li>
          <li>History stays off until you switch it on in Privacy settings.</li>
          <li>You can download or permanently delete everything at any time.</li>
        </ul>
      </div>
    </div>
  );
}
