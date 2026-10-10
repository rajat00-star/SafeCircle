import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import BrandMark from "@/components/BrandMark";

// Fonts are downloaded at build time and served from this site, so the CSP (font-src 'self') still holds.
const display = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-chakra", display: "swap" });
const ui = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "SafeCircle Guardian",
  description: "Check messages and links for scams, see the evidence in plain language, and loop in someone you trust.",
};
export const viewport: Viewport = { themeColor: "#060609", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${mono.variable}`}>
      <body>
        <a href="#content" className="skip">Skip to content</a>
        <SiteHeader />
        <main id="content">{children}</main>
        <footer className="site">
          <div className="container">
            <div className="foot-grid">
              <div>
                <a href="/" className="brand" aria-label="SafeCircle Guardian home">
                  <BrandMark id="bm-foot" />
                  <span className="word">SafeCircle<span>Guardian</span></span>
                </a>
                <p className="small" style={{ maxWidth: 340, marginTop: 18 }}>
                  Explainable scam and phishing checks with consent-based trusted contacts. Built for HackBriven 2026,
                  Cybersecurity &amp; Digital Trust track.
                </p>
              </div>
              <div>
                <h4>Product</h4>
                <ul>
                  <li><a href="/#analyze">Analyze</a></li>
                  <li><a href="/history/">History</a></li>
                  <li><a href="/contacts/">Trusted contacts</a></li>
                  <li><a href="/extension/">Browser extension</a></li>
                </ul>
              </div>
              <div>
                <h4>Trust</h4>
                <ul>
                  <li><a href="/privacy/">Privacy</a></li>
                  <li><a href="/how-it-works/">How it works</a></li>
                  <li><a href="/api/docs">API docs</a></li>
                </ul>
              </div>
              <div>
                <h4>If you were scammed</h4>
                <ul>
                  <li>India: call 1930 or cybercrime.gov.in</li>
                  <li>US: reportfraud.ftc.gov</li>
                  <li>UK: forward texts to 7726</li>
                </ul>
              </div>
            </div>
            <div className="wordmark" aria-hidden="true">SafeCircle</div>
            <div className="fine">
              <span>No detector is perfect. A low score is not a guarantee of safety.</span>
              <span>Links are read, never opened.</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
