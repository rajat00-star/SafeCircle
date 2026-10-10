import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "SafeCircle Guardian",
  description: "Check messages and links for scams, see the evidence in plain language, and loop in someone you trust.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#content" className="skip">Skip to content</a>
        <header className="site">
          <div className="container row">
            <a href="/" className="brand" aria-label="SafeCircle Guardian home">
              <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M16 2 4 7v8c0 7.5 5.1 13.4 12 15 6.9-1.6 12-7.5 12-15V7L16 2z" fill="var(--brand)" />
                <circle cx="16" cy="15" r="6" fill="none" stroke="var(--brand-ink)" strokeWidth="2.4" />
                <circle cx="16" cy="15" r="2" fill="var(--brand-ink)" />
              </svg>
              SafeCircle Guardian
            </a>
            <Nav />
          </div>
        </header>
        <main id="content" className="container">{children}</main>
        <footer className="site">
          <div className="container row">
            <span>SafeCircle Guardian · HackBriven 2026 · Cybersecurity &amp; Digital Trust</span>
            <span className="spacer" />
            <a href="/privacy/">Privacy</a>
            <a href="/how-it-works/">How it works</a>
            <a href="/api/docs">API</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
