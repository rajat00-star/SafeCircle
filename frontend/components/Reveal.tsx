"use client";
import { useEffect, useRef } from "react";

// Fades/slides children in once they enter the viewport. Content is visible without JS
// only after hydration; reduced-motion users get it immediately (see .reveal in globals.css).
export default function Reveal({ children, delay = 0, as: Tag = "div", className = "", ...rest }:
  { children: React.ReactNode; delay?: number; as?: "div" | "section" | "li" | "article"; className?: string } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { el.classList.add("in"); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const El = Tag as React.ElementType;
  return <El ref={ref} className={`reveal ${className}`} style={{ ["--d" as string]: delay }} {...rest}>{children}</El>;
}
