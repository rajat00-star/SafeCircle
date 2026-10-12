// End-to-end test of UPI Scam Guard, the evidence report export and the Scam Network Graph.
// Usage: BASE_URL=http://127.0.0.1:8000 CHROMIUM=/path/to/chrome SHOTS=./screenshots node advanced.mjs
// Needs a running server with the built site, ideally on a scratch database.
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8000";
const SHOTS = process.env.SHOTS || "./screenshots";
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const problems = [];
let step = 0;
const ok = (cond, msg) => { step++; if (!cond) throw new Error(`Step ${step} failed: ${msg}`); console.log(`✓ ${msg}`); };

const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error" && !/status of 422/.test(m.text())) problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
const check = () => page.click("button:has-text('Check before paying')");

// ---- UPI Scam Guard (no profile: nothing stored) ----
await page.goto(BASE + "/upi/");
ok(await page.isVisible("text=It never sees, blocks or approves a real payment"), "UPI Guard states it never touches real payments");
await page.click("text=Refund QR image");
await page.waitForSelector("text=QR code read on this device");
ok((await page.inputValue("#upi-in")).startsWith("upi://pay?pa=sbi.refund@ybl"), "demo QR image is decoded in the browser");
await check();
await page.waitForSelector(".risk-head.high");
ok(await page.isVisible("text=Strong warning signs. Do not pay."), "refund QR with its message is high risk");
ok(await page.isVisible("text=Told you will receive money, but the link sends money"), "pay-to-receive contradiction is explained");
const resultText = await page.textContent("section[aria-label='UPI check result']");
ok(resultText.includes("sb***@ybl") && !resultText.includes("sbi.refund@ybl"), "payee handle is shown masked in the result");
ok(await page.isVisible("text=Not stored: checked in memory and discarded."), "anonymous check is not stored");
await page.screenshot({ path: `${SHOTS}/30-upi-guard-high.png`, fullPage: true });

await page.click("text=Shop QR");
await check();
await page.waitForSelector(".risk-head.low");
ok(await page.isVisible("text=This does not confirm the payee is genuine"), "ordinary shop QR is low risk with an honest verdict");

await page.fill("#upi-in", "upi://pay?pa=xy@ybl&am=-10");
await page.fill("#upi-ctx", "");
await check();
await page.waitForSelector(".alert.error");
ok((await page.textContent(".alert.error")).includes("not a valid rupee amount"), "malformed payment link gives a clear error");
await page.fill("#upi-in", "hello world");
await check();
await page.waitForFunction(() => document.querySelector(".alert.error")?.textContent?.includes("not a valid UPI ID"));
ok(true, "text that is not a UPI ID is rejected");

// ---- Profile + demo campaign cases ----
await page.goto(BASE + "/network/");
await page.fill("#dn", "Judge");
await page.click("text=Create profile");
await page.waitForSelector("text=Nothing to connect yet");
ok(true, "network graph shows an empty state for a new profile");
await page.click("text=Load demo campaign cases");
await page.waitForSelector(".netgraph .node.case");
const caseNodes = await page.locator(".netgraph .node.case").count();
const indNodes = await page.locator(".netgraph .node.indicator").count();
ok(caseNodes >= 8 && indNodes > 0, `graph draws ${caseNodes} cases and ${indNodes} indicators`);
ok(await page.locator(".netgraph .edge.observed").count() > 0, "observed edges are drawn");
ok(await page.isVisible("text=Cases marked D are synthetic"), "demo cases are labelled in the graph");
const domain = page.locator("button.linklike", { hasText: "sbi-kyc" }).first();
await domain.click();
await page.waitForSelector("text=Observed in");
ok(await page.isVisible("text=Taken from link text; the link was never opened."), "selecting an indicator shows its provenance and cases");
await page.screenshot({ path: `${SHOTS}/31-scam-network.png`, fullPage: true });
await page.click("text=Show similarity links (inferred)");
ok(await page.locator(".netgraph .edge.inferred").count() === 0, "inferred links can be hidden");
await page.click("text=Only indicators shared by two or more cases");
await page.waitForFunction(() => document.querySelectorAll(".netgraph .node.indicator").length > 0);
ok(true, "shared-only filter reloads the graph");

