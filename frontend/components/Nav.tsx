"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Overview"],
  ["/cases/", "Scam DNA"],
  ["/forensics/", "Forensics"],
  ["/upi/", "UPI Guard"],
  ["/campaigns/", "Campaign Radar"],
  ["/history/", "History"],
  ["/extension/", "Browser Protection"],
] as const;

export default function Nav() {
  const path = usePathname() || "/";
  const norm = path.endsWith("/") ? path : path + "/";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav className={`main${open ? " open" : ""}`} aria-label="Main">
      <div className="links" id="main-links">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} aria-current={norm === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}</a>
        ))}
      </div>
      <a href="/forensics/" className="btn primary small nav-cta">Investigate</a>
      <button type="button" className="btn glass small menu-btn" aria-expanded={open} aria-controls="main-links" onClick={() => setOpen((v) => !v)}>
        {open ? "Close" : "Menu"}
      </button>
    </nav>
  );
}
