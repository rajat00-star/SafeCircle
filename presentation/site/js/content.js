// Narrative content for the pitch and the architecture scenes.
// Numbers come from window.FACTS (presentation/scripts/build_facts.py, read from committed evaluation files)
// and window.SNAPSHOT (presentation/scripts/snapshot.py, real API output on a throwaway database).
// Nothing here is typed-in performance data.

const F = window.FACTS;
const S = window.SNAPSHOT;

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (m) => `${m.value.toFixed(3)} <span class="mono">(${m.numerator}/${m.denominator})</span>`;
const lvl = (l) => `lvl-${l}`;

export const STAGE_TITLES = { hook: "Approach", pressure: "Pressure", harvest: "Harvest", control: "Control", extraction: "Extraction" };

// ---------- Story (demo runbook) derived from the snapshot ----------
function storyRows() {
  const st = Object.fromEntries(S.story.steps.map((s) => [s.step, s]));
  const caseOf = (s) => (s.kind === "event" ? { level: s.response.case.risk_level, score: s.response.case.risk_score, alert: s.response.alert } : null);
  const upi = (s) => ({ level: s.response.risk_level, score: s.response.risk_score, cu: s.response.case_update });
  const s2 = caseOf(st["2"]), s3 = upi(st["3"]), s4 = upi(st["4"]), s5a = upi(st["5a"]), s5b = caseOf(st["5b"]);
  const s1 = upi(st["1"]);
  return [
    { where: "UPI Guard", what: "Ordinary shop QR checked before paying", quote: "No warning signs found. This does not confirm the payee is genuine.", level: s1.level, score: s1.score, note: "no false alarm" },
    { where: "Scam DNA", what: "First message starts a case", quote: "SBI Refund Desk: your refund of Rs 4,999 has been approved…", level: s2.level, score: s2.score, note: `alert: ${s2.alert.action}` },
    { where: "UPI Guard", what: "The “refund” QR is decoded on the device", quote: "The QR is a payment, but the message promises you will receive money.", level: s3.level, score: s3.score, note: "do not pay" },
    { where: "Scam DNA", what: "QR check attached to the case", quote: `${s4.cu.change.score_before} → ${s4.cu.change.score_after}. Escalated from ${s4.cu.change.level_before} to ${s4.cu.change.level_after}.`, level: s4.cu.risk_level, score: s4.cu.change.score_after, note: `alert: ${s4.cu.alert.action}`, hot: true },
    { where: "UPI Guard", what: "Same check repeated", quote: s5a.cu.alert.reason, level: "high", score: s5a.cu.change.score_after, note: `alert: ${s5a.cu.alert.action}` },
    { where: "Scam DNA", what: "Caller asks for the OTP", quote: s5b.alert.reason, level: s5b.level, score: s5b.score, note: `alert: ${s5b.alert.action}` },
  ];
}

function msSummary() {
  const steps = S.multistage.steps;
  const a = S.multistage.case.assessment;
  return { scores: steps.map((s) => s.case.risk_score), alerts: steps.map((s) => s.alert.action), tactics: a.tactics.length,
    stages: a.stages_observed, events: S.multistage.case.event_count, label: a.score_label };
}

