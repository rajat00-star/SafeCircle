import Analyzer from "@/components/Analyzer";
import LiveDemo from "@/components/LiveDemo";
import Reveal from "@/components/Reveal";
import Scramble from "@/components/Scramble";
import ScanRail from "@/components/ScanRail";
import ScrollIndicator from "@/components/ScrollIndicator";
import TacticSection from "@/components/TacticSection";
import GlobeHero from "@/components/GlobeHero";
import OverviewDashboard from "@/components/OverviewDashboard";

const MARQUEE = ["Urgency", "Impersonation", "OTP requests", "Payment pressure", "Threats", "Secrecy", "Look-alike links", "Remote access"];

export default function Home() {
  return (
    <>
      <ScrollIndicator />
      <GlobeHero />

      <OverviewDashboard />

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

      <TacticSection />

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
