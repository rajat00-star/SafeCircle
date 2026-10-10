"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ModelCard } from "@/lib/api";
import { pickTier, prefersReducedMotion } from "@/lib/gfx";
import type { TacticCard } from "./TacticScene";
import Scramble from "./Scramble";

const TacticScene = dynamic(() => import("./TacticScene"), { ssr: false });
const FEATURED = ["urgency", "impersonation", "otp_request", "credential_request", "payment_pressure", "threat"];

// "Every tactic has a tell": a scroll-driven spatial carousel on capable desktops; a readable
// stacked list on phones, with reduced motion, or without WebGL. Content comes from the live model card.
export default function TacticSection() {
  const [all, setAll] = useState<ModelCard["tactic_categories"] | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"pending" | "3d" | "flat">("pending");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useRef(0);

  useEffect(() => { api.modelCard().then((m) => setAll(m.tactic_categories)).catch(() => setFailed(true)); }, []);
  useEffect(() => {
    const decide = () => setMode(window.innerWidth >= 900 && !prefersReducedMotion() && pickTier() !== "fallback" ? "3d" : "flat");
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, []);

  const cards: TacticCard[] = useMemo(() => (all ?? []).filter((c) => FEATURED.includes(c.code))
    .sort((a, b) => FEATURED.indexOf(a.code) - FEATURED.indexOf(b.code)), [all]);
  const others = (all ?? []).filter((c) => !FEATURED.includes(c.code));
  const N = cards.length;

  // Scroll → progress with a hold around each card so it can be read.
  useEffect(() => {
    if (mode !== "3d" || !N) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = wrap.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const span = el.offsetHeight - window.innerHeight;
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, span))) * (N - 1);
        const i = Math.floor(p), f = p - i;
        const held = i + (f < 0.3 ? 0 : f > 0.7 ? 1 : (f - 0.3) / 0.4 * ((f - 0.3) / 0.4) * (3 - 2 * ((f - 0.3) / 0.4)));
        progress.current = Math.min(N - 1, held);
        setActive(Math.round(progress.current));
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [mode, N]);

  const goTo = useCallback((i: number) => {
    const el = wrap.current;
    if (!el || N < 2) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (i / (N - 1)) * span + 2, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [N]);
  const onFail = useCallback(() => setMode("flat"), []);

  const head = (
    <div className="section-head">
      <div>
        <span className="eyebrow">03 / What it detects</span>
        <h2 id="tactics-title" className="glow">Every tactic<br />has a tell.</h2>
      </div>
      <p>The six pressure tactics behind most message scams, with the weight each carries in the score. Loaded live from the engine&apos;s model card.</p>
    </div>
  );

  if (failed) {
    return (
      <section id="protection" className="section" aria-labelledby="tactics-title"><div className="container">{head}
        <p className="muted">Couldn&apos;t reach the detector to load the tactic descriptions.</p></div></section>
    );
  }

  const c = cards[active];
  return (
    <section id="protection" aria-labelledby="tactics-title" style={{ scrollMarginTop: 40 }}>
      {mode === "3d" && N > 0 ? (
        <div ref={wrap} className="tactic-track" style={{ height: `${100 + N * 70}vh` }}>
          <div className="tactic-sticky">
            <TacticScene cards={cards} progressRef={progress} onPick={goTo} onFail={onFail} />
            <div className="container tactic-overlay">
              {head}
              <div className="tactic-caption card" aria-live="polite">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="label-caps">{String(active + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}</span>
                  <span className="label-caps">Weight {c?.weight}</span>
                </div>
                <h3><Scramble key={c?.code} text={c?.title ?? ""} duration={350} startOnView={false} /></h3>
                <p>{c?.explanation}</p>
                <div className="row" role="group" aria-label="Choose a tactic" style={{ gap: 6 }}>
                  {cards.map((x, i) => (
                    <button key={x.code} type="button" className="chip-btn" aria-pressed={i === active} aria-label={x.title} onClick={() => goTo(i)}>
                      {String(i + 1).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="section"><div className="container">
          {head}
          <div className="tactic-list">
            {(N ? cards : []).map((x, i) => (
              <article key={x.code} className="glass-card">
                <div className="code"><span>{String(i + 1).padStart(2, "0")} / {x.code.replace(/_/g, " ")}</span><span>w {x.weight}</span></div>
                <h3>{x.title}</h3>
                <p>{x.explanation}</p>
              </article>
            ))}
            {!all && [0, 1, 2].map((i) => <div key={i} className="glass-card"><div className="skeleton" style={{ width: "40%" }} /><div className="skeleton" style={{ width: "70%", marginTop: 40 }} /></div>)}
          </div>
        </div></div>
      )}
      {others.length > 0 && (
        <div className="container" style={{ paddingTop: 28, paddingBottom: 24 }}>
          <span className="label-caps">Also checked</span>
          <div className="tags" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {others.map((o) => <span key={o.code} className="tag" title={o.explanation}>{o.title} · w {o.weight}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}
