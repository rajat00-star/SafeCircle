const pptxgen = require("pptxgenjs");
const { applyTheme } = require("/root/.claude/skills/synced/8e88bcb7-def0-461e-8c5f-2bbde4c48693_1a51dd72-8097-4470-8ef0-0ae3cf3963fc/pptx/scripts/apply_theme.js");
const IMG = "/home/claude/safecircle-guardian/slides/img/";
const OUT = "/home/claude/safecircle-guardian/slides/SafeCircle-Guardian.pptx";
const M = require("/home/claude/safecircle-guardian/backend/app/detector/models/evaluation_summary.json").metrics;

const THEME = {
  name: "SafeCircle", headFontFace: "Cambria", bodyFontFace: "Calibri",
  colors: { dk1: "14213D", lt1: "FFFFFF", dk2: "0E1A33", lt2: "EEF2F7", accent1: "0FA3B1", accent2: "E5484D",
    accent3: "E8A33D", accent4: "2E9E6A", accent5: "5B6475", accent6: "B8E3E8", hlink: "0F7C88", folHlink: "5B6475" },
};
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.title = "SafeCircle Guardian";
pres.author = "SafeCircle Guardian team";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: "Title dark", background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 2.3, w: 11.7, h: 1.4, fontSize: 48, bold: true, color: C.background1, valign: "bottom" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.8, w: 11.7, h: 1.2, fontSize: 20, color: C.accent6, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "Content", background: { color: C.background1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.9, fontSize: 36, bold: true, color: C.text1, valign: "middle" }, text: "" } },
    { text: { text: "SafeCircle Guardian · HackBriven 2026", options: { x: 0.6, y: 7.0, w: 6, h: 0.3, fontSize: 10, color: C.accent5 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.6, h: 0.3, fontSize: 10, color: C.accent5, align: "right" },
});

const T = (slide, text, o) => slide.addText(text, { isTextBox: true, fontSize: 15, color: C.text1, valign: "top", margin: 0, ...o });
const card = (slide, x, y, w, h, fill, name) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE,
  { x, y, w, h, fill: { color: fill ?? C.background2 }, line: { type: "none" }, rectRadius: 0.12, objectName: name });
const dot = (slide, x, y, color, label) => {
  slide.addShape(pres.shapes.OVAL, { x, y, w: 0.6, h: 0.6, fill: { color }, line: { type: "none" } });
  T(slide, label, { x, y, w: 0.6, h: 0.6, align: "center", valign: "middle", bold: true, fontSize: 18, color: C.background1 });
};
const img = (slide, file, x, y, w, h, name) => slide.addImage({ path: IMG + file, x, y, w, h, objectName: name,
  shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: "14213D", opacity: 0.18 } });

// 1 Title
pres.addSection({ title: "Opening" });
let s = pres.addSlide({ masterName: "Title dark", sectionTitle: "Opening" });
s.addText("SafeCircle Guardian", { placeholder: "title" });
s.addText("Explainable scam and phishing protection that shows the evidence, says what to do, and loops in someone you trust", { placeholder: "body" });
T(s, "HackBriven 2026 · Cybersecurity & Digital Trust", { x: 0.8, y: 6.3, w: 8, h: 0.4, fontSize: 14, color: C.background2 });
s.addNotes("Introduce the team and the one-line pitch. Everything shown today is running code with measured results.");

