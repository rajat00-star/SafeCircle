"use client";
import { useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import Nav from "./Nav";

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`site${scrolled ? " scrolled" : ""}`}>
      <div className="container bar">
        <a href="/" className="brand" aria-label="SafeCircle Guardian home">
          <BrandMark />
          <span className="word">SafeCircle<span>Guardian</span></span>
        </a>
        <Nav />
      </div>
    </header>
  );
}
