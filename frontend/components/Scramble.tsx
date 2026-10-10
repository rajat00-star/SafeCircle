"use client";
import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>*+=";

// Decodes text into place with scrambling characters (reference: card titles "decode in").
// Screen readers always get the final text via aria-label; reduced motion shows it immediately.
export default function Scramble({ text, delay = 0, duration = 700, className = "", startOnView = true }:
  { text: string; delay?: number; duration?: number; className?: string; startOnView?: boolean }) {
  const [out, setOut] = useState(text);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setOut(text); return; }
    let raf = 0, timer = 0, started = false;
    const run = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const settled = Math.floor(p * text.length);
        let s = "";
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          s += i < settled || ch === " " || ch === "\n" ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        setOut(s);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      timer = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    };
    if (!startOnView || !("IntersectionObserver" in window)) { run(); }
    const io = startOnView ? new IntersectionObserver(([e]) => { if (e.isIntersecting) { run(); io?.disconnect(); } }, { threshold: 0.2 }) : null;
    if (io && ref.current) io.observe(ref.current);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); io?.disconnect(); };
  }, [text, delay, duration, startOnView]);

  return (
    <span ref={ref} className={`scramble ${className}`} aria-label={text}>
      <span aria-hidden="true">{out}</span>
    </span>
  );
}
