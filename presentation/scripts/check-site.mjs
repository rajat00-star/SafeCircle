// Automated checks for the presentation site in real Chrome. Serves nothing itself: start the site first.
// Usage: SITE_URL=http://127.0.0.1:8090 CHROMIUM=/path/to/chrome node presentation/scripts/check-site.mjs [shots-dir]
import { chromium } from "../../e2e/node_modules/playwright-core/index.mjs";
import fs from "node:fs";

const SITE = process.env.SITE_URL || "http://127.0.0.1:8090";
const SHOTS = process.argv[2] || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
let n = 0, failed = 0;
const ok = (cond, msg) => { n++; if (cond) console.log(`✓ ${msg}`); else { failed++; console.log(`✗ ${msg}`); } };
const errorsOf = (page) => { const errs = []; page.on("console", (m) => m.type() === "error" && errs.push(m.text())); page.on("pageerror", (e) => errs.push(e.message)); return errs; };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const ready = (page) => page.waitForFunction(() => window.__appReady === true, null, { timeout: 20000 });

// ---- 1. Desktop, full motion: every slide and scene ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(SITE + "/#/pitch/1");
  await ready(page);
  ok(await page.evaluate(() => window.__sc.gl), "WebGL renderer started");
  ok(await page.isVisible("text=Detect the pattern."), "slide 1 shows the hook");
  for (let i = 1; i <= 13; i++) {
    const want = i <= 10 ? `#/pitch/${i}` : `#/arch/${"abc"[i - 11]}`;
    await page.waitForTimeout(i === 1 ? 2600 : 3000);
    ok(await page.evaluate(() => location.hash) === want, `arrow navigation reaches ${want}`);
    await shot(page, `${String(i).padStart(2, "0")}-${want.replace(/[#/]/g, "_")}`);
    const overflow = await page.evaluate(() => {
      const s = document.querySelector("#stage .slide.on");
      return s.scrollHeight > s.clientHeight + 4 || s.scrollWidth > s.clientWidth + 4;
    });
    ok(!overflow, `${want} content fits the stage at 1440×900`);
    if (i < 13) await page.keyboard.press("ArrowRight");
  }
  // Scene A: click a module label, inspector shows status.
  await page.keyboard.press("a");
  await page.waitForTimeout(3000);
  await page.locator(".tag3d:has-text('Guardian Shield')").first().dispatchEvent("click");
  await page.waitForSelector("#inspector.open");
  ok(await page.isVisible("#inspector >> text=Installed extension runtime not verified"), "Scene A: Guardian Shield shows the unverified runtime status");
  await page.click("#inspector >> button:has-text('to FastAPI')");
  ok(await page.isVisible("#inspector >> text=FastAPI API boundary"), "Scene A: connection button jumps to the API module");
  await shot(page, "20-sceneA-inspector");
  await page.keyboard.press("Escape");
  ok(!(await page.isVisible("#inspector.open")), "Esc closes the inspector");
  // Canvas click on a module (raycast): click where the API label is projected, slightly below it.
  await page.click("#a-tour");
  ok(await page.isVisible("#inspector >> text=User and browser"), "Scene A: guided tour starts at the user");
  await page.click("#a-tour");
  ok(await page.isVisible("#inspector >> text=Next.js dashboard"), "Scene A: guided tour advances");
  await page.keyboard.press("Escape");

  // Scene B: playback.
  await page.keyboard.press("b");
  await page.waitForTimeout(3000);
  await page.click("#pb-fwd");
  await page.waitForTimeout(4200);
  ok((await page.textContent(".bigscore")).startsWith("45"), "Scene B: first multi-stage frame shows 45 (real API output)");
  await page.click("#pb-play");
  await page.waitForTimeout(14000);
  ok((await page.textContent(".bigscore")).startsWith("99"), "Scene B: playback ends at 99");
  ok(await page.isVisible("#playback >> text=Stage progression (inferred)"), "Scene B: inferred stages labelled separately from observed tactics");
  await shot(page, "21-sceneB-multistage-end");
  await page.selectOption("#pb-sel", "doubt");
  await page.click("#pb-fwd"); await page.waitForTimeout(4200);
  await page.click("#pb-fwd"); await page.waitForTimeout(4200);
  ok(await page.isVisible("#playback >> text=Needs review"), "Scene B: doubt scenario shows review required");
  ok(await page.isVisible("#playback >> text=Conflict:"), "Scene B: doubt scenario shows the conflict note");
  ok((await page.textContent(".bigscore")).startsWith("59"), "Scene B: single-tactic case held at 59");
  await shot(page, "22-sceneB-doubt");
  await page.selectOption("#pb-sel", "story");
  for (let k = 0; k < 3; k++) { await page.click("#pb-fwd"); await page.waitForTimeout(4200); }
  ok(await page.isVisible("#playback >> .badge.suppressed"), "Scene B: repeated evidence is suppressed");
  await page.locator(".tag3d:has-text('Alert decision')").first().dispatchEvent("click");
  ok(await page.isVisible("#inspector >> text=backend/app/scamdna/alerts.py"), "Scene B: station inspector names the source file");
  await page.keyboard.press("Escape");

  // Scene C: graph interactions.
  await page.keyboard.press("c");
  await page.waitForTimeout(3600);
  const labels = await page.$$eval(".tag3d.case", (els) => els.length);
  ok(labels >= 13, `Scene C: ${labels} case labels rendered`);
  await page.locator(".tag3d:has-text('Same QR, reported by a neighbour')").first().dispatchEvent("click");
  await page.waitForSelector("#inspector.open");
  ok(await page.isVisible("#inspector >> text=Observed · solid"), "Scene C: inspecting a case lists observed links");
  await page.click("#inspector .conn button >> nth=0");
  ok(await page.isVisible("#inspector dd:text-is('2 cases')"), "Scene C: following a link selects the shared indicator");
  await shot(page, "23-sceneC-selected");
  await page.locator(".tag3d:has-text('KYC suspension SMS (A)')").first().dispatchEvent("click");
  ok(await page.isVisible("#inspector >> text=Similarity only"), "Scene C: inferred link shows its uncertainty text");
  await page.uncheck("[data-filter=inferred]");
  ok(!(await page.isVisible("#inspector >> text=Similarity only")), "Scene C: hiding inferred links removes them from the details");
  await page.uncheck("[data-filter=org]");
  await page.waitForTimeout(300);
  ok(!(await page.isVisible(".tag3d:has-text('Claimed organisation')")), "Scene C: organisation filter hides claim nodes");
  await page.check("#c-shared");
  await page.waitForTimeout(400);
  await shot(page, "24-sceneC-filtered");
  await page.check("[data-filter=inferred]"); await page.check("[data-filter=org]"); await page.uncheck("#c-shared");
  await page.keyboard.press("r");

  // Overlays and presentation mode.
  await page.keyboard.press("g");
  ok(await page.isVisible("#overview.open"), "G opens the index");
  await page.click("#overview-grid button >> nth=4");
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => location.hash) === "#/pitch/5", "index jumps to slide 5");
  await page.click("[data-feature='2']");
  ok(await page.isVisible("#inspector img.shot"), "product card opens a real screenshot");
  await shot(page, "25-product-screenshot");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  ok(await page.isVisible("#help.open"), "? opens keyboard help");
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  ok(await page.evaluate(() => document.body.classList.contains("present")), "P enters presentation mode");
  await page.keyboard.press("Escape");
  await page.keyboard.press("End");
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => location.hash) === "#/arch/c", "End jumps to the last scene");
  await page.keyboard.press("Home");
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => location.hash) === "#/pitch/1", "Home returns to slide 1");
  await page.goto(SITE + "/#/arch/b");
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__sc.current) === 11, "deep link to a scene works");
  ok(errs.length === 0, `no console errors (${errs.join(" | ") || "none"})`);
  await ctx.close();
}

