"use client";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Check"],
  ["/history/", "History"],
  ["/contacts/", "Trusted contacts"],
  ["/privacy/", "Privacy"],
  ["/how-it-works/", "How it works"],
  ["/extension/", "Browser extension"],
] as const;

export default function Nav() {
  const path = usePathname() || "/";
  const norm = path.endsWith("/") ? path : path + "/";
  return (
    <nav className="main" aria-label="Main">
      {LINKS.map(([href, label]) => (
        <a key={href} href={href} aria-current={norm === href ? "page" : undefined}>{label}</a>
      ))}
    </nav>
  );
}
