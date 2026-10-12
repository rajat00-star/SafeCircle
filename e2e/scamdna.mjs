// End-to-end test of the judge demo: Scam DNA, Forensics (screenshot OCR), Campaign Radar, duplicate suppression.
// Usage: BASE_URL=http://127.0.0.1:8000 CHROMIUM=/path/to/chrome SHOTS=./screenshots node scamdna.mjs
// Needs a running server with the built site (and Tesseract installed for the screenshot step).
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8000";
const SHOTS = process.env.SHOTS || "./screenshots";
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const problems = [];
let step = 0;
const ok = (cond, msg) => { step++; if (!cond) throw new Error(`Step ${step} failed: ${msg}`); console.log(`✓ ${msg}`); };

const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

// Profile
await page.goto(BASE + "/cases/");
await page.fill("#dn", "Judge");
await page.click("text=Create profile");
await page.waitForSelector("text=Play a scenario");

// 1-2. Benign notification
await page.locator(".scenario-list li", { hasText: "Benign bank debit notification" }).locator("button").click();
await page.waitForSelector(".fixture");
await page.click("text=Add step 1");
await page.waitForSelector(".risk-head");
ok(await page.isVisible(".risk-head.low"), "benign bank notification is low risk");
await page.waitForSelector("text=Live result matches fixture");
ok(true, "benign live result matches the fixture expectation");
ok(await page.isVisible(".badge.medium.demo-flag"), "demo case is labelled DEMO DATA");

// 3-6. Multi-stage scenario, step by step
await page.click("text=All investigations");
await page.locator(".scenario-list li", { hasText: "Multi-stage bank impersonation" }).locator("button").click();
await page.waitForSelector(".fixture");
const scores = [];
for (let i = 1; i <= 4; i++) {
  await page.click(`text=Add step ${i}`);
  await page.waitForFunction((n) => document.querySelectorAll(".evidence-list li").length === n, i);
  await page.waitForTimeout(1300); // gauge animation
  scores.push(Number(await page.textContent(".gauge .num b")));
}
ok(scores.every((s, i) => i === 0 || s >= scores[i - 1]) && scores[3] >= 90, `risk escalates as evidence arrives (${scores.join(" → ")})`);
ok((await page.locator(".node.event").count()) === 4, "attack chain shows 4 observed evidence nodes");
ok((await page.locator(".node.tactic").count()) >= 5, "attack chain shows the detected tactics");
ok((await page.locator(".edge.progression.inferred").count()) >= 2, "stage progression is drawn as inferred (dashed)");
ok(await page.isVisible(".change-card >> text=UPI collect-request"), "'What changed' explains the new UPI collect evidence");
await page.locator(".node.tactic").first().click();
ok(await page.isVisible(".chain-detail >> text=Next step"), "selecting a node shows evidence and next step");
await page.waitForSelector("text=Live result matches fixture");
ok(true, "multi-stage live result matches the fixture expectation");
await page.screenshot({ path: `${SHOTS}/20-scam-dna.png`, fullPage: true });

// 10. Duplicate suppression
await page.click("text=Resubmit step 1 unchanged");
await page.waitForSelector(".alert >> text=Alert suppressed");
ok((await page.locator(".evidence-list li").count()) === 4, "resubmitting unchanged evidence adds nothing and suppresses the alert");
const caseUrl = page.url();

// 7. Forensics screenshot attached to the case
await page.goto(BASE + "/forensics/");
await page.click("text=Demo screenshot");
await page.waitForSelector(".shot-preview");
const caseId = new URL(caseUrl).searchParams.get("id");
await page.selectOption("#fx-case", caseId);
await page.click("button:has-text('Investigate')");
await page.waitForSelector("text=Analysis completed", { timeout: 30000 });
ok(await page.isVisible("text=Extracted text"), "screenshot text extracted locally with OCR");
ok(await page.isVisible("text=Added to case"), "screenshot findings fed into the Scam DNA case");
await page.screenshot({ path: `${SHOTS}/21-forensics.png`, fullPage: true });

// 9. Campaign Radar
await page.goto(BASE + "/campaigns/");
await page.click("text=Load demo campaign cases");
await page.waitForSelector(".campaign");
const n = await page.locator(".campaign").count();
ok(n >= 3, `campaign radar groups related demo cases (${n} campaigns)`);
ok(await page.isVisible(".campaign >> text=exact"), "exact shared indicators are distinguished");
ok(!(await page.locator(".campaign", { hasText: "Genuine OTP" }).count()), "benign case is never clustered");
await page.locator(".campaign").first().locator("summary").click();
await page.locator(".campaign").first().locator("button:has-text('Not related')").first().click();
await page.waitForSelector("text=Dismissed by you");
ok(true, "a suggested relationship can be dismissed");
await page.screenshot({ path: `${SHOTS}/22-campaign-radar.png`, fullPage: true });

// 1. Overview metrics
await page.goto(BASE + "/#overview");
await page.waitForSelector(".metric b");
await page.waitForFunction(() => document.querySelector(".metric b")?.textContent !== "—");
const inv = Number(await page.locator(".metric b").first().textContent());
ok(inv >= 12, `overview counts investigations from local data (${inv})`);
ok(await page.isVisible(".metric >> text=from DEMO DATA"), "overview labels demo-derived metrics");
await page.screenshot({ path: `${SHOTS}/23-overview.png` });

// Mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const mp = await m.newPage();
await mp.goto(BASE + "/");
await mp.evaluate((t) => localStorage.setItem("safecircle.profileToken", t), await page.evaluate(() => localStorage.getItem("safecircle.profileToken")));
await mp.goto(caseUrl);
await mp.waitForSelector(".chain-canvas svg");
ok(!(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "case view has no horizontal scroll on a phone");
await mp.screenshot({ path: `${SHOTS}/24-mobile-case.png`, fullPage: true });

ok(problems.length === 0, "no console or page errors" + (problems.length ? `: ${problems.join(" | ")}` : ""));
await browser.close();
console.log(`\nAll ${step} Scam DNA end-to-end checks passed.`);