// Product modules, with the real screenshot captured by presentation/scripts/capture-app.mjs.
export const PRODUCT = [
  { name: "Scam DNA", desc: "Case per suspicious episode; every new item re-evaluates it, with what changed, missing and conflicting evidence.", chip: "ok", status: "Implemented", shot: "scam-dna-chain", route: "/cases/" },
  { name: "Scam Forensics", desc: "Message, conversation, link (never opened) or screenshot read by local Tesseract OCR; image not stored.", chip: "ok", status: "Implemented · OCR needs Tesseract", shot: "forensics", route: "/forensics/" },
  { name: "UPI Scam Guard", desc: "Check a UPI ID or payment QR before paying; QR decoded in the browser. Static checks only.", chip: "ok", status: "Implemented · no bank/NPCI data", shot: "upi-guard-high", route: "/upi/" },
  { name: "Campaign Radar", desc: "Groups your own cases by exact shared indicators (hashed) and, separately, by similarity.", chip: "ok", status: "Implemented · your cases only", shot: "campaign-radar", route: "/campaigns/" },
  { name: "Scam Network", desc: "Graph of cases and shared domains, UPI IDs, phones and claimed organisations.", chip: "ok", status: "Implemented", shot: "scam-network", route: "/network/" },
  { name: "Evidence Report", desc: "Redacted timeline and reasoning; export after review as print-PDF, Markdown or JSON. Never sent.", chip: "ok", status: "Implemented", shot: "evidence-report", route: "/cases/report/" },
  { name: "Guardian Shield", desc: "Chrome MV3 extension: check selection or link; warning page with go-back; opt-in link guard.", chip: "warn", status: "Implemented · real-browser run not verified", shot: "guardian-shield-page", route: "/extension/ and extension/" },
  { name: "Trusted contacts", desc: "Two-sided consent before a contact can receive an alert you choose to send.", chip: "ok", status: "Implemented", shot: "trusted-contacts-2026-10-10", shotNote: "Captured on 2026-10-10, before the visual redesign.", route: "/contacts/ and /guardian/" },
];

