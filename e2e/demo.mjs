// Walks through docs/demo-runbook.md in a real browser, step by step, with DEMO DATA only.
// Usage: BASE_URL=http://127.0.0.1:8000 API_BASE=http://127.0.0.1:8000 CHROMIUM=/path/to/chrome node demo.mjs
// Run it against a server on a scratch or demo database, never the real one.
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8000";
const API = (process.env.API_BASE || BASE) + "/api/v1";
const SHOTS = process.env.SHOTS || "./screenshots-demo";
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const problems = [];
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) throw new Error(`Step ${n} failed: ${msg}`); console.log(`✓ ${msg}`); };

const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
const check = () => page.click("button:has-text('Check before paying')");
const getCase = (id) => page.evaluate(async ([api, id]) => {
  const t = localStorage.getItem("safecircle.profileToken");
  return (await fetch(`${api}/cases/${id}`, { headers: { Authorization: `Bearer ${t}` } })).json();
}, [API, id]);
const last = (c) => [...c.log].sort((a, b) => b.id - a.id)[0];
const OPENER = "SBI Refund Desk: your refund of Rs 4,999 has been approved and is waiting to be credited.";
const FOLLOW_UP = "Caller from the SBI refund desk asked me to read out the OTP I just received so he can release the refund.";

// 1. Harmless baseline
await page.goto(BASE + "/upi/");
await page.click("text=Shop QR");
await check();
await page.waitForSelector(".risk-head.low");
ok(await page.isVisible("text=This does not confirm the payee is genuine"), "1 shop QR is low risk with an honest verdict");

// 2. Suspicious message starts a case (creates the profile first)
await page.goto(BASE + "/cases/");
await page.fill("#dn", "Demo judge");
await page.click("text=Create profile");
await page.waitForSelector("text=Start a case");
await page.fill("#ct", "DEMO · Refund QR from 'SBI'");
await page.click("text=Create case");
await page.waitForSelector(".case-title");
const caseId = new URL(page.url()).searchParams.get("id");
await page.fill("#ev-text", OPENER);
await page.click("button:has-text('Add and re-evaluate')");
await page.waitForFunction(() => !document.querySelector("button[aria-busy='true']"));
await page.waitForTimeout(500);
let c = await getCase(caseId);
ok(c.risk_level === "medium" && c.risk_score === 36, `2 opening message gives ${c.risk_level} ${c.risk_score}/100`);

// 3. UPI Guard on the QR image, decoded in the browser
await page.goto(BASE + "/upi/");
await page.waitForSelector("#upi-case");
await page.click("text=Refund QR image");
await page.waitForSelector("text=The image was not uploaded");
await check();
await page.waitForSelector(".risk-head.high");
ok(await page.isVisible("text=Strong warning signs. Do not pay."), "3 refund QR is high risk; QR decoded on the device");
await page.screenshot({ path: `${SHOTS}/demo-3-upi-high.png`, fullPage: true });

// 4-5. Attach to the case; Scam DNA reassesses; repeat is suppressed
await page.selectOption("#upi-case", caseId);
await check();
await page.waitForSelector("text=Added to case:");
c = await getCase(caseId);
const re = c.log.filter((e) => e.action === "reassessed").sort((a, b) => a.id - b.id).at(-1);
ok(c.risk_level === "high" && c.risk_score === 97 && re.alert_action === "escalated", "4 attaching escalates the case from medium 36 to high 97");
await check();
await page.waitForTimeout(800);
c = await getCase(caseId);
ok(c.events.length === 2 && last(c).action === "duplicate_evidence" && !last(c).notify, "5 repeating the same check is suppressed as a duplicate");
await page.goto(`${BASE}/cases/?id=${caseId}`);
await page.waitForSelector(".case-title");
await page.fill("#ev-text", FOLLOW_UP);
await page.selectOption("#ev-ch", "call");
await page.click("button:has-text('Add and re-evaluate')");
await page.waitForTimeout(1000);
c = await getCase(caseId);
ok(c.events.length === 3 && c.risk_level === "high" && last(c).alert_action === "suppressed", "5 follow-up keeps it high without a second alert");
await page.screenshot({ path: `${SHOTS}/demo-5-scam-dna.png`, fullPage: true });

// 6. Second case with the same QR, demo campaigns, network
await page.goto(BASE + "/cases/");
await page.fill("#ct", "DEMO · Same QR, reported by a neighbour");
await page.click("text=Create case");
await page.waitForSelector(".case-title");
const second = new URL(page.url()).searchParams.get("id");
await page.goto(BASE + "/upi/");
await page.waitForSelector("#upi-case");
await page.click("text=Refund QR scam");
await page.selectOption("#upi-case", second);
await check();
await page.waitForSelector("text=Added to case:");
ok(await page.isVisible("text=This UPI ID appears in your investigations"), "6 the second check recognises the handle from the first case");
await page.goto(BASE + "/campaigns/");
await page.click("text=Load demo campaign cases");
await page.waitForSelector("text=Same UPI handle");
ok(true, "6 Campaign Radar groups the two cases by the exact shared UPI handle");
await page.goto(BASE + "/network/");
await page.waitForSelector(".netgraph .edge.observed");
ok(await page.locator(".netgraph .edge.inferred").count() > 0, "6 network shows observed (solid) and inferred (dashed) edges");
await page.screenshot({ path: `${SHOTS}/demo-6-network.png`, fullPage: true });

// 7. Evidence report
await page.goto(`${BASE}/cases/report/?id=${caseId}`);
await page.waitForSelector(".report-doc");
ok(await page.isVisible("text=has NOT been submitted") && await page.isDisabled("text=Download Markdown"), "7 report says it was not submitted; export waits for review");
await page.click("text=I have reviewed this report");
const [md] = await Promise.all([page.waitForEvent("download"), page.click("text=Download Markdown")]);
const mdText = fs.readFileSync(await md.path(), "utf8");
ok(mdText.includes("HIGH (97/100)") && mdText.includes("Same QR, reported by a neighbour") && !mdText.includes("sbi.refund@ybl"),
   "7 Markdown report has the case risk, the related case, and only the masked handle");
await page.screenshot({ path: `${SHOTS}/demo-7-report.png`, fullPage: true });

ok(problems.length === 0, "no console or page errors" + (problems.length ? `: ${problems.join(" | ")}` : ""));
await browser.close();
console.log(`\nAll ${n} demo-runbook checks passed. Step 8 (the Chrome extension) is a manual check.`);
