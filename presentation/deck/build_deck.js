// Builds presentation/SafeCircle-Guardian-PS02.pptx: 10 pitch slides plus a separated appendix.
// Every number is read from presentation/content/facts.json or the API snapshot in presentation/site/data,
// and every screenshot is a real capture (presentation/scripts/capture-app.mjs, capture-site.mjs).
//
//   cd presentation/deck && npm ci && node build_deck.js
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const JSZip = require("jszip");
const sizeOf = require("image-size").imageSize || require("image-size");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "SafeCircle-Guardian-PS02.pptx");
const IMG = (n) => path.join(__dirname, "img", `${n}.jpg`);
const F = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "facts.json"), "utf8"));
const SNAP = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "site", "data", `${n}.json`), "utf8"));
const STORY = SNAP("story"), MS = SNAP("multistage"), DOUBT = SNAP("doubt"), NET = SNAP("network");

// ---------- Theme: the same tokens as presentation/site/css/site.css ----------
const HEX = { bg: "05070D", navy: "0B1224", panel: "0F1830", panel2: "131F3B", line: "22324F", text: "E9F0FB", muted: "9AA8C2", faint: "6C7A96",
  cyan: "3EE6FF", violet: "A08CFF", threat: "FF5468", low: "5CEBB0", medium: "FFB84D", high: "FF6161" };
const THEME = { name: "SafeCircle Guardian", headFontFace: "Arial", bodyFontFace: "Calibri",
  colors: { dk1: HEX.bg, lt1: "FFFFFF", dk2: HEX.navy, lt2: HEX.text, accent1: HEX.cyan, accent2: HEX.violet, accent3: HEX.threat,
    accent4: HEX.low, accent5: HEX.medium, accent6: HEX.muted, hlink: HEX.cyan, folHlink: HEX.violet } };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.title = "SafeCircle Guardian: AI-driven scam pattern recognition (PS02)";
pres.author = "SafeCircle Guardian team";
pres.subject = "Pitch deck. All examples are synthetic DEMO DATA.";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333, M = 0.6;
const TEXT = C.background2, MUTED = C.accent6, CYAN = C.accent1, VIOLET = C.accent2, THREAT = C.accent3, LOW = C.accent4, MED = C.accent5;
const LEVEL = { low: LOW, medium: MED, high: THREAT };

// ---------- Layouts ----------
const footer = [
  { text: { text: "SafeCircle Guardian · PS02 · All examples are synthetic DEMO DATA", options: { x: M, y: 7.02, w: 8, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
];
pres.defineSlideMaster({
  title: "Title", background: { color: HEX.bg },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.35, w: 7.4, h: 1.7, fontSize: 54, bold: true, color: C.background2, valign: "bottom", fontFace: "Arial", charSpacing: 1, margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "Content", background: { color: HEX.bg },
  margin: [0.5, M, 0.6, M],
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: M, y: 0.32, w: 9, h: 0.3, fontSize: 11, color: C.accent1, bold: true, charSpacing: 3, margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.62, w: W - 2 * M, h: 0.8, fontSize: 32, bold: true, color: C.background2, valign: "top", fontFace: "Arial", margin: 0 }, text: "" } },
    ...footer,
  ],
  slideNumber: { x: W - M - 0.6, y: 7.02, w: 0.6, h: 0.3, fontSize: 10, color: C.accent6, align: "right" },
});
pres.defineSlideMaster({
  title: "Section", background: { color: HEX.navy },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.8, w: 10, h: 1.0, fontSize: 44, bold: true, color: C.background2, fontFace: "Arial", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 3.9, w: 10, h: 1.0, fontSize: 16, color: C.accent6, margin: 0 }, text: "" } },
  ],
});