// ---------- Pitch slides ----------
export const PITCH = [
  {
    id: "hook", kicker: "AI-driven scam pattern recognition · PS02", title: "SafeCircle Guardian",
    camera: 0,
    html: () => `
      <div class="left-only">
        <div class="kicker">AI-driven scam pattern recognition · PS02</div>
        <h1 style="margin-top:16px">SafeCircle<br>Guardian</h1>
        <p class="tagline"><span>Detect the pattern.</span> <span class="r">Disrupt the scam.</span> Protect the user.</p>
        <p class="lede">A UPI, banking and wallet scam rarely arrives as one message. SafeCircle follows the whole episode, explains every piece of evidence, and warns once, at the moment the risk actually changes.</p>
        <div class="chips">
          <span class="chip c">Explainable rules, no paid AI API</span>
          <span class="chip">User-initiated checks only</span>
          <span class="chip demo">All examples: synthetic DEMO DATA</span>
        </div>
      </div>`,
  },
  {
    id: "threat", kicker: "02 · The threat", title: "One scam, many harmless-looking pieces",
    camera: 1,
    html: () => `
      <div class="left-only" style="max-width:min(760px,62vw)">
        <div class="kicker">02 · The threat</div>
        <h2>One scam.<br>Many harmless-looking pieces.</h2>
        <p class="lede">The problem statement asks for detection of emerging AI-enabled scam workflows in UPI, banking and wallet contexts. Generative tools make each message fluent and on-brand, so a single text often looks plausible. The signal is the sequence: a lure, then pressure, then a request for a code, then money moves.</p>
        <div class="stages">
          ${[["hook", "Contact and a borrowed identity or lure"], ["pressure", "Fear, urgency or authority"], ["harvest", "OTP, PIN, password or fake login"], ["control", "Remote-access apps"], ["extraction", "Collect request, transfer or fee"]]
            .map(([k, d], i) => `<div class="stage"><span class="n">0${i + 1}</span><b>${STAGE_TITLES[k]}</b><span>${d}</span></div>`).join("")}
        </div>
        <p class="xsmall" style="margin-top:12px">The five stages are the stage model the engine uses (<span class="mono">backend/app/scamdna/tactics.py</span>). They describe how evidence is organised, not measured attack prevalence.</p>
      </div>`,
  },
  {
    id: "journey", kicker: "03 · The user journey", title: "The moment SafeCircle intervenes",
    camera: 2, dense: true,
    html: () => `
      <div class="cols wide-left">
        <div>
          <div class="kicker">03 · The user journey</div>
          <h2>The moment it intervenes</h2>
          <p class="lede">A synthetic refund scam, replayed through the real API. The first message only earns a warning. The alarm comes when the QR contradicts the promise, and the repeat does not re-alert.</p>
          <div class="chips"><span class="chip demo">DEMO DATA · real engine output</span><span class="chip">Score: heuristic 0–100, not a probability</span></div>
        </div>
        <div class="timeline">
          ${storyRows().map((r) => `<div class="tl${r.hot ? " hot" : ""}"><span class="where">${esc(r.where)}</span>
            <span class="what">${esc(r.what)}<q>${esc(r.quote)}</q></span>
            <span class="score ${lvl(r.level)}">${r.score}<small>${esc(r.level)} · ${esc(r.note)}</small></span></div>`).join("")}
        </div>
      </div>`,
  },
  {
    id: "dna", kicker: "04 · Core innovation", title: "Scam DNA",
    camera: 3,
    html: () => {
      const m = msSummary();
      return `
      <div class="left-only" style="max-width:min(600px,48vw)">
        <div class="kicker">04 · Core innovation</div>
        <h2>Scam DNA</h2>
        <p class="lede">Each case links three layers. What was <b>observed</b> (the text or link you added), the <b>tactics</b> it supports (with the exact words that matched), and the <b>inferred</b> stage progression, drawn as a proposal rather than a fact.</p>
        <div class="glass" style="margin-top:18px">
          <div class="legend"><span><i></i>Observed: supported by submitted evidence</span><span><i class="dash"></i>Inferred: proposed, not confirmed</span></div>
          <p class="small" style="margin:12px 0 0">Synthetic multi-stage case, ${m.events} pieces of evidence: score <span class="mono">${m.scores.join(" → ")}</span>, ${m.tactics} tactics, ${m.stages.length} of 5 stages (${m.stages.map((s) => STAGE_TITLES[s]).join(", ")}). Alerts: <span class="mono">${m.alerts.join(", ")}</span>.</p>
        </div>
        <p class="xsmall" style="margin-top:10px">${esc(m.label)}</p>
        <div class="cta-row"><a class="btn ghost small" href="#/arch/b">Watch it in Scene B →</a></div>
      </div>`;
    },
  },
  {
    id: "product", kicker: "05 · The product", title: "What is built",
    camera: 4, dense: true,
    html: () => `
      <div>
        <div class="kicker">05 · The product</div>
        <h2>What is built today</h2>
        <div class="feature-grid">
          ${PRODUCT.map((f, i) => `<button class="feature" data-feature="${i}" style="text-align:left;cursor:pointer"><h3>${f.name}</h3><p>${f.desc}</p><span class="chip ${f.chip}" style="justify-self:start">${f.status}</span></button>`).join("")}
        </div>
        <p class="xsmall" style="margin-top:10px">Status is checked against the code and test suites in this repository. Select a module to see a real screenshot (DEMO DATA).</p>
      </div>`,
  },
  {
    id: "decision", kicker: "06 · Detection and decisioning", title: "From evidence to a useful alert",
    camera: 5, dense: true,
    html: () => `
      <div class="cols">
        <div>
          <div class="kicker">06 · Detection and decisioning</div>
          <h2>From evidence<br>to one useful alert</h2>
          <ul class="list" style="margin-top:20px">
            <li><span><b>Ingest and redact.</b> Codes, phone numbers, e-mails and card numbers are removed before storage; phones and UPI IDs are compared as keyed hashes.</span></li>
            <li><span><b>Extract.</b> 12 single-message tactic categories plus case tactics, each with the matching text. Links are analysed statically and never fetched.</span></li>
            <li><span><b>Reassess.</b> Every new item re-scores the whole case: strongest weight per tactic, noisy-OR, combination and multi-stage bonuses.</span></li>
            <li><span><b>Doubt.</b> One uncorroborated tactic is held at medium and sent for review. Conflicts, missing evidence and near-threshold scores are shown.</span></li>
            <li><span><b>Decide.</b> Alert only when risk rises or a new high-weight tactic appears; duplicates are suppressed and logged.</span></li>
          </ul>
        </div>
        <div class="glass" style="align-self:center">
          <div class="label">Alert decisions in the engine</div>
          <table class="t" style="margin-top:8px">
            <tr><th>Decision</th><th>Notifies</th></tr>
            <tr><td>new · first medium/high or review</td><td>yes</td></tr>
            <tr><td>escalated · level rose</td><td>yes</td></tr>
            <tr><td>updated · new high-weight tactic</td><td>yes</td></tr>
            <tr><td>suppressed · nothing material changed</td><td>no, logged</td></tr>
            <tr><td>deescalated · level fell</td><td>no, logged</td></tr>
          </table>
          <p class="xsmall" style="margin:10px 0 0">Source: <span class="mono">backend/app/scamdna/alerts.py</span>. The local language model's similarity is reported beside the score and never changes it.</p>
          <div class="cta-row"><a class="btn small" href="#/arch/b">Open the pipeline scene →</a></div>
        </div>
      </div>`,
  },
  {
    id: "architecture", kicker: "07 · System architecture", title: "One deployable unit",
    camera: 6,
    html: () => `
      <div class="left-only" style="max-width:min(620px,50vw)">
        <div class="kicker">07 · System architecture</div>
        <h2>One deployable unit, clear boundaries</h2>
        <p class="lede">A Chrome extension and a Next.js static site call one FastAPI service. Detection is pure Python and deterministic. Cases, redacted evidence and an append-only audit log live in SQLite locally or PostgreSQL in the container setup. Review and reporting stay with the user.</p>
        <ul class="list" style="margin-top:16px">
          <li><span>No HTTP client in the backend: links are never fetched.</span></li>
          <li><span>Optional AI summary is off by default and never changes a score.</span></li>
          <li><span>No bank, NPCI or threat-intelligence feed is connected.</span></li>
        </ul>
        <div class="cta-row"><a class="btn" href="#/arch/a">Enter the 3D walkthrough →</a><a class="btn ghost" href="#/arch/c">Scam network →</a></div>
      </div>`,
  },
  {
    id: "validation", kicker: "08 · Validation", title: "Measured on synthetic, frozen sets",
    camera: 7, dense: true,
    html: () => {
      const v2 = F.v2, v3 = F.v3_after;
      const row = (n, m, me) => `<tr class="${me ? "me" : ""}"><td>${n}</td><td>${m.precision.value.toFixed(3)}</td><td>${m.recall.value.toFixed(3)}</td><td>${m.fpr.value.toFixed(3)}</td></tr>`;
      const errs = v2.errors.map((e) => `<li><span><b>${e.type === "false_positive" ? "False positive" : "False negative"}:</b> ${esc(e.description)} <span class="mono">(${e.outcome}, ${e.score})</span></span></li>`).join("");
      const t = F.tests;
      return `
      <div class="cols wide-left">
        <div>
          <div class="kicker">08 · Validation</div>
          <h2>Honest numbers on a frozen synthetic set</h2>
          <p class="lede" style="max-width:56ch">${v2.scenarios} synthetic scenarios written and checksummed before the first run, scored through the real API with rules unchanged. ${v2.binary_scored} are labelled scam or benign.</p>
          <div class="metrics" style="margin-top:16px">
            <div class="metric"><div class="v">${v2.safecircle.precision.value.toFixed(3)}</div><div class="f">${v2.safecircle.precision.numerator}/${v2.safecircle.precision.denominator}</div><div class="l">Precision</div></div>
            <div class="metric"><div class="v">${v2.safecircle.recall.value.toFixed(3)}</div><div class="f">${v2.safecircle.recall.numerator}/${v2.safecircle.recall.denominator}</div><div class="l">Recall</div></div>
            <div class="metric"><div class="v">${v2.safecircle.fpr.value.toFixed(3)}</div><div class="f">${v2.safecircle.fpr.numerator}/${v2.safecircle.fpr.denominator}</div><div class="l">False-positive rate</div></div>
          </div>
          <div class="label" style="margin-top:14px">Errors in the frozen v2 run (before hardening)</div>
          <ul class="list no" style="margin-top:8px">${errs}</ul>
          ${(() => { const h = F.v2_post_hardening.errors.find((e) => e.description.startsWith("Genuine delivery OTP")); return h ? `<p class="xsmall" style="margin:8px 0 0">After hardening the courier OTP is ${esc(h.outcome)} ${h.score}: still a false positive, no longer high.</p>` : ""; })()}
        </div>
        <div>
          <div class="glass">
            <div class="label">Holdout v2 (n = ${v2.binary_scored})</div>
            <table class="t"><tr><th>System</th><th>P</th><th>R</th><th>FPR</th></tr>
              ${row("SafeCircle case engine", v2.safecircle, true)}${row("Keyword baseline", v2.keyword_baseline)}${row("Single-message detector", v2.single_message_detector)}</table>
          </div>
          <div class="glass">
            <div class="label">v3 check after hardening (n = ${v3.binary_scored}, not independent)</div>
            <table class="t"><tr><th>System</th><th>P</th><th>R</th><th>FPR</th></tr>${row("SafeCircle case engine", v3.safecircle, true)}${row("Keyword baseline", v3.keyword_baseline)}</table>
          </div>
          <p class="xsmall" style="margin-top:10px">Synthetic benchmark performance does not establish real-world fraud-detection accuracy. Tests on this branch: ${t ? esc(t.summary) : "see report"}.</p>
        </div>
      </div>`;
    },
  },
  {
    id: "trust", kicker: "09 · Trust and deployment", title: "Privacy by construction",
    camera: 8, dense: true,
    html: () => `
      <div class="cols">
        <div>
          <div class="kicker">09 · Trust and deployment</div>
          <h2>Privacy and restraint by construction</h2>
          <ul class="list" style="margin-top:18px">
            <li><span><b>You choose what to check.</b> No SMS, call, WhatsApp or transaction monitoring.</span></li>
            <li><span><b>Minimal retention.</b> Redacted excerpts only; screenshots discarded after local OCR; history is opt-in; export and delete-everything.</span></li>
            <li><span><b>Minimal URLs.</b> The extension masks query values and drops fragments before sending.</span></li>
            <li><span><b>Consent.</b> Trusted contacts accept on their side; alerts are sent by the user, never automatically.</span></li>
            <li><span><b>Human review.</b> Conflicts and single-tactic cases go to review; reports export only after a review tick and are never submitted.</span></li>
            <li><span><b>Alert fatigue.</b> Duplicate and minor evidence is suppressed, with every decision in the audit trail.</span></li>
          </ul>
        </div>
        <div class="glass" style="align-self:center">
          <div class="label">Deployment pathway</div>
          <table class="t" style="margin-top:8px">
            <tr><th>Stage</th><th>Status</th></tr>
            <tr><td>Local single process (FastAPI serves the static site)</td><td><span class="status ok">runs</span></td></tr>
            <tr><td>Docker Compose with PostgreSQL</td><td><span class="status partial">configured, image build not run</span></td></tr>
            <tr><td>Render blueprint (<span class="mono">render.yaml</span>)</td><td><span class="status partial">written, not deployed</span></td></tr>
            <tr><td>Pilot with consenting users</td><td><span class="status opt">proposed</span></td></tr>
            <tr><td>Bank or NPCI integration</td><td><span class="status no">none</span></td></tr>
          </table>
          <p class="xsmall" style="margin:10px 0 0">Not production-ready: no external security audit, English only, rate limiter is per instance.</p>
        </div>
      </div>`,
  },
  {
    id: "finale", kicker: "10 · 48-hour finale plan", title: "The 48-hour finale plan",
    camera: 9, dense: true,
    html: () => `
      <div>
        <div class="kicker">10 · 48-hour finale plan</div>
        <h2>The 48-hour finale plan</h2>
        <p class="lede">Proposed milestones. Each is judged on data the rules were not tuned on, and each ends with the demo dry run still green.</p>
        <div class="plan">
          <div class="glass"><span class="when">H 0–12</span><h3 style="margin-top:6px">Fresh evaluation set</h3><p class="small">A v4 synthetic set written by a teammate who has not read the rules, frozen with a checksum before any run.</p><p class="xsmall">Owner: evaluation lead</p></div>
          <div class="glass"><span class="when">H 12–24</span><h3 style="margin-top:6px">Known errors</h3><p class="small">Single-tactic false positives (login alerts, booking confirmations) and the registration-fee job scam; org claims drawn as weaker links.</p><p class="xsmall">Owner: detection lead</p></div>
          <div class="glass"><span class="when">H 24–36</span><h3 style="margin-top:6px">Demo hardening</h3><p class="small">Rebuild the served site, rename realistic demo UPI handles, rehearse the six-minute story on the presentation laptop.</p><p class="xsmall">Owner: product and demo lead</p></div>
          <div class="glass"><span class="when">H 36–48</span><h3 style="margin-top:6px">Ship and explain</h3><p class="small">Publish the repository, deploy the blueprint if hosting is approved, re-run every suite, update the paper with v4 numbers.</p><p class="xsmall">Owner: whole team</p></div>
        </div>
        <div class="glass" style="margin-top:12px">
          <div class="label">Demo success criteria</div>
          <p class="small" style="margin:6px 0 0"><span class="mono">demo_story_check.py</span> passes · browser demo suite 12/12 · no console errors · a fresh-set report published with errors listed · every claim on screen traceable to a file in the repository.</p>
        </div>
      </div>`,
  },
];

