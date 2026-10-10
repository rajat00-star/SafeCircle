import Analyzer from "@/components/Analyzer";
import LiveDemo from "@/components/LiveDemo";
import Reveal from "@/components/Reveal";
import Scramble from "@/components/Scramble";
import ScanRail from "@/components/ScanRail";
import ScrollIndicator from "@/components/ScrollIndicator";
import ThreatField from "@/components/ThreatField";
import HeroScene from "@/components/HeroLoader";

const HEADLINE = ["The internet", "isn’t always", "what it seems."];
const MARQUEE = ["Urgency", "Impersonation", "OTP requests", "Payment pressure", "Threats", "Secrecy", "Look-alike links", "Remote access"];

export default function Home() {
  return (
    <>
      <ScrollIndicator />
      <section id="hero" className="hero" aria-labelledby="hero-title">
        <HeroScene />
        <div className="container" style={{ width: "100%" }}>
          <div className="hero-grid">
            <div>
              <span className="eyebrow fade-up" style={{ ["--d" as string]: 200 }}>SafeCircle Guardian · Scam &amp; phishing analysis</span>
              <h1 id="hero-title" className="display" aria-label={HEADLINE.join(" ")}>
                {HEADLINE.map((line, i) => (
                  <span className="line" key={line} aria-hidden="true">
                    <span className="rise" style={{ ["--d" as string]: 250 + i * 150 }}>
                      <Scramble text={line.toUpperCase()} delay={350 + i * 150} duration={650} startOnView={false} />
                    </span>
                  </span>
                ))}
              </h1>
            </div>
            <div className="hero-side fade-up" style={{ ["--d" as string]: 800 }}>
              <p className="label-caps" style={{ color: "var(--silver)", lineHeight: 1.9, marginBottom: 16 }}>
                Understand the signals.<br />Expose the deception.<br />Make safer decisions.
              </p>
              <p className="small" style={{ fontSize: 15, color: "var(--muted)" }}>
                Paste a message or link. SafeCircle points to the exact words and link features that look like a scam,
                explains each one, and tells you what to do next.
              </p>
              <div className="row">
                <a href="#analyze" className="btn primary">Analyze a message <span className="arrow" aria-hidden="true">→</span></a>
                <a href="#protection" className="btn glass">Explore protection</a>
              </div>
            </div>
          </div>
          <div className="hero-meta fade-up" style={{ ["--d" as string]: 1100 }}>
            <span>Explainable by design</span>
            <span>Links read, never opened</span>
            <span>Nothing stored by default</span>
            <span>Scroll ↓</span>
          </div>
        </div>
      </section>

      <Analyzer />

      <section className="section" aria-labelledby="manifesto">
        <div className="container">
          <span className="eyebrow">02 / The problem</span>
          <Reveal>
            <p id="manifesto" className="manifesto" style={{ marginTop: 24 }}>
              Scams don&apos;t look like scams. They look like <em>your bank</em>, <em>a parcel</em>, <em>your child on a new number</em>.
              They work by <em>pressure</em>, not by code. So SafeCircle looks for the pressure, and <em>shows you where it is</em>.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i} className={i % 3 === 1 ? "on" : ""}>{m} ✳</span>)}
        </div>
      </div>

      <section id="protection" className="section" aria-labelledby="tactics-title" style={{ scrollMarginTop: 40 }}>
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">03 / What it detects</span>
              <h2 id="tactics-title" className="glow">Every tactic<br />has a tell.</h2>
            </div>
            <p>These are the social-engineering tactics the detector checks, with the weight each one carries. Loaded live from the engine&apos;s model card.</p>
          </div>
          <ThreatField />
        </div>
      </section>

      <section className="section" aria-labelledby="demo-title">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">04 / See it work</span>
              <h2 id="demo-title" className="glow">Evidence,<br />not a guess.</h2>
            </div>
            <p>A real request to the running detector. Every highlight is a span the engine returned, and every score is computed, not illustrated.</p>
          </div>
          <LiveDemo />
        </div>
      </section>

      <section className="section" aria-labelledby="features-title">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">05 / Protection</span>
              <h2 id="features-title" className="glow">Built around<br />your consent.</h2>
            </div>
            <p>Four parts that work today. No universal device monitoring, no reading your SMS or calls: you choose what to check.</p>
          </div>
          <div>
            {[
              ["01", "Tactic detection", "Explainable rules for urgency, impersonation, OTP and PIN requests, payment pressure, threats, secrecy, prize lures and remote-access apps. Safety advice like “never share your OTP” is recognised and not flagged.", ["12 tactic categories", "Evidence spans", "Local language model"], "/#analyze", "Analyze a message"],
              ["02", "Link inspection", "Look-alike brand domains, typos, raw IP addresses, shorteners and free hosting, plus a small domain model. The link is read as text and never visited.", ["Static analysis", "No page fetch", "Domain model"], "/#analyze", "Check a link"],
              ["03", "Trusted circle", "Invite up to five people. They see exactly what they would receive and must accept. Alerts go only when you press send, and either side can end it.", ["Two-sided consent", "Audit trail", "Revocable"], "/contacts/", "Set up contacts"],
              ["04", "Private by default", "Nothing you check is stored unless you turn on history. Optional redacted excerpts, retention from 1 to 365 days, export and delete-everything.", ["Opt-in history", "Redaction", "Export & delete"], "/privacy/", "Privacy controls"],
            ].map(([n, t, d, tags, href, cta], i) => (
              <Reveal className="feature" key={n as string} delay={i * 60}>
                <div className="num">{n as string} —</div>
                <h3><Scramble text={(t as string).toUpperCase()} delay={100} /></h3>
                <div>
                  <p>{d as string}</p>
                  <div className="tags" style={{ marginBottom: 14 }}>{(tags as string[]).map((x) => <span className="tag" key={x}>{x}</span>)}</div>
                  <a href={href as string} className="btn ghost small" style={{ paddingLeft: 0 }}>{cta as string} <span className="arrow" aria-hidden="true">→</span></a>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section lab" aria-labelledby="lab-title">
        <div className="container">
          <div className="section-head">
            <div>
              <span className="eyebrow">06 / The lab</span>
              <h2 id="lab-title" className="glow">Three checks.<br />One verdict.</h2>
            </div>
            <p>Independent signals combine into one score, and each finding keeps the evidence that triggered it. No paid AI service is required.</p>
          </div>
          <div className="lab-strip">
            <Reveal className="lab-panel" delay={0}>
              <span className="label-caps">Signal 01</span>
              <h3>Tactic rules</h3>
              <p>Hand-written, explainable patterns for the pressure tactics scammers use.</p>
            </Reveal>
            <Reveal className="lab-panel center" delay={120}>
              <a href="/how-it-works/" className="lab-link">// The lab →</a>
              <h3>How it decides</h3>
              <p>Weights, thresholds and measured precision and recall on held-out data, served live by the engine.</p>
            </Reveal>
            <Reveal className="lab-panel" delay={240}>
              <span className="label-caps">Signal 02 · 03</span>
              <h3>Links + language</h3>
              <p>Static link inspection with a domain model, and a lightweight text model that shows which words mattered.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <div className="orbit-lines" aria-hidden="true" />
        <div className="container">
          <span className="eyebrow plain">Before you click, pay or share a code</span>
          <h2 id="closing-title" className="glow">Pause.<br />Check.<br />Then decide.</h2>
          <div className="row" style={{ justifyContent: "center" }}>
            <a href="#analyze" className="btn primary large">Analyze a message <span className="arrow" aria-hidden="true">→</span></a>
            <a href="/extension/" className="btn glass large">Get the extension</a>
          </div>
        </div>
      </section>

      <ScanRail />
    </>
  );
}