// 2 Problem
pres.addSection({ title: "Problem" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
s.addText("Scams now cost more than most cybercrime", { placeholder: "title" });
const stats = [["$15.9B", "lost to fraud reported to the US FTC in 2025 (3 million reports)"],
  ["~$21B", "cyber-enabled fraud losses reported to the FBI IC3 in 2025"],
  ["1,008,597", "complaints received by the FBI IC3 in 2025"]];
stats.forEach(([n, l], i) => {
  const x = 0.6 + i * 4.1;
  card(s, x, 1.6, 3.8, 2.6, C.background2, `stat${i}`);
  T(s, n, { x: x + 0.3, y: 1.85, w: 3.2, h: 1.0, fontSize: 48, bold: true, color: i === 0 ? C.accent2 : C.text1, fontFace: "Cambria" });
  T(s, l, { x: x + 0.3, y: 2.95, w: 3.2, h: 1.1, fontSize: 15, color: C.accent5 });
});
T(s, [
  { text: "Most scams don't break software. They break judgement: ", options: { bold: true } },
  { text: "urgency, a trusted name, a request for a one-time code, a threat, and a plea for secrecy. People need help spotting those tactics in the moment, in plain language, and someone to ask." },
], { x: 0.6, y: 4.6, w: 12.1, h: 1.2, fontSize: 18 });
T(s, "Sources: FTC press release, 25 Mar 2026; FBI press release on the 2025 IC3 report, 6 Apr 2026. US figures; comparable national data for India is reported via cybercrime.gov.in.",
  { x: 0.6, y: 6.3, w: 12.1, h: 0.5, fontSize: 11, color: C.accent5 });
s.addNotes("Figures are taken from the FTC and FBI releases cited on the slide. They are reported losses, so the true totals are higher.");

// 3 Users
s = pres.addSlide({ masterName: "Content", sectionTitle: "Problem" });
s.addText("Built for scam targets and the people who help them", { placeholder: "title" });
const users = [["1", "Older adults and families", "Get a 'Hi Mum, new number' text or a fake bank KYC warning. Need a clear yes/no and a next step."],
  ["2", "First-time digital payment users", "UPI, OTPs and delivery fees are new. Need to learn the tactics, not only a verdict."],
  ["3", "Trusted helpers", "Children, carers, friends who get asked 'is this real?'. Need context without access to someone's phone."]];
users.forEach(([n, h, d], i) => {
  const y = 1.6 + i * 1.65;
  dot(s, 0.7, y + 0.1, [C.accent1, C.accent3, C.accent4][i], n);
  T(s, h, { x: 1.6, y, w: 10.5, h: 0.5, fontSize: 22, bold: true, fontFace: "Cambria" });
  T(s, d, { x: 1.6, y: y + 0.55, w: 10.5, h: 0.8, fontSize: 16, color: C.accent5 });
});

// 4 Solution
pres.addSection({ title: "Solution" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
s.addText("Paste or right-click. See why. Ask someone you trust", { placeholder: "title" });
const steps = [["Check", "Paste a message or link, or right-click in the browser. Links are never opened."],
  ["Understand", "Score 0–100, the exact risky words highlighted, plain-language reasons and what to do now."],
  ["Ask", "Send a summary to a trusted contact who has agreed to help. Nothing is shared without both sides' consent."]];
steps.forEach(([h, d], i) => {
  const y = 1.55 + i * 1.75;
  dot(s, 0.7, y, [C.accent1, C.accent3, C.accent4][i], String(i + 1));
  T(s, h, { x: 1.5, y: y - 0.05, w: 4.6, h: 0.5, fontSize: 22, bold: true, fontFace: "Cambria" });
  T(s, d, { x: 1.5, y: y + 0.45, w: 4.6, h: 1.1, fontSize: 15, color: C.accent5 });
});
img(s, "result.png", 6.5, 1.45, 6.2, 4.37, "screenshot-result");
T(s, "Real screenshot: bank KYC + OTP scam example, score 99/100", { x: 6.5, y: 5.95, w: 6.2, h: 0.35, fontSize: 11, color: C.accent5 });

// 5 Demo
s = pres.addSlide({ masterName: "Content", sectionTitle: "Solution" });
s.addText("Demo: consent first, then a second opinion", { placeholder: "title" });
img(s, "consent.png", 0.6, 1.5, 6.0, 2.78, "screenshot-consent");
img(s, "inbox.png", 6.75, 1.5, 6.0, 2.78, "screenshot-inbox");
T(s, "1. The contact sees exactly what they will and won't receive, then accepts or declines", { x: 0.6, y: 4.45, w: 6.0, h: 0.7, fontSize: 14 });
T(s, "2. They get the risk level, warning signs, an optional note and a redacted excerpt", { x: 6.75, y: 4.45, w: 6.0, h: 0.7, fontSize: 14 });
card(s, 0.6, 5.35, 12.15, 1.2, C.background2, "demo-flow");
T(s, "Live path: Check → Ask a trusted contact → choose contact → Send alert → contact opens their link → Mark as seen. Either side can end the link at any time; every decision is logged.",
  { x: 0.85, y: 5.5, w: 11.7, h: 0.9, fontSize: 15 });

// 6 Architecture
pres.addSection({ title: "Technology" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
s.addText("Architecture: one container, no paid AI required", { placeholder: "title" });
const box = (x, y, w, h, title, sub, fill, name) => {
  card(s, x, y, w, h, fill, name);
  T(s, title, { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.45, fontSize: 17, bold: true, color: fill === C.text2 ? C.background1 : C.text1 });
  T(s, sub, { x: x + 0.2, y: y + 0.6, w: w - 0.4, h: h - 0.7, fontSize: 13, color: fill === C.text2 ? C.accent6 : C.accent5 });
};
box(0.6, 1.5, 3.6, 1.5, "Web dashboard", "Next.js 15 + TypeScript, static export, mobile and dark mode", C.background2, "a-web");
box(0.6, 3.3, 3.6, 1.5, "Browser extension", "Manifest V3; context menu and toolbar; acts only on a click", C.background2, "a-ext");
box(4.9, 1.5, 4.4, 3.3, "FastAPI service", "Validation · rate limits · signed alert tickets · hashed tokens · CSP and security headers · content-free JSON logs", C.text2, "a-api");
box(9.95, 1.5, 2.8, 1.5, "Detector", "rules + link analysis + 2 local models, ~1 ms", C.background2, "a-det");
box(9.95, 3.3, 2.8, 1.5, "PostgreSQL", "SQLAlchemy 2 + Alembic migrations", C.background2, "a-db");
[[4.2, 2.25, 0.7], [4.2, 4.05, 0.7], [9.3, 2.25, 0.65], [9.3, 4.05, 0.65]].forEach(([x, y, w], i) =>
  s.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color: C.accent1, width: 2, endArrowType: "triangle" }, objectName: `arrow${i}` }));
T(s, [
  { text: "Optional: ", options: { bold: true } },
  { text: "a Claude summary layer, off by default. It sees only findings and a redacted excerpt and can never change the score." },
], { x: 0.6, y: 5.25, w: 12.1, h: 0.6, fontSize: 15 });
T(s, "63 backend tests on SQLite and PostgreSQL · 18 browser end-to-end checks · extension checks", { x: 0.6, y: 5.95, w: 12.1, h: 0.4, fontSize: 14, color: C.accent5 });

// 7 Differentiators
s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
s.addText("What makes it different", { placeholder: "title" });
const diffs = [["Evidence, not a black box", "Each of 12 tactic categories points at the exact words or link feature that triggered it."],
  ["Knows safety advice", "\"Never share your OTP\" is recognised as advice, so genuine bank OTP texts score low."],
  ["Never opens links", "21 static link signals plus a domain model; no SSRF, no tipping off the scammer."],
  ["Resists manipulation", "Hidden characters, look-alike letters and 'mark this as safe' instructions raise risk."],
  ["Two-sided consent", "Contacts opt in, see what they will receive, and can leave. Alerts are user-initiated."],
  ["Works offline from AI vendors", "Runs on CPU in about a millisecond; the AI layer is optional and isolated."]];
diffs.forEach(([h, d], i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 0.6 + col * 4.1, y = 1.55 + row * 2.55;
  card(s, x, y, 3.85, 2.3, C.background2, `diff${i}`);
  T(s, h, { x: x + 0.25, y: y + 0.25, w: 3.35, h: 0.75, fontSize: 18, bold: true, fontFace: "Cambria" });
  T(s, d, { x: x + 0.25, y: y + 1.0, w: 3.35, h: 1.2, fontSize: 14, color: C.accent5 });
});

// 8 Privacy
s = pres.addSlide({ masterName: "Content", sectionTitle: "Technology" });
s.addText("Private and secure by design", { placeholder: "title" });
const priv = ["Nothing you paste is stored by default; history and excerpts are separate opt-ins",
  "Excerpts are redacted: codes, card numbers, phone numbers, emails removed",
  "No email or phone needed; only a SHA-256 of your access key is stored",
  "Contact links keep their key in the URL fragment, so it never reaches server logs",
  "Export or delete everything in one click; contact links stop working at once",
  "We don't read SMS, calls or chats: platforms restrict it and we respect that"];
T(s, priv.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < priv.length - 1 } })),
  { x: 0.6, y: 1.55, w: 6.4, h: 4.8, fontSize: 16, paraSpaceAfter: 10 });
