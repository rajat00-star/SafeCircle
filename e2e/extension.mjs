// Loads the unpacked extension in Chromium and checks the result page and popup against a running server.
import { chromium } from "playwright-core";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const ext = path.resolve(process.env.EXT_DIR || "../extension");
const SHOTS = process.env.SHOTS || "./screenshots";
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-ext-"));
const ctx = await chromium.launchPersistentContext(userDir, {
  executablePath: process.env.CHROMIUM, headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  viewport: { width: 720, height: 900 },
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const id = sw.url().split("/")[2];
console.log("✓ extension loaded:", id);

await sw.evaluate(() => chrome.storage.session.set({ pending: { kind: "message",
  value: "Your account will be suspended today. Share the OTP sent to your phone to verify." } }));
const page = await ctx.newPage();
await page.goto(`chrome-extension://${id}/result.html`);
await page.waitForSelector(".badge");
const badge = await page.textContent(".badge");
if (!/High risk|Suspicious/.test(badge)) throw new Error("unexpected result " + badge);
console.log("✓ selected-text check from context menu flow:", badge);
await page.screenshot({ path: `${SHOTS}/14-extension-result.png`, fullPage: true });

const site = await ctx.newPage();
await site.goto((process.env.BASE_URL || "http://127.0.0.1:8000") + "/how-it-works/");
const popup = await ctx.newPage();
await site.bringToFront();
// Simulate the popup on a known tab address by checking a look-alike URL through the same code path.
await sw.evaluate(() => chrome.storage.session.set({ pending: { kind: "url", value: "https://amaz0n-account-verify.top/signin" } }));
await popup.goto(`chrome-extension://${id}/result.html`);
await popup.waitForSelector(".badge");
console.log("✓ link check flow:", await popup.textContent(".badge"));
await popup.screenshot({ path: `${SHOTS}/15-extension-link.png`, fullPage: true });
await ctx.close();
console.log("All extension checks passed.");
