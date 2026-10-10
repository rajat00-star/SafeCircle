// End-to-end test of the full user journey in a real browser.
// Usage: BASE_URL=http://127.0.0.1:8000 CHROMIUM=/path/to/chrome SHOTS=./screenshots node e2e.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8000";
const SHOTS = process.env.SHOTS || "./screenshots";
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const problems = [];
let step = 0;

async function newPage(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "light", ...ctxOpts });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return { ctx, page };
}
const ok = (cond, msg) => { step++; if (!cond) throw new Error(`Step ${step} failed: ${msg}`); console.log(`✓ ${msg}`); };
const shot = (page, name, full = false) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });

const { ctx: userCtx, page } = await newPage();
await page.goto(BASE + "/");
await shot(page, "01-home");
await page.selectOption('select[aria-label="Load an example"]', { label: "Bank KYC + OTP scam" });
await page.click("text=Analyze now");
await page.waitForSelector(".risk-head");
ok(await page.isVisible(".badge.high"), "scam message rated High risk");
ok((await page.locator("mark").count()) >= 3, "evidence highlighted in the message");
ok(await page.isVisible("text=Never share a one-time code"), "OTP recommendation shown");
await shot(page, "02-scam-result", true);

await page.selectOption('select[aria-label="Load an example"]', { label: "Genuine OTP message" });
await page.click("text=Analyze now");
await page.waitForSelector(".risk-head.low");
ok(await page.isVisible(".badge.low"), "genuine bank OTP message rated Low risk");
await shot(page, "03-genuine-otp", true);

await page.selectOption('select[aria-label="Load an example"]', { label: "Look-alike link" });
await page.click("text=Analyze now");
await page.waitForSelector(".risk-head");
ok(await page.isVisible("text=on a domain it doesn't own"), "look-alike link explained");
await shot(page, "04-link-result", true);

// Trusted contacts
await page.click("nav >> text=Trusted contacts");
await page.fill("#dn", "Asha");
await page.click("text=Create profile");
await page.fill("#cn", "Ravi");
await page.fill("#cr", "Son");
await page.click("text=Create invite link");
const invite = await page.inputValue('input[aria-label="Invite link"]');
ok(invite.includes("/guardian/#t="), "invite link created with token in URL fragment");
await shot(page, "05-contacts-invite");

const { ctx: contactCtx, page: cpage } = await newPage();
await cpage.goto(invite);
await cpage.waitForSelector("text=would like you as a trusted contact");
await shot(cpage, "06-guardian-consent");
await cpage.click("text=I agree to be a trusted contact");
await cpage.waitForSelector("text=No alerts yet.");
ok(true, "contact accepted consent");

await page.reload();
await page.waitForSelector(".badge.low");
ok(await page.isVisible("text=Active"), "user sees contact as Active");

await page.click("nav >> text=Analyze");
await page.selectOption('select[aria-label="Load an example"]', { label: "'Hi Mum' new number" });
await page.click("text=Analyze now");
await page.waitForSelector(".risk-head");
await page.click("text=Ask a trusted contact");
await page.check("text=Ravi (Son)");
await page.fill("#note", "Got this from an unknown number. Is it really Priya?");
await page.check("#incl");
await page.click("text=Send alert");
await page.waitForSelector(".alert.success");
ok(await page.isVisible("text=Alert sent to Ravi"), "alert sent to consenting contact");
await shot(page, "07-alert-sent", true);

await cpage.click("text=Refresh");
await cpage.waitForSelector("text=Got this from an unknown number");
ok(await cpage.isVisible("text=Payment pressure"), "contact sees warning signs");
const excerpt = await cpage.textContent(".highlighted");
ok(excerpt.includes("[") || !/\d{5}/.test(excerpt), "excerpt is redacted");
await cpage.click("text=Mark as seen");
await cpage.waitForSelector("text=Seen");
await shot(cpage, "08-guardian-inbox", true);

// Privacy + history
await page.click("nav >> text=Privacy");
await page.check("#h");
await page.waitForSelector("text=Saved.");
await page.check("#x");
await page.waitForSelector("#x:checked");
await shot(page, "09-privacy", true);
await page.click("nav >> text=Analyze");
await page.selectOption('select[aria-label="Load an example"]', { label: "Delivery fee + link" });
await page.click("text=Analyze now");
await page.waitForSelector("text=Saved to your history");
await page.click("nav >> text=History");
await page.waitForSelector("table");
ok((await page.locator("tbody tr").count()) === 1, "history shows the saved check");
await shot(page, "10-history");
await page.click("nav >> text=Privacy");
const [download] = await Promise.all([page.waitForEvent("download"), page.click("text=Download my data")]);
const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
ok(exported.trusted_contacts[0].consent_events.length >= 2, "data export includes consent audit trail");

await page.click("nav >> text=How it works");
await page.waitForSelector("text=Measured results");
await page.waitForSelector("table");
ok(await page.isVisible("text=Messages: full detector"), "real metrics table rendered");
await shot(page, "11-how-it-works", true);

await page.click("nav >> text=Privacy");
page.once("dialog", (d) => d.accept());
await page.click("text=Delete everything");
await page.waitForSelector("text=Create your private profile");
ok(true, "profile and data deleted");

await cpage.click("text=Refresh");
await cpage.waitForSelector(".alert.error");
ok(true, "contact link stops working after the user deletes their data");

const { page: mobile } = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.goto(BASE + "/");
await mobile.selectOption('select[aria-label="Load an example"]', { label: "Fake tech support" });
await mobile.click("text=Analyze now");
await mobile.waitForSelector(".risk-head");
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
ok(!overflow, "no horizontal scrolling on a phone-sized screen");
await shot(mobile, "12-mobile", true);

const { page: dark } = await newPage({ colorScheme: "dark" });
await dark.goto(BASE + "/");
await dark.selectOption('select[aria-label="Load an example"]', { label: "Bank KYC + OTP scam" });
await dark.click("text=Analyze now");
await dark.waitForSelector(".risk-head");
await shot(dark, "13-dark-mode");

const realProblems = problems.filter((p) => !p.includes("401") && !p.includes("403") && !p.includes("Failed to load resource"));
ok(realProblems.length === 0, `no console or page errors${realProblems.length ? ": " + realProblems.join(" | ") : ""}`);
await browser.close();
console.log(`\nAll ${step} end-to-end checks passed.`);