// ---------- Scene A: system components (verified against the repository) ----------
export const COMPONENTS = [
  { id: "user", tier: 0, name: "User and browser", short: "User",
    purpose: "Decides what to check. SafeCircle never reads SMS, calls, WhatsApp, e-mail or transactions on its own.",
    inputs: ["A message, link, screenshot, UPI ID or QR the user chooses to submit"], outputs: ["Requests from the dashboard or the extension"],
    status: [["ok", "By design"]], files: ["docs/privacy.md"] },
  { id: "extension", tier: 0, name: "Guardian Shield extension", short: "Guardian Shield",
    purpose: "Chrome Manifest V3 extension: check selected text or a link from the context menu, check the current tab from the toolbar, and optionally check links before they open.",
    inputs: ["Selected text", "Right-clicked link (sent in full, user-submitted)", "Toolbar tab URL and link-guard clicks, sent as a minimal URL (query values masked, fragment dropped)"],
    outputs: ["POST /api/v1/analyze/message and /analyze/url", "Warning page with Go back and an acknowledged Open anyway"],
    status: [["ok", "Implemented"], ["ok", "25/25 node tests (mocked chrome.*)"], ["ok", "17/17 extension pages in Chrome (stubbed chrome.*)"], ["no", "Installed extension runtime not verified"]],
    files: ["extension/background.js", "extension/shield.js", "extension/popup.js"] },
  { id: "dashboard", tier: 0, name: "Next.js dashboard", short: "Next.js dashboard",
    purpose: "Next.js 15 + TypeScript static export: Overview, Scam DNA, Forensics, UPI Guard, Campaign Radar, Network, Evidence report, trusted contacts, privacy and history.",
    inputs: ["User actions", "QR images, decoded in the browser with BarcodeDetector (never uploaded)"],
    outputs: ["Same-origin JSON calls to /api/v1", "Reports generated in the browser"],
    status: [["ok", "Implemented"], ["ok", "Type-check and static build pass (15 routes)"], ["ok", "Browser suites 18 + 21 + 30 + 12 checks"]],
    files: ["frontend/app/", "frontend/lib/api.ts"] },
  { id: "api", tier: 1, name: "FastAPI API boundary", short: "FastAPI · /api/v1",
    purpose: "The only server. Validates input, enforces rate and size limits, sets security headers and CSP, and logs method, path, status and timing only.",
    inputs: ["JSON from the dashboard and extension (CORS limited to the site and chrome-extension origins)", "Bearer profile token (stored as SHA-256)"],
    outputs: ["Routers: analyze, cases, forensics, upi, campaigns, network, demo, profiles, contacts, guardian, meta"],
    status: [["ok", "Implemented"], ["ok", "176/176 backend tests on SQLite"]],
    files: ["backend/app/main.py", "backend/app/routers/", "backend/app/security.py"] },
  { id: "detector", tier: 2, name: "Single-message detector", short: "Detector",
    purpose: "Pure-Python analysis of one message or link: normalisation, 12 tactic categories with evidence spans, static URL analysis with a hostname model, a TF-IDF + logistic-regression message model, noisy-OR fusion.",
    inputs: ["Text or URL"], outputs: ["Tactics with matched text, URL signals, model probability"],
    status: [["ok", "Implemented"], ["ok", "Model files pinned by SHA-256 before loading"]],
    files: ["backend/app/detector/"] },
  { id: "casengine", tier: 2, name: "Scam DNA case engine", short: "Scam DNA engine",
    purpose: "Turns evidence into a case: redaction, case tactics, assess_case (re-scored on every item), conflicts, missing evidence, uncertainty, alert decisions, Campaign Radar, network, UPI Guard and reports. Screenshots are read with local Tesseract.",
    inputs: ["Redacted events and their detections"], outputs: ["Risk level and heuristic score, attack chain, review state, alert decision"],
    status: [["ok", "Implemented"], ["partial", "Synthetic validation only (see Validation)"]],
    files: ["backend/app/scamdna/assessment.py", "backend/app/scamdna/alerts.py", "backend/app/scamdna/campaigns.py"] },
  { id: "llm", tier: 2, name: "Optional AI summary", short: "Optional AI summary",
    purpose: "Plain-language summary through Claude when an operator enables it. Never decides or changes a score.",
    inputs: ["An analysis result"], outputs: ["Summary text shown beside the deterministic result"],
    status: [["opt", "Off by default"], ["partial", "Tested with a mocked client only"]],
    files: ["backend/app/services/llm.py"], optional: true },
  { id: "db", tier: 3, name: "Case and evidence store", short: "SQLite · PostgreSQL",
    purpose: "SQLAlchemy 2 with Alembic migrations. Profiles, opt-in history, trusted contacts and consent events, cases, redacted events, append-only case log, campaign dismissals. Child rows cascade-delete with the profile.",
    inputs: ["Redacted evidence, assessments, audit entries"], outputs: ["Case history for reassessment, Campaign Radar and reports"],
    status: [["ok", "SQLite (dev, tests, demo)"], ["partial", "PostgreSQL in Docker Compose; image build not run"]],
    files: ["backend/app/models.py", "backend/alembic/"] },
  { id: "review", tier: 1, name: "Human review and reporting", short: "Review · report · contacts",
    purpose: "Cases needing review are flagged. The evidence report shows the redacted timeline, reasoning and uncertainty, exports only after a review tick, and is never submitted anywhere. Trusted contacts receive an alert only if the user sends it and they consented.",
    inputs: ["Case assessment and audit log"], outputs: ["Print-PDF, Markdown or JSON created in the browser", "Consent-based alert to a trusted contact"],
    status: [["ok", "Implemented"], ["ok", "Review gating checked in the browser suite"]],
    files: ["backend/app/scamdna/report.py", "frontend/app/cases/report/", "backend/app/routers/contacts.py"] },
];

