"use client";
import { useEffect, useRef, useState } from "react";
import { api, CATEGORY_LABELS, type ModelCard } from "@/lib/api";
import Scramble from "./Scramble";

type Cat = ModelCard["tactic_categories"][number];
// Layout recipe: width class, depth and tilt per card, so the glass sits at different distances.
const LAYOUT = [
  { w: "w5", z: 60, rx: 6, ry: -10, off: false }, { w: "w4", z: -40, rx: -4, ry: 8, off: true }, { w: "w3", z: 20, rx: 5, ry: 12, off: false },
  { w: "w3", z: -80, rx: -6, ry: -12, off: true }, { w: "w5", z: 40, rx: 4, ry: 6, off: false }, { w: "w4", z: -20, rx: -3, ry: -8, off: true },
  { w: "w4", z: 0, rx: 5, ry: 10, off: false }, { w: "w4", z: -60, rx: -5, ry: -6, off: true }, { w: "w4", z: 30, rx: 3, ry: 8, off: false },
];

// The tactics the detector actually looks for, loaded from the live model card (no invented content).
export default function ThreatField() {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.modelCard().then((m) => setCats(m.tactic_categories)).catch(() => setFailed(true));
  }, []);

  // Scroll parallax: each card drifts at a speed tied to its depth. Off for reduced motion.
  useEffect(() => {
    const el = field.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, inView = false;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const p = (window.innerHeight - r.top) / (window.innerHeight + r.height); // 0 → 1 while passing through
      el.querySelectorAll<HTMLElement>(".glass-card").forEach((c) => {
        const z = Number(c.dataset.z || 0);
        c.style.setProperty("--py", `${(0.5 - p) * (80 + z * 0.9)}px`);
      });
    };
    const on = () => { if (inView && !raf) raf = requestAnimationFrame(apply); };
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; on(); });
    io.observe(el);
    window.addEventListener("scroll", on, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [cats]);

  const items: Cat[] = cats ?? (failed ? Object.entries(CATEGORY_LABELS).slice(0, 9).map(([code, title]) => ({ code, title, weight: 0, explanation: "" })) : []);

  return (
    <div className="threat-field" ref={field}>
      {!cats && !failed && (
        <div className="plane">{LAYOUT.slice(0, 6).map((l, i) => <div key={i} className={`glass-card ${l.w}`}><div className="skeleton" style={{ width: "40%" }} /><div className="skeleton" style={{ width: "70%", marginTop: 60 }} /></div>)}</div>
      )}
      {failed && <p className="small muted" style={{ marginBottom: 16 }}>Couldn&apos;t reach the detector to load descriptions; showing the tactic names only.</p>}
      <div className="plane">
        {items.slice(0, 9).map((c, i) => {
          const l = LAYOUT[i % LAYOUT.length];
          return (
            <article key={c.code} className={`glass-card ${l.w}${l.off ? " off" : ""}`} data-z={l.z}
              style={{ ["--z" as string]: `${l.z}px`, ["--rx" as string]: `${l.rx}deg`, ["--ry" as string]: `${l.ry}deg` }}>
              <div className="code"><span>{String(i + 1).padStart(2, "0")} / {c.code.replace(/_/g, " ")}</span>{c.weight > 0 && <span>w {c.weight}</span>}</div>
              <h3><Scramble text={c.title} delay={i * 90} /></h3>
              {c.explanation && <p>{c.explanation}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
