// Captures real screenshots of the SafeCircle app for the deck and the site (DEMO DATA only).
// Run against a server on a scratch database, never backend/safecircle.db. See presentation/README.md.
// Usage: BASE_URL=http://127.0.0.1:8010 CHROMIUM=/path/to/chrome node presentation/scripts/capture-app.mjs
import { chromium } from "../../e2e/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8010";
const API = BASE + "/api/v1";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/app");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("saved", name); };
const api = (p, init = {}) => page.evaluate(async ([url, init]) => {
  const t = localStorage.getItem("safecircle.profileToken");
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` } });
  return r.status === 204 ? null : r.json();
}, [API + p, init]);

// Profile through the real UI.
await page.goto(BASE + "/cases/");
await page.fill("#dn", "Demo judge");
await page.click("text=Create profile");
await page.waitForSelector("text=Start a case");

// Demo story (same DEMO DATA as docs/demo-runbook.md), then the multi-stage scenario and demo campaigns.
const SCAM = "upi://pay?pa=sbi.refund@ybl&pn=SBI%20Refund%20Desk&am=4999&cu=INR&tn=Scan%20to%20receive%20your%20refund";
const MSG = "Dear customer, SBI has approved your refund of Rs 4999. Scan the QR and enter your UPI PIN to receive it within 10 minutes.";
const story = await api("/cases", { method: "POST", body: JSON.stringify({ title: "DEMO · Refund QR from 'SBI'" }) });
await api(`/cases/${story.id}/events`, { method: "POST", body: JSON.stringify({ kind: "message", channel: "sms", content: "SBI Refund Desk: your refund of Rs 4,999 has been approved and is waiting to be credited." }) });
await api("/upi/check", { method: "POST", body: JSON.stringify({ input: SCAM, context: MSG, case_id: story.id }) });
await api(`/cases/${story.id}/events`, { method: "POST", body: JSON.stringify({ kind: "message", channel: "call", content: "Caller from the SBI refund desk asked me to read out the OTP I just received so he can release the refund." }) });
const second = await api("/cases", { method: "POST", body: JSON.stringify({ title: "DEMO · Same QR, reported by a neighbour" }) });
await api("/upi/check", { method: "POST", body: JSON.stringify({ input: SCAM, context: "Neighbour got this QR for a 'refund'.", case_id: second.id }) });
const ms = await api("/demo/scenarios/multi_stage/cases", { method: "POST" });
await api("/demo/campaigns", { method: "POST" });

await page.goto(BASE + "/"); await shot("overview");
// Play the four fixture steps through the case page, as a presenter would.
await page.goto(`${BASE}/cases/?id=${ms.id}`); await page.waitForSelector(".case-title");
for (let i = 1; i <= 4; i++) {
  await page.click(`button:has-text('Add step ${i}:')`);
  await page.waitForSelector(`text=${i} evidence item`);
}
await page.waitForTimeout(800);
const el = async (sel, name) => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
  await l.screenshot({ path: `${OUT}/${name}.png` }); console.log("saved", name); };
await el(".card:has(.stage-strip)", "scam-dna-verdict");
await el("section[aria-labelledby=chain-h]", "scam-dna-chain");
await el(".card:has-text('Audit trail')", "scam-dna-audit");
await page.goto(`${BASE}/cases/?id=${story.id}`); await page.waitForSelector(".case-title");
await el(".card:has-text('What changed')", "story-what-changed");
await page.goto(BASE + "/upi/"); await page.click("text=Refund QR image"); await page.waitForSelector("text=The image was not uploaded");
await page.click("button:has-text('Check before paying')"); await page.waitForSelector(".risk-head.high");
await page.locator(".risk-head").scrollIntoViewIfNeeded(); await shot("upi-guard-high");
await page.goto(BASE + "/forensics/"); await page.click("text=Demo conversation"); await page.click("form button[type=submit]");
await page.waitForSelector(".risk-head"); await page.locator(".risk-head").scrollIntoViewIfNeeded(); await shot("forensics");
await page.goto(BASE + "/campaigns/"); await page.waitForTimeout(800); await shot("campaign-radar");
await page.goto(BASE + "/network/"); await page.waitForSelector("svg"); await el(".netgraph", "scam-network");
await page.goto(`${BASE}/cases/report/?id=${story.id}`); await page.waitForTimeout(800); await shot("evidence-report");
await page.goto(BASE + "/extension/"); await shot("guardian-shield-page");
await browser.close();
console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