// ---- UPI Guard with a profile: same handle in a demo case, attach to a case ----
await page.goto(BASE + "/cases/");
await page.waitForSelector("text=Start a case");
await page.fill("#ct", "QR from 'SBI refund desk'");
await page.click("text=Create case");
await page.waitForSelector(".case-title");
const caseUrl = page.url();
const caseId = new URL(caseUrl).searchParams.get("id");
await page.goto(BASE + "/upi/");
await page.waitForSelector("#upi-case");
await page.click("text=Refund QR scam");
await page.selectOption("#upi-case", caseId);
await check();
await page.waitForSelector("text=Added to case:");
ok(true, "UPI check can be attached to an investigation");
await page.click("text=Open the attack chain →");
await page.waitForSelector(".chain-canvas svg");
ok(await page.isVisible("text=UPI app"), "attached UPI request appears as evidence from the UPI app channel");

// ---- Evidence report ----
await page.click("text=Evidence report");
await page.waitForSelector(".report-doc");
ok(await page.isVisible("text=has NOT been submitted"), "report states it has not been submitted anywhere");
ok(await page.isDisabled("text=Print or save as PDF"), "export is disabled until the user confirms review");
ok(await page.isVisible(".report-doc >> text=sb***@ybl") && !(await page.content()).includes("sbi.refund@ybl"), "report shows only the masked UPI ID");
await page.click("text=Include message excerpts");
await page.waitForSelector("text=[excerpt omitted by the user]");
ok(true, "excerpts can be left out before exporting");
await page.click("text=Include message excerpts");
await page.waitForSelector(".report-excerpt >> text=UPI pay request details");
await page.click("text=I have reviewed this report");
const [md] = await Promise.all([page.waitForEvent("download"), page.click("text=Download Markdown")]);
const mdText = fs.readFileSync(await md.path(), "utf8");
ok(md.suggestedFilename().endsWith(".md") && mdText.startsWith("# Scam evidence report:"), "Markdown report downloads");
ok(!mdText.includes("sbi.refund@ybl"), "downloaded Markdown keeps the UPI ID masked");
const [js] = await Promise.all([page.waitForEvent("download"), page.click("text=Download JSON")]);
const json = JSON.parse(fs.readFileSync(await js.path(), "utf8"));
ok(json.content_sha256?.length === 64 && json.timeline.length === 1, "JSON report downloads with a content fingerprint");
await page.emulateMedia({ media: "print" });
ok(!(await page.isVisible("header.site")) && !(await page.isVisible(".no-print")), "print view shows only the report");
await page.emulateMedia({ media: "screen" });
await page.screenshot({ path: `${SHOTS}/32-evidence-report.png`, fullPage: true });

// ---- Mobile ----
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const mp = await m.newPage();
mp.on("pageerror", (e) => problems.push(`mobile pageerror: ${e.message}`));
await mp.goto(BASE + "/");
await mp.evaluate((t) => localStorage.setItem("safecircle.profileToken", t), await page.evaluate(() => localStorage.getItem("safecircle.profileToken")));
for (const path of ["/upi/", "/network/", `/cases/report/?id=${caseId}`]) {
  await mp.goto(BASE + path);
  await mp.waitForLoadState("networkidle");
  ok(!(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${path.split("?")[0]} has no horizontal scroll on a phone`);
}
await mp.screenshot({ path: `${SHOTS}/33-mobile-report.png`, fullPage: true });

ok(problems.length === 0, "no console or page errors" + (problems.length ? `: ${problems.join(" | ")}` : ""));
await browser.close();
console.log(`\nAll ${step} advanced-feature end-to-end checks passed.`);