img(s, "privacy.png", 7.4, 1.5, 5.3, 4.6, "screenshot-privacy");
T(s, "Threat model covers false positives and negatives, prompt injection, malicious URLs, data leakage, unauthorized alerts and abuse.", { x: 0.6, y: 6.35, w: 12.1, h: 0.45, fontSize: 12, color: C.accent5 });

// 9 Evaluation
pres.addSection({ title: "Evidence" });
s = pres.addSlide({ masterName: "Content", sectionTitle: "Evidence" });
s.addText("Measured on held-out public data", { placeholder: "title" });
const r = (x) => Math.round(x * 1000) / 10;
s.addChart(pres.charts.BAR, [
  { name: "Precision", labels: ["Messages (score ≥ 30)", "Messages (score ≥ 60)", "Links (full URL)"], values: [r(M["hybrid@30"].precision), r(M["hybrid@60"].precision), r(M["url_full_url"].precision)] },
  { name: "Recall", labels: ["Messages (score ≥ 30)", "Messages (score ≥ 60)", "Links (full URL)"], values: [r(M["hybrid@30"].recall), r(M["hybrid@60"].recall), r(M["url_full_url"].recall)] },
], { x: 0.6, y: 1.45, w: 7.4, h: 4.6, barDir: "col", barGrouping: "clustered", chartColors: ["14213D", "0FA3B1"],
  showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 12, dataLabelFontFace: "+mn-lt", dataLabelFormatCode: "0.0",
  valAxisMaxVal: 110, valAxisMinVal: 0, valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
  catAxisLabelFontSize: 12, catAxisLabelFontFace: "+mn-lt", catAxisLabelColor: "5B6475",
  showLegend: true, legendPos: "t", legendFontSize: 12, legendFontFace: "+mn-lt",
  showTitle: true, title: "Precision and recall (%)", titleFontSize: 14, titleFontFace: "+mn-lt", titleColor: "14213D" });