// ---- 2. Reduced motion ----
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(SITE + "/#/pitch/1");
  await ready(page);
  ok(await page.evaluate(() => window.__sc.engine.reduced), "reduced motion honoured from the OS setting");
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(() => new Promise((r) => { let c = 0; const f = () => { c++; }; const id = setInterval(f, 1000); const e = window.__sc.engine; const before = e.renderer.info.render.frame; setTimeout(() => { clearInterval(id); r(e.renderer.info.render.frame - before); }, 1500); }));
  ok(frames <= 2, `idle reduced-motion page renders on demand (${frames} frames in 1.5 s)`);
  await page.keyboard.press("b");
  await page.waitForTimeout(800);
  await page.click("#pb-fwd");
  await page.waitForTimeout(300);
  ok((await page.textContent(".bigscore")).startsWith("45"), "reduced motion: playback steps instantly");
  await shot(page, "30-reduced-sceneB");
  ok(errs.length === 0, `reduced motion: no console errors (${errs.join(" | ") || "none"})`);
  await ctx.close();
}

// ---- 3. 2D fallback (no WebGL) ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(SITE + "/?gl=0#/arch/a");
  await ready(page);
  ok(await page.evaluate(() => document.body.classList.contains("no-gl")), "2D fallback active with ?gl=0");
  await page.click(".fb-node:has-text('Guardian Shield')");
  ok(await page.isVisible("#inspector >> text=Installed extension runtime not verified"), "2D Scene A: module details work");
  await shot(page, "40-fallback-A");
  await page.keyboard.press("Escape");
  await page.keyboard.press("b");
  await page.waitForTimeout(500);
  await page.click("#pb-fwd");
  ok((await page.textContent(".bigscore")).startsWith("45"), "2D Scene B: playback works");
  await page.keyboard.press("c");
  await page.waitForTimeout(500);
  await page.click("#fb-c g[data-id^='upi:'] >> nth=0");
  ok(await page.isVisible("#inspector >> text=Observed · solid"), "2D Scene C: node details work");
  await page.uncheck("[data-filter=inferred]");
  ok(await page.$$eval("#fb-c line[stroke-dasharray]", (x) => x.length) === 0, "2D Scene C: inferred filter removes dashed links");
  await page.waitForTimeout(700);
  await shot(page, "41-fallback-C");
  ok(errs.length === 0, `2D fallback: no console errors (${errs.join(" | ") || "none"})`);
  await ctx.close();
}

// ---- 4. Phone width ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = errorsOf(page);
  await page.goto(SITE + "/#/pitch/8");
  await ready(page);
  await page.waitForTimeout(1200);
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  ok(!hscroll, "phone width: no horizontal scroll on the validation slide");
  await shot(page, "50-mobile-validation");
  await page.click("#next");
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => location.hash) === "#/pitch/9", "phone width: next button works");
  ok(errs.length === 0, `phone width: no console errors (${errs.join(" | ") || "none"})`);
  await ctx.close();
}

await browser.close();
console.log(`\n${n - failed}/${n} checks passed`);
process.exit(failed ? 1 : 0);