// ---------- Helpers ----------
let objN = 0;
const name = (p) => `${p}-${++objN}`;
const imgSize = (n) => { const d = sizeOf(fs.readFileSync(IMG(n))); return { w: d.width, h: d.height }; };
function image(s, n, x, y, w, h, opts = {}) {
  const d = imgSize(n);
  if (h == null) h = w * (d.h / d.w);
  if (w == null) w = h * (d.w / d.h);
  s.addImage({ path: IMG(n), x, y, w, h, objectName: name(n), altText: opts.alt || n, ...(opts.sizing ? { sizing: opts.sizing } : {}) });
  if (opts.frame !== false) s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { type: "none" }, line: { color: HEX.line, width: 1 }, objectName: name("frame") });
  return { x, y, w, h };
}
function panel(s, x, y, w, h, fill = HEX.panel) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill, transparency: 8 }, line: { color: HEX.line, width: 1 }, objectName: name("panel") });
}
function text(s, t, x, y, w, h, o = {}) {
  s.addText(t, { x, y, w, h, isTextBox: true, margin: 0, fontSize: 14, color: TEXT, valign: "top", objectName: name("text"), ...o });
}
function label(s, t, x, y, w, color = MUTED) { text(s, t.toUpperCase(), x, y, w, 0.25, { fontSize: 10, bold: true, charSpacing: 2, color }); }
function chip(s, t, x, y, w, color) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.32, rectRadius: 0.16, fill: { color: HEX.bg, transparency: 20 }, line: { color: color === MED ? HEX.medium : color === THREAT ? HEX.threat : color === LOW ? HEX.low : HEX.cyan, width: 1 }, objectName: name("chip") });
  text(s, t, x, y, w, 0.32, { fontSize: 10, bold: true, color, align: "center", valign: "middle", charSpacing: 1 });
}
function hline(s, x, y, w, color, dashed) {
  s.addShape(pres.shapes.LINE, { x, y, w, h: 0, line: { color, width: 2, dashType: dashed ? "dash" : "solid" }, objectName: name("line") });
}
function dot(s, x, y, color, d = 0.14) { s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { type: "none" }, objectName: name("dot") }); }
function content(kicker, title, section) {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: section });
  s.addText(kicker.toUpperCase(), { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  return s;
}
const pct = (m) => m.value.toFixed(3);
const frac = (m) => `${m.numerator}/${m.denominator}`;

// =====================================================================================================
// 1. Hook
pres.addSection({ title: "Pitch (10 slides)" });
{
  const s = pres.addSlide({ masterName: "Title", sectionTitle: "Pitch (10 slides)" });
  s.background = { path: IMG("hook-helix") };
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 7.6, h: 7.5, fill: { color: HEX.bg, transparency: 25 }, line: { type: "none" }, objectName: name("scrim") });
  text(s, "AI-DRIVEN SCAM PATTERN RECOGNITION · PROBLEM STATEMENT 02", M, 1.85, 7.2, 0.3, { fontSize: 11, bold: true, color: CYAN, charSpacing: 3 });
  s.addText("SafeCircle Guardian", { placeholder: "title" });
  text(s, [
    { text: "Detect the pattern. ", options: { color: CYAN } },
    { text: "Disrupt the scam.", options: { color: THREAT, breakLine: true } },
    { text: "Protect the user.", options: { color: TEXT } },
  ], M, 4.2, 7.0, 0.85, { fontSize: 22, bold: true });
  text(s, "A UPI, banking or wallet scam rarely arrives as one message. SafeCircle follows the whole episode, explains every piece of evidence, and warns once, when the risk actually changes.", M, 5.15, 6.6, 0.85, { fontSize: 15, color: MUTED });
  chip(s, "EXPLAINABLE RULES · NO PAID AI API", M, 6.15, 3.2, CYAN);
  chip(s, "USER-INITIATED CHECKS ONLY", M + 3.35, 6.15, 2.6, CYAN);
  chip(s, "ALL EXAMPLES: SYNTHETIC DEMO DATA", M, 6.55, 3.2, MED);
  text(s, "Amazon AI Cyber Security Hackathon · Problem Statement 02", M, 7.05, 7, 0.3, { fontSize: 10, color: MUTED });
  s.addNotes("Open on the problem statement in one line: AI-enabled scam workflows across UPI, banking and wallets, and the requirement to alert at the right time without alert fatigue. SafeCircle's answer is to treat a scam as a pattern over several events, not as one message. Mention up front that every example in this deck is synthetic DEMO DATA and that the score is a heuristic indicator, not a probability. The helix image is an illustration rendered by our 3D walkthrough, not data.");
}

// 2. Threat
{
  const s = content("02 · The threat", "One scam, many harmless-looking pieces", "Pitch (10 slides)");
  text(s, "The problem statement asks for detection of emerging AI-enabled scam workflows in UPI, banking and wallet contexts. Generative tools make each message fluent and on-brand, so a single text often looks plausible.", M, 1.6, 7.4, 1.1, { fontSize: 16, color: MUTED });
  text(s, "The signal is the sequence: a lure, then pressure, then a request for a code, then money moves.", M, 2.75, 7.4, 0.6, { fontSize: 18, bold: true });
  image(s, "dna-closeup", 8.45, 1.55, 4.28, null, { alt: "Illustration of the Scam DNA helix from the 3D walkthrough" });
  const stages = [["01", "Approach", "Contact and a borrowed identity or lure"], ["02", "Pressure", "Fear, urgency or authority"], ["03", "Harvest", "OTP, PIN, password or fake login"], ["04", "Control", "Remote-access apps"], ["05", "Extraction", "Collect request, transfer or fee"]];
  const bw = 2.25, gap = 0.18, y = 4.25;
  stages.forEach(([n, t, d], i) => {
    const x = M + i * (bw + gap);
    panel(s, x, y, bw, 1.75);
    text(s, n, x + 0.2, y + 0.18, 1, 0.25, { fontSize: 11, bold: true, color: CYAN });
    text(s, t.toUpperCase(), x + 0.2, y + 0.45, bw - 0.4, 0.4, { fontSize: 17, bold: true, fontFace: "Arial" });
    text(s, d, x + 0.2, y + 0.9, bw - 0.4, 0.75, { fontSize: 13, color: MUTED });
    if (i < 4) s.addShape(pres.shapes.CHEVRON, { x: x + bw + 0.03, y: y + 0.78, w: 0.12, h: 0.2, fill: { color: HEX.cyan }, line: { type: "none" }, objectName: name("chev") });
  });
  text(s, "These five stages are the stage model the engine uses (backend/app/scamdna/tactics.py). They organise evidence; they are not measured prevalence.", M, 6.25, 12, 0.5, { fontSize: 11, color: MUTED, italic: true });
  s.addNotes("Keep this qualitative: we did not measure how common AI-enabled scams are, so we make no prevalence claim. The point is structural. Each piece can look harmless, but the sequence across SMS, calls, links and QR codes is what gives the scam away. These are the five stages the engine tracks.");
}

