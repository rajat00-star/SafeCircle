// Still renders of the 3D site for the PowerPoint deck, so both share one visual identity.
// Usage: SITE_URL=http://127.0.0.1:8090 CHROMIUM=/path/to/chrome node presentation/scripts/capture-site.mjs
import { chromium } from "../../e2e/node_modules/playwright-core/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = process.env.SITE_URL || "http://127.0.0.1:8090";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/site");
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
const shots = [
  ["hook-helix", "bg", "#/pitch/1", 3500],
  ["dna-closeup", "bg", "#/pitch/4", 3500],
  ["scene-a", "scene", "#/arch/a", 4200],
  ["scene-b", "scene", "#/arch/b", 4200, async () => { await page.evaluate(() => { const b = window.__sc.sceneB; b.load("multistage", window.SNAPSHOT.multistage.steps); }); for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__sc.sceneB.step(1)); await page.waitForTimeout(3800); } }],
  ["scene-c", "scene", "#/arch/c", 4500],
];
for (const [name, mode, route, wait, extra] of shots) {
  await page.goto(`${SITE}/?capture=${mode}${route}`);
  await page.waitForFunction(() => window.__appReady === true);
  await page.waitForTimeout(wait);
  if (extra) await extra();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("saved", name);
}
await browser.close();