export const FLOWS = [
  ["user", "dashboard", "Submits evidence"],
  ["user", "extension", "Selects text or clicks a link"],
  ["extension", "api", "analyze/message, analyze/url (minimal URL)"],
  ["dashboard", "api", "cases, forensics, upi, campaigns, network"],
  ["api", "detector", "Single message or link"],
  ["api", "casengine", "Case events"],
  ["casengine", "detector", "Reuses detection per event"],
  ["casengine", "db", "Redacted events, audit log"],
  ["api", "db", "Profiles, contacts, consent"],
  ["casengine", "review", "Review state, report data"],
  ["review", "user", "Report export, consented alert"],
  ["llm", "api", "Optional summary (off by default)", true],
];

export const TIERS = ["Clients · user-initiated", "API boundary · review", "Detection logic", "Persistence"];

export function narrativeIndex() {
  return [...PITCH.map((p, i) => ({ route: `#/pitch/${i + 1}`, n: String(i + 1).padStart(2, "0"), title: p.title, group: "Pitch" })),
    { route: "#/arch/a", n: "A", title: "End-to-end system", group: "Architecture" },
    { route: "#/arch/b", n: "B", title: "Scam detection pipeline", group: "Architecture" },
    { route: "#/arch/c", n: "C", title: "Scam intelligence network", group: "Architecture" }];
}