// 3. Journey
{
  const s = content("03 · The user journey", "The moment SafeCircle intervenes", "Pitch (10 slides)");
  const st = Object.fromEntries(STORY.steps.map((x) => [x.step, x]));
  const rows = [
    ["UPI Guard", "Ordinary shop QR checked before paying", st["1"].response.risk_level, st["1"].response.risk_score, "no false alarm"],
    ["Scam DNA", "First message: “SBI Refund Desk: your refund of Rs 4,999 has been approved…”", st["2"].response.case.risk_level, st["2"].response.case.risk_score, `alert: ${st["2"].response.alert.action}`],
    ["UPI Guard", "“Refund” QR decoded on the device: it is a payment, not a credit", st["3"].response.risk_level, st["3"].response.risk_score, "do not pay"],
    ["Scam DNA", `QR attached to the case: ${st["4"].response.case_update.change.score_before} → ${st["4"].response.case_update.change.score_after}`, st["4"].response.case_update.risk_level, st["4"].response.case_update.change.score_after, `alert: ${st["4"].response.case_update.alert.action}`],
    ["UPI Guard", "Same check repeated", "high", st["5a"].response.case_update.change.score_after, `alert: ${st["5a"].response.case_update.alert.action}`],
    ["Scam DNA", "Caller asks for the OTP", st["5b"].response.case.risk_level, st["5b"].response.case.risk_score, `alert: ${st["5b"].response.alert.action}`],
  ];
  const x0 = 6.05, rw = W - M - x0, rh = 0.74;
  rows.forEach(([where, what, lvl, score, note], i) => {
    const y = 1.6 + i * (rh + 0.08);
    panel(s, x0, y, rw, rh, i === 3 ? "2A1420" : HEX.panel);
    text(s, where.toUpperCase(), x0 + 0.18, y + 0.12, 1.2, 0.5, { fontSize: 10, bold: true, color: MUTED, charSpacing: 1 });
    text(s, what, x0 + 1.4, y + 0.1, rw - 2.9, rh - 0.15, { fontSize: 13, valign: "middle" });
    text(s, String(score), x0 + rw - 1.4, y + 0.04, 1.25, 0.42, { fontSize: 24, bold: true, color: LEVEL[lvl], align: "right", fontFace: "Arial" });
    text(s, `${lvl} · ${note}`, x0 + rw - 2.0, y + 0.46, 1.85, 0.25, { fontSize: 10, color: MUTED, align: "right" });
  });
  image(s, "upi-guard-high", M, 1.6, 5.15, null, { alt: "UPI Scam Guard showing high risk for the refund QR (DEMO DATA)" });
  text(s, "Real screenshot: UPI Scam Guard on the refund QR (DEMO DATA).", M, 4.95, 5.15, 0.3, { fontSize: 11, color: MUTED });
  text(s, "The first message only earns a warning. The alarm comes when the QR contradicts the promise, and repeats do not re-alert.", M, 5.4, 5.15, 0.9, { fontSize: 15, bold: true });
  text(s, "Scores are heuristic 0–100 indicators, not probabilities. Output of the real API on a throwaway database.", M, 6.4, 5.15, 0.5, { fontSize: 11, color: MUTED, italic: true });
  s.addNotes("This is the demo story from docs/demo-runbook.md, replayed through the real API by presentation/scripts/snapshot.py. Point out the restraint: the first message is only medium, the QR check is what proves the contradiction (a payment presented as a refund), and the escalation happens when evidence is joined into one case. Repeats are suppressed, so the user gets one alert, not four. In the live demo the same steps run in the app.");
}

