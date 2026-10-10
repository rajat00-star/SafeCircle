"use client";
import { useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, type Profile } from "@/lib/api";

// Shows a one-field form to create an anonymous profile, then renders children with it.
export default function ProfileGate({ children, purpose }: { children: (p: Profile, refresh: () => void) => React.ReactNode; purpose: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!getToken()) { setLoading(false); setProfile(null); return; }
    api.me().then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = await api.createProfile(name);
      setToken(p.token);
      setProfile(p);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (profile) return <>{children(profile, load)}</>;
  return (
    <form className="card stack" onSubmit={create} style={{ maxWidth: 560 }}>
      <h2>Create your private profile</h2>
      <p className="muted" style={{ margin: 0 }}>{purpose} No email, phone number or password needed: a private key is kept in this browser.
        If you clear your browser data you will need to create a new profile.</p>
      <div>
        <label htmlFor="dn">Your first name (shown to your trusted contacts)</label>
        <input id="dn" type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div><button className="btn" type="submit" disabled={!name.trim()}>Create profile</button></div>
      {error && <div className="alert error" role="alert">{error}</div>}
    </form>
  );
}
