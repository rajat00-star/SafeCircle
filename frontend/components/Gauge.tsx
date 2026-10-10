"use client";
import { useEffect, useState } from "react";

// Risk dial: 270° arc with hairline ticks. The arc and the number animate up to the real
// score once; reduced-motion users see the final value immediately.
export default function Gauge({ score, level }: { score: number; level: "low" | "medium" | "high" }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(score); return; }
    let raf = 0;
    const t0 = performance.now(), dur = 1200;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setShown(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const r = 78, c = 2 * Math.PI * r, sweep = 0.75;
  const color = `var(--${level})`;
  const ticks = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className="gauge" role="img" aria-label={`Risk score ${score} out of 100`}>
      <svg viewBox="0 0 188 188">
        <g transform="rotate(135 94 94)">
          {ticks.map((i) => {
            const a = (i / (ticks.length - 1)) * sweep * 2 * Math.PI;
            const on = i / (ticks.length - 1) <= shown / 100;
            return <line key={i} x1={94 + Math.cos(a) * 90} y1={94 + Math.sin(a) * 90} x2={94 + Math.cos(a) * 85} y2={94 + Math.sin(a) * 85}
              stroke={on ? color : "rgba(255,255,255,.18)"} strokeWidth="1.2" />;
          })}
          <circle cx="94" cy="94" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="8" strokeDasharray={`${c * sweep} ${c}`} strokeLinecap="round" />
          <circle className="arc" cx="94" cy="94" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${Math.max(0.001, (shown / 100) * c * sweep)} ${c}`} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
        </g>
      </svg>
      <div className="num" aria-hidden="true"><div><b>{shown}</b><small>/ 100 RISK</small></div></div>
    </div>
  );
}