// 4. Scam DNA
{
  const s = content("04 · Core innovation", "Scam DNA: observed evidence, inferred pattern", "Pitch (10 slides)");
  image(s, "scam-dna-chain", M, 1.6, 7.3, null, { alt: "Attack chain view of the synthetic multi-stage case" });
  text(s, "Real screenshot: the attack chain for the synthetic multi-stage case, after four pieces of evidence.", M, 5.3, 7.3, 0.3, { fontSize: 11, color: MUTED });
  const x = 8.25, w = W - M - x;
  label(s, "Three layers per case", x, 1.6, w, CYAN);
  const layers = [[false, CYAN, "Observed evidence", "The text, call note, link or QR the user added, stored redacted."], [false, TEXT, "Tactics with matched words", "Each tactic keeps the exact words or link signal that triggered it."], [true, VIOLET, "Inferred stages", "Approach → Extraction, drawn dashed: a proposal, not a fact."]];
  layers.forEach(([dash, col, t, d], i) => {
    const y = 1.95 + i * 0.85;
    hline(s, x, y + 0.14, 0.45, dash ? HEX.violet : col === CYAN ? HEX.cyan : HEX.text, dash);
    text(s, t, x + 0.6, y, w - 0.6, 0.3, { fontSize: 14, bold: true, color: col });
    text(s, d, x + 0.6, y + 0.3, w - 0.6, 0.5, { fontSize: 12, color: MUTED });
  });
  const scores = MS.steps.map((f) => f.case.risk_score);
  s.addChart(pres.charts.LINE, [{ name: "Case score", labels: ["#1 KYC threat", "#2 Login link", "#3 OTP call", "#4 Payment"], values: scores }], {
    x, y: 4.5, w, h: 2.0, showTitle: true, title: "Case score as evidence arrives (0–100)", titleFontSize: 11, titleColor: HEX.muted, titleFontFace: "+mn-lt",
    chartColors: [HEX.threat], lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 7, showValue: true, dataLabelPosition: "t", dataLabelColor: HEX.text, dataLabelFontSize: 10, dataLabelFontFace: "+mn-lt",
    valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 30, valAxisLabelColor: HEX.muted, catAxisLabelColor: HEX.muted, valAxisLabelFontSize: 9, catAxisLabelFontSize: 9,
    valAxisLabelFontFace: "+mn-lt", catAxisLabelFontFace: "+mn-lt", valGridLine: { color: HEX.line, size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, objectName: name("chart"),
  });
  text(s, `Alerts: ${MS.steps.map((f) => f.alert.action).join(" → ")}. ${MS.case.assessment.score_label}`, M, 5.75, 7.3, 0.75, { fontSize: 12, color: MUTED });
  s.addNotes(`The core idea: separate what we saw from what we infer. Solid lines are supported by submitted evidence; dashed lines are the stage model's proposal. The chart is the real score after each of the four synthetic messages (${scores.join(", ")}), with the alert decision at each step. The model similarity score is shown beside the result but never changes the score.`);
}

// 5. Product
{
  const s = content("05 · The product", "What is built today", "Pitch (10 slides)");
  const feats = [
    ["Scam DNA", "A case per suspicious episode; each item re-evaluates it, with what changed, missing and conflicting evidence.", "Implemented", LOW],
    ["Scam Forensics", "Message, conversation, link (never opened) or screenshot read by local Tesseract OCR.", "Implemented · needs Tesseract", LOW],
    ["UPI Scam Guard", "Check a UPI ID or payment QR before paying; QR decoded in the browser.", "Implemented · no bank/NPCI data", LOW],
    ["Campaign Radar", "Groups your own cases by exact shared indicators and, separately, by similarity.", "Implemented · own cases only", LOW],
    ["Scam Network", "Graph of cases and shared domains, UPI IDs, phones and claimed organisations.", "Implemented", LOW],
    ["Evidence Report", "Redacted timeline and reasoning; exported after review, never sent anywhere.", "Implemented", LOW],
    ["Guardian Shield", "Chrome MV3 extension: check a selection or link; warning page; opt-in link guard.", "Real-browser run not verified", MED],
    ["Trusted contacts", "Two-sided consent before a contact can receive an alert the user sends.", "Implemented", LOW],
  ];
  const cw = (W - 2 * M - 3 * 0.18) / 4, ch = 1.62;
  feats.forEach(([t, d, st, col], i) => {
    const x = M + (i % 4) * (cw + 0.18), y = 1.6 + Math.floor(i / 4) * (ch + 0.15);
    panel(s, x, y, cw, ch);
    text(s, t.toUpperCase(), x + 0.18, y + 0.15, cw - 0.36, 0.3, { fontSize: 14, bold: true, fontFace: "Arial" });
    text(s, d, x + 0.18, y + 0.47, cw - 0.36, 0.8, { fontSize: 11, color: MUTED });
    dot(s, x + 0.18, y + ch - 0.31, col === MED ? HEX.medium : HEX.low, 0.12);
    text(s, st, x + 0.38, y + ch - 0.36, cw - 0.5, 0.25, { fontSize: 10.5, bold: true, color: col });
  });
  const shots = [["forensics", "Scam Forensics"], ["campaign-radar", "Campaign Radar"], ["evidence-report", "Evidence report"], ["guardian-shield-page", "Browser protection page"]];
  const sw = cw, sh = sw / 1.6, sy = 1.6 + 2 * (ch + 0.15) + 0.05;
  shots.forEach(([n, cap], i) => {
    const x = M + i * (cw + 0.18);
    image(s, n, x, sy, sw, sh, { alt: `${cap} screenshot (DEMO DATA)` });
    text(s, cap, x, sy + sh + 0.05, sw, 0.25, { fontSize: 10, color: MUTED });
  });
  s.addNotes("Every module here is in the repository and covered by tests; the status line says what is not verified. The Guardian Shield extension's code is tested with a mocked chrome API and its pages were run in Chrome with a stub, but loading the installed extension in a real Chrome profile has not been verified. Screenshots are from the running app on a scratch database with DEMO DATA.");
}

// 6. Detection and decisioning
{
  const s = content("06 · Detection and decisioning", "From evidence to one useful alert", "Pitch (10 slides)");
  const steps = [["Ingest and redact", "Codes, phones, e-mails and card numbers removed; phones and UPI IDs compared as keyed hashes."],
    ["Extract", "Tactics with the matching words; links analysed statically, never fetched."],
    ["Reassess", "Every item re-scores the case: strongest weight per tactic, noisy-OR, combination and stage bonuses."],
    ["Doubt", "One uncorroborated tactic is held at medium and sent for review; conflicts and missing evidence shown."],
    ["Decide", "Alert only when risk rises or a high-weight tactic appears; duplicates suppressed and logged."]];
  const bw = (W - 2 * M - 4 * 0.22) / 5;
  steps.forEach(([t, d], i) => {
    const x = M + i * (bw + 0.22);
    panel(s, x, 1.6, bw, 2.05);
    text(s, `0${i + 1}`, x + 0.18, 1.75, 0.6, 0.25, { fontSize: 11, bold: true, color: CYAN });
    text(s, t, x + 0.18, 2.02, bw - 0.36, 0.35, { fontSize: 15, bold: true });
    text(s, d, x + 0.18, 2.42, bw - 0.36, 1.15, { fontSize: 11.5, color: MUTED });
    if (i < 4) s.addShape(pres.shapes.CHEVRON, { x: x + bw + 0.05, y: 2.5, w: 0.12, h: 0.22, fill: { color: HEX.cyan }, line: { type: "none" }, objectName: name("chev") });
  });
  const hdr = (t) => ({ text: t, options: { bold: true, color: MUTED, fontSize: 10.5, fill: { color: HEX.navy } } });
  const cell = (t, col = TEXT) => ({ text: t, options: { color: col, fontSize: 12 } });
  s.addTable([
    [hdr("Alert decision"), hdr("When"), hdr("Notifies")],
    [cell("new", THREAT), cell("First medium or high, or review needed"), cell("yes")],
    [cell("escalated", THREAT), cell("Risk level rose"), cell("yes")],
    [cell("updated", MED), cell("New high-weight tactic, same level"), cell("yes")],
    [cell("suppressed", MUTED), cell("Nothing material changed"), cell("no, logged")],
    [cell("deescalated", MUTED), cell("Risk level fell"), cell("no, logged")],
  ], { x: M, y: 3.95, w: 6.4, colW: [1.5, 3.7, 1.2], border: { type: "solid", color: HEX.line, pt: 0.75 }, fill: { color: HEX.panel }, rowH: 0.36, fontFace: "Calibri", objectName: name("table") });
  text(s, "Source: backend/app/scamdna/alerts.py", M, 6.2, 6.4, 0.25, { fontSize: 10, color: MUTED });
  const d0 = DOUBT.frames[0], d1 = DOUBT.frames[1];
  const x = 7.35, w = W - M - x;
  panel(s, x, 3.95, w, 2.6, HEX.panel2);
  label(s, "Real output: lone OTP request, then a retraction", x + 0.2, 4.1, w - 0.4, VIOLET);
  text(s, [
    { text: `1 · “${d0.input.text}”`, options: { breakLine: true, color: TEXT } },
    { text: `${d0.case.risk_level} ${d0.case.risk_score}, review required: one tactic cannot make a case high on its own.`, options: { breakLine: true, color: MED } },
    { text: `2 · “${d1.input.text}”`, options: { breakLine: true, color: TEXT } },
    { text: `Conflict recorded; score unchanged at ${d1.case.risk_score}; alert ${d1.alert.action}. A newer message is not more trustworthy.`, options: { color: VIOLET } },
  ], x + 0.2, 4.45, w - 0.4, 2.0, { fontSize: 12, paraSpaceAfter: 4 });
  s.addNotes("Walk the five steps. The two things judges usually ask about are uncertainty and alert fatigue. The right-hand box is real engine output: a lone OTP request is held at 59 and sent for review instead of being called high; a later 'please ignore' message is flagged as a conflict and does not lower the score. The language model's similarity is reported beside the score and never changes it.");
}

// 7. Architecture
{
  const s = content("07 · System architecture", "One deployable unit, clear boundaries", "Pitch (10 slides)");
  image(s, "scene-a", 4.85, 1.5, W - M - 4.85, null, { alt: "Scene A of the 3D walkthrough: the system by layer" });
  const layers = [["Clients · user-initiated", [["Guardian Shield extension (MV3)", MED], ["Next.js 15 static dashboard", LOW]]],
    ["API boundary", [["FastAPI: validation, rate and size limits, CSP, content-free logs", LOW]]],
    ["Detection logic", [["Single-message detector (rules, URL analysis, local models)", LOW], ["Scam DNA case engine and alert decisions", LOW], ["Optional AI summary: off by default, never scores", VIOLET]]],
    ["Persistence", [["SQLite locally; PostgreSQL via Docker Compose", MED]]],
    ["Review and reporting", [["Review states, evidence report, consented alerts", LOW]]]];
  let y = 1.5;
  layers.forEach(([t, items]) => {
    label(s, t, M, y, 4.0, CYAN);
    y += 0.28;
    items.forEach(([it, col]) => {
      dot(s, M, y + 0.07, col === MED ? HEX.medium : col === VIOLET ? HEX.violet : HEX.low, 0.11);
      text(s, it, M + 0.2, y, 3.95, 0.45, { fontSize: 11.5 });
      y += it.length > 46 ? 0.48 : 0.3;
    });
    y += 0.1;
  });
  text(s, "Green: implemented and tested · amber: partial or configured only · violet: optional", M, 6.45, 4.1, 0.45, { fontSize: 10, color: MUTED });
  text(s, "Rendered from the interactive 3D walkthrough (presentation/site, Scene A). No bank, NPCI or threat-intelligence feed is connected; links are never fetched.", 4.85, 6.25, W - M - 4.85, 0.5, { fontSize: 11, color: MUTED });
  s.addNotes("If time allows, switch to the 3D walkthrough here (press A). Every module in Scene A is a real component of the repository; clicking one shows its inputs, outputs, verified status and source files. The deployable unit is one FastAPI container that also serves the static site. The amber items are honest: the extension's real-browser run and the PostgreSQL container image build were not verified in this environment.");
}

// 8. Validation
{
  const v2 = F.v2, v3 = F.v3_after, sc = v2.safecircle;
  const s = content("08 · Validation", "Honest numbers on a frozen synthetic set", "Pitch (10 slides)");
  text(s, `${v2.scenarios} synthetic scenarios, labels and checksum committed before the first run, scored through the real API with the rules unchanged. ${v2.binary_scored} are labelled scam (${v2.scam}) or benign (${v2.benign}).`, M, 1.5, 7.2, 0.75, { fontSize: 14, color: MUTED });
  [["Precision", sc.precision], ["Recall", sc.recall], ["False-positive rate", sc.fpr]].forEach(([t, m], i) => {
    const x = M + i * 2.45;
    panel(s, x, 2.35, 2.3, 1.45);
    text(s, pct(m), x + 0.2, 2.45, 2.0, 0.7, { fontSize: 36, bold: true, color: i === 2 ? MED : CYAN, fontFace: "Arial" });
    text(s, frac(m), x + 0.2, 3.1, 2.0, 0.25, { fontSize: 12, color: TEXT });
    text(s, t.toUpperCase(), x + 0.2, 3.4, 2.0, 0.25, { fontSize: 10, bold: true, color: MUTED, charSpacing: 1 });
  });
  label(s, "Errors in the frozen v2 run (before hardening)", M, 4.05, 7.2, THREAT);
  const errs = v2.errors.map((e, i) => ({ text: `${e.type === "false_positive" ? "False positive" : "False negative"}: ${e.description} (${e.outcome}, ${e.score})`, options: { bullet: true, breakLine: i < v2.errors.length - 1 } }));
  text(s, errs, M, 4.33, 7.2, 1.35, { fontSize: 12, paraSpaceAfter: 2 });
  const ho5 = F.v2_post_hardening.errors.find((e) => e.description.startsWith("Genuine delivery OTP"));
  text(s, `After hardening the courier OTP is ${ho5 ? `${ho5.outcome} ${ho5.score}` : "medium"}: still a false positive, no longer high. v3 check (${v3.binary_scored} scenarios, not independent): P ${pct(v3.safecircle.precision)}, R ${pct(v3.safecircle.recall)}, FPR ${pct(v3.safecircle.fpr)}, unchanged by the fixes.`, M, 5.72, 7.2, 0.55, { fontSize: 12, color: MUTED });
  const t = F.tests;
  text(s, `Tests on this branch: ${t ? t.summary : "see report"}.`, M, 6.33, 7.2, 0.45, { fontSize: 11, color: MUTED });
  const sys = [["Case engine", sc], ["Keyword baseline", v2.keyword_baseline], ["Single-message", v2.single_message_detector]];
  s.addChart(pres.charts.BAR, sys.map(([n, m]) => ({ name: n, labels: ["Precision", "Recall", "False-positive rate"], values: [m.precision.value, m.recall.value, m.fpr.value] })), {
    x: 8.0, y: 1.5, w: W - M - 8.0, h: 4.25, barDir: "col", barGrouping: "clustered", barGapWidthPct: 60,
    showTitle: true, title: `Holdout v2, n = ${v2.binary_scored} (higher is better except FPR)`, titleFontSize: 11, titleColor: HEX.muted, titleFontFace: "+mn-lt",
    chartColors: [HEX.cyan, HEX.violet, HEX.faint], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.00", dataLabelColor: HEX.text, dataLabelFontSize: 9, dataLabelFontFace: "+mn-lt",
    valAxisMinVal: 0, valAxisMaxVal: 1, valAxisMajorUnit: 0.25, valAxisLabelFormatCode: "0.00", valAxisLabelColor: HEX.muted, catAxisLabelColor: HEX.text, valAxisLabelFontSize: 9, catAxisLabelFontSize: 10,
    valAxisLabelFontFace: "+mn-lt", catAxisLabelFontFace: "+mn-lt", valGridLine: { color: HEX.line, size: 0.5 }, catGridLine: { style: "none" },
    showLegend: true, legendPos: "b", legendColor: HEX.text, legendFontSize: 10, legendFontFace: "+mn-lt", objectName: name("chart"),
  });
  panel(s, 8.0, 5.95, W - M - 8.0, 0.8, "2A1420");
  text(s, "Synthetic benchmark performance does not establish real-world fraud-detection accuracy.", 8.2, 6.02, W - M - 8.4, 0.65, { fontSize: 13, bold: true, color: TEXT, valign: "middle" });
  s.addNotes(`Read the numbers with their fractions: ${frac(sc.precision)} precision, ${frac(sc.recall)} recall, ${frac(sc.fpr)} false positives. The baselines ran on the same set: a keyword baseline and our own original single-message detector, which flags far more benign messages because it judges each message alone. Then read the errors aloud; they are the honest part. The v3 set was written after reading the rules, so it is a check, not a benchmark. Sources: ${v2.source} and ${v3.source}.`);
}

// 9. Trust and deployment
{
  const s = content("09 · Trust and deployment", "Privacy, consent and a realistic path", "Pitch (10 slides)");
  const items = [["You choose what to check", "No SMS, call, WhatsApp or transaction monitoring; mobile platforms restrict that access and we do not work around it."],
    ["Minimal retention", "Redacted excerpts only; screenshots discarded after local OCR; history is opt-in; export and delete-everything."],
    ["Minimal URLs", "The extension masks query values and drops fragments before sending a clicked link."],
    ["Consent", "Trusted contacts accept on their side; alerts are sent by the user, never automatically."],
    ["Human review", "Conflicts and single-tactic cases go to review; reports export only after a review tick and are never submitted."],
    ["Alert fatigue", "Duplicates and minor additions are suppressed, and every decision is in the case's audit trail."]];
  items.forEach(([t, d], i) => {
    const y = 1.55 + i * 0.86;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: y + 0.04, w: 0.36, h: 0.36, rectRadius: 0.08, fill: { color: HEX.cyan, transparency: 82 }, line: { color: HEX.cyan, width: 1 }, objectName: name("icon") });
    text(s, String(i + 1), M, y + 0.04, 0.36, 0.36, { fontSize: 12, bold: true, color: CYAN, align: "center", valign: "middle" });
    text(s, t, M + 0.55, y, 5.9, 0.3, { fontSize: 14, bold: true });
    text(s, d, M + 0.55, y + 0.3, 5.9, 0.5, { fontSize: 11.5, color: MUTED });
  });
  const hdr = (t) => ({ text: t, options: { bold: true, color: MUTED, fontSize: 10.5, fill: { color: HEX.navy } } });
  const row = (a, b, col) => [{ text: a, options: { color: TEXT, fontSize: 12 } }, { text: b, options: { color: col, fontSize: 12, bold: true } }];
  label(s, "Deployment pathway", 7.35, 1.55, 5, CYAN);
  s.addTable([
    [hdr("Stage"), hdr("Status")],
    row("Local single process (FastAPI serves the static site)", "Runs", LOW),
    row("Docker Compose with PostgreSQL", "Configured; image build not run", MED),
    row("Render blueprint (render.yaml)", "Written; not deployed", MED),
    row("Pilot with consenting users", "Proposed", VIOLET),
    row("Bank, NPCI or payment-app integration", "None", THREAT),
  ], { x: 7.35, y: 1.9, w: W - M - 7.35, colW: [3.25, W - M - 7.35 - 3.25], border: { type: "solid", color: HEX.line, pt: 0.75 }, fill: { color: HEX.panel }, rowH: 0.5, fontFace: "Calibri", objectName: name("table") });
  panel(s, 7.35, 5.25, W - M - 7.35, 1.35, HEX.panel2);
  text(s, "Not production-ready: no external security audit, English only, per-instance rate limiter, no real-world labelled dataset yet. No legal, regulatory or banking certification has been obtained.", 7.55, 5.38, W - M - 7.75, 1.1, { fontSize: 12, color: MUTED });
  s.addNotes("Privacy is a design constraint, not a feature list. The extension change to minimal URLs was measured: about 0.2–0.3% of phishing URLs in our sets lose a warning, which we accept for privacy. The deployment table is deliberately conservative: only the local single-process mode has been run here.");
}

