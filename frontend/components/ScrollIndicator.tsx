"use client";
import { useEffect, useRef } from "react";

// Thin progress hairline on the right edge (reference: scroll indicator). Decorative.
export default function ScrollIndicator() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (bar.current) bar.current.style.transform = `scaleY(${max > 0 ? window.scrollY / max : 0})`;
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);
  return <div className="scroll-ind" aria-hidden="true"><div ref={bar} /></div>;
}