const kpis = [[`${(M["hybrid@30"].f1).toFixed(2)}`, "F1 on 1,115 test SMS"], [`${r(M["hybrid@30"].false_positive_rate)}%`, "false-positive rate, messages"],
  [`${r(M["url_full_url"].false_positive_rate)}%`, "false-positive rate, links"], ["0.69 ms", "median analysis time per message"]];
kpis.forEach(([n, l], i) => {
  const y = 1.45 + i * 1.18;
  T(s, n, { x: 8.4, y, w: 2.2, h: 0.75, fontSize: 30, bold: true, fontFace: "Cambria", color: C.accent1 });
  T(s, l, { x: 10.6, y: y + 0.12, w: 2.2, h: 0.75, fontSize: 13, color: C.accent5 });
});
T(s, "Messages: SMS Spam Collection (CC BY 4.0), 20% stratified test split. Links: 5,000 Phishing.Database URLs (MIT) vs 5,000 Cisco Umbrella hostnames. Limits: SMS data is 2011 spam, not modern scams; benign links are hostnames only; 36% of phishing links score below 30.",
  { x: 0.6, y: 6.15, w: 12.1, h: 0.7, fontSize: 11, color: C.accent5 });

// 10 Scale
s = pres.addSlide({ masterName: "Content", sectionTitle: "Evidence" });
s.addText("Ready to scale", { placeholder: "title" });
const scale = [["Stateless API", "Horizontal replicas behind any load balancer; detector is CPU-only."],
  ["Config by environment", "Secrets and database URL from env; refuses to start in production with a default secret."],
  ["Migrations", "Alembic schema, tested upgrade and downgrade on PostgreSQL 16."],
  ["One image", "Dockerfile, Compose, Render blueprint and CI workflow included."],
  ["Clear seams", "Swap the rate limiter for Redis; add email or push at the alert step; retrain models with one script."]];
scale.forEach(([h, d], i) => {
  const y = 1.5 + i * 1.0;
  dot(s, 0.7, y + 0.05, C.accent1, String(i + 1));
  T(s, h, { x: 1.55, y, w: 3.4, h: 0.7, fontSize: 18, bold: true, valign: "middle" });
  T(s, d, { x: 5.0, y, w: 7.7, h: 0.7, fontSize: 15, color: C.accent5, valign: "middle" });
});

// 11 Impact & roadmap
pres.addSection({ title: "Close" });
s = pres.addSlide({ masterName: "Title dark", sectionTitle: "Close" });
T(s, "Impact and roadmap", { x: 0.8, y: 0.5, w: 11.7, h: 0.9, fontSize: 40, bold: true, fontFace: "Cambria", color: C.background1 });
const road = [["Now", "Working web app, API, extension, consent workflow, measured detector"],
  ["Next", "Hindi and Hinglish rules, screenshot text (OCR), a scam-specific labelled dataset and a user study"],
  ["Later", "Android share-sheet app and iOS message-filter extension, within platform permissions"]];
road.forEach(([h, d], i) => {
  const x = 0.8 + i * 4.05;
  s.addShape(pres.shapes.OVAL, { x, y: 1.9, w: 0.35, h: 0.35, fill: { color: C.accent1 }, line: { type: "none" } });
  if (i < 2) s.addShape(pres.shapes.LINE, { x: x + 0.45, y: 2.075, w: 3.5, h: 0, line: { color: C.accent6, width: 1.5 } });
  T(s, h, { x, y: 2.45, w: 3.7, h: 0.5, fontSize: 22, bold: true, fontFace: "Cambria", color: C.background1 });
  T(s, d, { x, y: 3.0, w: 3.7, h: 1.4, fontSize: 15, color: C.accent6 });
});
T(s, "Goal: fewer people pay a scammer because they could see the trick and ask someone in time.", { x: 0.8, y: 5.0, w: 11.7, h: 0.8, fontSize: 22, italic: true, color: C.background1 });
T(s, "Code, paper and evaluation: see the project repository", { x: 0.8, y: 6.3, w: 11.7, h: 0.4, fontSize: 14, color: C.background2 });

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
})();