// 10. Finale plan
{
  const s = content("10 · 48-hour finale plan", "The 48-hour finale plan", "Pitch (10 slides)");
  text(s, "Proposed milestones. Each is judged on data the rules were not tuned on, and each ends with the demo dry run still passing.", M, 1.5, 12, 0.4, { fontSize: 15, color: MUTED });
  const cols = [["H 0–12", "Fresh evaluation set", "A v4 synthetic set written by a teammate who has not read the rules, frozen with a checksum before any run.", "Evaluation lead"],
    ["H 12–24", "Known errors", "Single-tactic false positives (login alerts, booking confirmations), the registration-fee job scam, and organisation claims drawn as weaker links.", "Detection lead"],
    ["H 24–36", "Demo hardening", "Rebuild the served site, rename realistic demo UPI handles, rehearse the six-minute story on the presentation laptop.", "Product and demo lead"],
    ["H 36–48", "Ship and explain", "Publish the repository, deploy the blueprint if hosting is approved, re-run every suite, update the paper with v4 numbers.", "Whole team"]];
  const cw = (W - 2 * M - 3 * 0.2) / 4;
  cols.forEach(([when, t, d, owner], i) => {
    const x = M + i * (cw + 0.2);
    panel(s, x, 2.1, cw, 3.05);
    text(s, when, x + 0.2, 2.25, cw - 0.4, 0.3, { fontSize: 12, bold: true, color: CYAN, charSpacing: 2 });
    text(s, t, x + 0.2, 2.6, cw - 0.4, 0.4, { fontSize: 17, bold: true });
    text(s, d, x + 0.2, 3.05, cw - 0.4, 1.55, { fontSize: 12, color: MUTED });
    text(s, `Owner: ${owner}`, x + 0.2, 4.7, cw - 0.4, 0.3, { fontSize: 11, color: VIOLET, bold: true });
  });
  panel(s, M, 5.4, W - 2 * M, 1.3, HEX.panel2);
  label(s, "Demo success criteria", M + 0.2, 5.52, 6, CYAN);
  text(s, "demo_story_check.py passes · browser demo suite 12/12 · no console errors · a fresh-set report published with its errors listed · every claim on screen traceable to a file in the repository.", M + 0.2, 5.85, W - 2 * M - 0.4, 0.75, { fontSize: 13 });
  s.addNotes("Fill in team member names for each owner role before presenting; the roles are placeholders, not people. The plan is deliberately about evidence quality first: a fresh, independent synthetic set before any rule change, because the current sets were written by the same team that wrote the rules.");
}

// =====================================================================================================
// Appendix (not part of the 10-slide pitch)
pres.addSection({ title: "Appendix (not part of the pitch)" });
{
  const s = pres.addSlide({ masterName: "Section", sectionTitle: "Appendix (not part of the pitch)" });
  s.addText("Appendix", { placeholder: "title" });
  s.addText("Backup material for questions. Not part of the 10-slide pitch.", { placeholder: "body" });
  s.addNotes("Only show these slides if asked.");
}
{
  const s = content("Appendix A1 · Architecture walkthrough", "Scenes B and C of the 3D walkthrough", "Appendix (not part of the pitch)");
  const w = (W - 2 * M - 0.3) / 2;
  image(s, "scene-b", M, 1.55, w, null, { alt: "Scene B: scam detection pipeline" });
  image(s, "scene-c", M + w + 0.3, 1.55, w, null, { alt: "Scene C: scam intelligence network" });
  const h = w * 1125 / 2000;
  text(s, "Scene B: each evidence item travels through read and redact, indicators and tactics, case reassessment, doubt and review, and the alert decision. Frames are real API output on DEMO DATA.", M, 1.65 + h, w, 0.9, { fontSize: 12, color: MUTED });
  text(s, `Scene C: ${NET.stats.cases} synthetic cases and ${NET.stats.indicators} indicators from GET /api/v1/network. ${NET.stats.observed_edges} observed links (solid) and ${NET.stats.inferred_edges} inferred similarity links (dashed). Organisation names are claims, not verified senders.`, M + w + 0.3, 1.65 + h, w, 0.9, { fontSize: 12, color: MUTED });
  text(s, "Run it: python3 -m http.server 8090 --bind 127.0.0.1 --directory presentation/site, then open http://127.0.0.1:8090 (see presentation/README.md).", M, 6.2, W - 2 * M, 0.4, { fontSize: 12, color: CYAN });
  s.addNotes("The website is a separate deliverable from this deck. It needs no backend: it replays a recorded snapshot of the real API output, labelled DEMO DATA, and can be regenerated with presentation/scripts/snapshot.py.");
}
{
  const s = content("Appendix A2 · Additional evaluation", "More measurements, with their limits", "Appendix (not part of the pitch)");
  const hdr = (t) => ({ text: t, options: { bold: true, color: MUTED, fontSize: 10.5, fill: { color: HEX.navy }, align: "right" } });
  const hl = (t) => ({ text: t, options: { bold: true, color: MUTED, fontSize: 10.5, fill: { color: HEX.navy } } });
  const r = (n, m, me) => [{ text: n, options: { color: me ? CYAN : TEXT, fontSize: 11.5 } }, ...[m.precision.value, m.recall.value, m.fpr.value].map((v) => ({ text: v.toFixed(3), options: { color: me ? CYAN : TEXT, fontSize: 11.5, align: "right" } })), { text: `${m.tp}/${m.fp}/${m.tn}/${m.fn}`, options: { color: MUTED, fontSize: 11, align: "right" } }];
  label(s, `Synthetic v3 (n = ${F.v3_after.binary_scored}), frozen before the hardening fixes, not independent`, M, 1.5, 6.2, CYAN);
  s.addTable([[hl("System"), hdr("P"), hdr("R"), hdr("FPR"), hdr("TP/FP/TN/FN")],
    r("Case engine, before hardening", F.v3_before.safecircle), r("Case engine, after hardening", F.v3_after.safecircle, true),
    r("Keyword baseline", F.v3_after.keyword_baseline), r("Single-message detector", F.v3_after.single_message_detector)],
  { x: M, y: 1.85, w: 6.2, colW: [2.6, 0.75, 0.75, 0.75, 1.35], border: { type: "solid", color: HEX.line, pt: 0.75 }, fill: { color: HEX.panel }, rowH: 0.36, fontFace: "Calibri", objectName: name("table") });
  const v3errs = F.v3_after.errors.map((e, i, a) => ({ text: `${e.type === "false_positive" ? "FP" : "FN"}: ${e.description} (${e.outcome}, ${e.score})`, options: { bullet: true, breakLine: i < a.length - 1 } }));
  text(s, v3errs, M, 3.85, 6.2, 1.5, { fontSize: 11, color: MUTED, paraSpaceAfter: 2 });
  const a = F.v2.alerts, lat = F.v2.latency_ms_per_event_inprocess;
  text(s, `Alert load on v2: ${a.total_notifications} notifications across ${F.v2.scenarios} scenarios; ${a.benign_scenarios_with_a_notification} benign scenarios received one; ${a.scenarios_with_more_than_one_notification} scenarios received more than one. Latency per event through the in-process API: p50 ${lat.p50.toFixed(1)} ms (includes local OCR for screenshots; not network latency).`, M, 5.45, 6.2, 1.2, { fontSize: 11.5 });
  const D = F.single_message_detector_public_data.raw;
  const rr = (n, m) => [{ text: n, options: { color: TEXT, fontSize: 11.5 } }, ...[m.precision, m.recall, m.false_positive_rate].map((v) => ({ text: v.toFixed(3), options: { color: TEXT, fontSize: 11.5, align: "right" } }))];
  const x2 = 7.25, w2 = W - M - x2;
  label(s, "Single-message detector on public data (held out, not fully blind)", x2, 1.5, w2, CYAN);
  s.addTable([[hl("Setting"), hdr("P"), hdr("R"), hdr("FPR")],
    rr("Messages, score ≥ 30", D.messages["hybrid@30"]), rr("Messages, score ≥ 60", D.messages["hybrid@60"]), rr("Links, full URL", D.urls.full_url)],
  { x: x2, y: 1.85, w: w2, colW: [w2 - 2.25, 0.75, 0.75, 0.75], border: { type: "solid", color: HEX.line, pt: 0.75 }, fill: { color: HEX.panel }, rowH: 0.36, fontFace: "Calibri", objectName: name("table") });
  text(s, `Messages: ${D.messages.dataset} (${D.messages["hybrid@30"].n} messages): generic SMS spam, not UPI scams. Links: ${D.urls.n_per_class} reported phishing URLs (${D.urls.phishing_source}) vs ${D.urls.n_per_class} popular hostnames (${D.urls.benign_source}). Measured on 2026-10-10 before the extension began masking query values. Source: evaluation/results/metrics.json.`, x2, 3.45, w2, 1.6, { fontSize: 11, color: MUTED });
  panel(s, x2, 5.3, w2, 1.0, "2A1420");
  text(s, "None of these sets is real-world UPI fraud data. They show behaviour on the scenarios we wrote and on public spam and phishing data, not field accuracy.", x2 + 0.2, 5.4, w2 - 0.4, 0.8, { fontSize: 12, bold: true, valign: "middle" });
  s.addNotes("Use only if asked about further numbers. The public-data detector results predate the PS02 case engine and measure generic spam and phishing, so they do not support claims about UPI scams.");
}
{
  const s = content("Appendix A3 · Implementation status", "Implemented, partial, illustrative and planned", "Appendix (not part of the pitch)");
  const hdr = (t) => ({ text: t, options: { bold: true, color: MUTED, fontSize: 10.5, fill: { color: HEX.navy } } });
  const row = (a, b, c, col) => [{ text: a, options: { color: TEXT, fontSize: 11, bold: true } }, { text: b, options: { color: col, fontSize: 11, bold: true } }, { text: c, options: { color: MUTED, fontSize: 10.5 } }];
  s.addTable([
    [hdr("Capability"), hdr("Status"), hdr("Evidence or note")],
    row("Scam DNA, Forensics, UPI Guard, Campaign Radar, Network, Evidence report, trusted contacts", "Implemented", "backend 176 tests; browser suites 18, 21, 30 and 12 checks on a scratch database", LOW),
    row("Guardian Shield extension", "Partial", "25/25 node tests (mocked chrome.*), 17/17 pages with a stub; the installed extension in real Chrome is not verified", MED),
    row("Screenshot OCR", "Implemented, needs Tesseract", "Without Tesseract installed, screenshots are reported as unavailable", MED),
    row("PostgreSQL deployment", "Partial", "Compose file present; tests ran on PostgreSQL 16 on 2026-10-10; container image build not run", MED),
    row("Optional AI summary", "Optional, off", "Tested with a mocked client only; never changes the score", VIOLET),
    row("Overview globe and demo scenarios", "Illustrative / DEMO DATA", "Synthetic sample data, labelled as such; not a live threat map", MED),
    row("3D helix in this deck and site", "Illustrative", "Visual metaphor rendered by the walkthrough, not data", MED),
    row("Hosted deployment, public repository", "Not done", "Needs a hosting account and GitHub access (see STATUS.md)", THREAT),
    row("Bank, NPCI or payment-app integration; real-world dataset; Hindi", "Planned / not started", "No such integration or dataset exists in this repository", THREAT),
  ], { x: M, y: 1.5, w: W - 2 * M, colW: [4.3, 2.1, W - 2 * M - 6.4], border: { type: "solid", color: HEX.line, pt: 0.75 }, fill: { color: HEX.panel }, rowH: 0.48, fontFace: "Calibri", objectName: name("table") });
  s.addNotes("This table is the answer to 'what is real?'. Everything marked implemented has tests in the repository; partial and illustrative items say exactly what is missing.");
}

// ---------- Write, then put the theme colours into the deck ----------
async function applyTheme(file, theme) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const themes = Object.keys(zip.files).filter((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f));
  for (const t of themes) {
    let xml = await zip.file(t).async("string");
    for (const [k, v] of Object.entries(theme.colors)) {
      xml = xml.replace(new RegExp(`(<a:${k}>)([\\s\\S]*?)(</a:${k}>)`), (_, a, __, c) => `${a}<a:srgbClr val="${v}"/>${c}`);
    }
    xml = xml.replace(/(<a:theme [^>]*name=")[^"]*(")/, `$1${theme.name}$2`).replace(/(<a:clrScheme name=")[^"]*(")/, `$1${theme.name}$2`);
    zip.file(t, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
})();
