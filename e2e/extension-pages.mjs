// Guardian Shield pages in a real browser, without installing the extension.
// Branded Chrome no longer loads unpacked extensions from the command line, so this test serves
// the extension's own HTML/JS from a stub origin, provides a minimal chrome.* API, and talks to
// the real SafeCircle server. It covers the warning page, acknowledgement, go-back and offline states.
// Usage: BASE_URL=http://127.0.0.1:8000 CHROMIUM=/path/to/chrome node extension-pages.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const API = process.env.BASE_URL || "http://127.0.0.1:8000";
const EXT = path.resolve(process.env.EXT_DIR || "../extension");
const ORIGIN = "http://127.0.0.1:8977"; // stub origin served by page routes (no server listens here)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
let step = 0;
const ok = (c, m) => { step++; if (!c) throw new Error(`Step ${step} failed: ${m}`); console.log(`✓ ${m}`); };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

async function open(file, { session = {}, apiDown = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 760, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const visited = [];
  await ctx.route(`${ORIGIN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname.replace(/^\//, "") || "result.html";
    const f = path.join(EXT, p);
    if (!f.startsWith(EXT) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || "text/plain", body: fs.readFileSync(f) });
  });
  await ctx.route("https://**/*", (r) => { visited.push(r.request().url()); return r.fulfill({ status: 200, contentType: "text/html", body: "<h1>destination</h1>" }); });
  await ctx.route(`${API}/**`, async (r) => {
    if (apiDown) return r.abort("connectionrefused");
    const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "Content-Type" };
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const resp = await r.fetch();
    return r.fulfill({ response: resp, headers: { ...resp.headers(), ...cors } });
  });
  await page.addInitScript(({ session, api }) => {
    const store = { ...session };
    const ev = { addListener() {} };
    window.chrome = {
      storage: {
        sync: { get: async (d) => ({ ...d, server: api, timeoutMs: 4000 }), set: async () => {} },
        session: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o), remove: async (k) => { delete store[k]; } },
        onChanged: ev,
      },
      tabs: { getCurrent: (cb) => cb(null), query: async () => [{ url: "https://amaz0n-account-verify.top/signin" }] },
      permissions: { contains: async () => false },
    };
  }, { session, api: API });
  return { ctx, page, visited, errors };
}

// 1. Link guard: high-risk link replaced by the warning page.
const risky = "https://paypal.com.account-verify-secure.top/webscr?cmd=login";
let { ctx, page, visited, errors } = await open("result.html", { session: { pending: { kind: "url", value: risky } } });
await page.goto(`${ORIGIN}/result.html`);
await page.waitForSelector(".badge");
ok(await page.isVisible(".source.ok"), "result says it came from a completed analysis");
ok(await page.isVisible("#warning:not([hidden])"), "risky link shows a warning before navigation");
ok(await page.isDisabled("#open"), "high-risk link cannot be opened before the acknowledgement is ticked");
await page.check("#ack");
ok(!(await page.isDisabled("#open")), "explicit acknowledgement enables 'Open anyway'");
await page.click("#open");
await page.waitForURL(/destination|paypal\.com\.account-verify/);
ok(visited.some((u) => u.startsWith("https://paypal.com.account-verify-secure.top/")), "override opens only the checked link");
ok(errors.length === 0, "no page errors (warning flow)");
await ctx.close();

// 2. Go back from a warning reached by the link guard (#guard=…), with a stored decision.
({ ctx, page, errors } = await open("result.html", {
  session: { "guard:abc12345": { kind: "url", value: risky,
    result: { risk_level: "medium", risk_score: 45, verdict: "Suspicious", categories: [], urls: [], recommendations: ["Don't open it."] },
    decision: { action: "warn", requiresAcknowledgement: false } } },
}));
await page.route("https://news.example/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>news</h1>" }));
await page.goto("https://news.example/article");
await page.goto(`${ORIGIN}/result.html#guard=abc12345`);
await page.waitForSelector("#warning:not([hidden])");
ok(!(await page.isDisabled("#open")), "medium-risk warning offers 'Open anyway' without a checkbox");
await page.click("#back");
await page.waitForURL("https://news.example/article");
ok(true, "'Go back' returns to the page the user came from");
ok(errors.length === 0, "no page errors (go back)");
await ctx.close();

// 3. Low-risk link.
({ ctx, page } = await open("result.html", { session: { pending: { kind: "url", value: "https://www.paypal.com/signin" } } }));
await page.goto(`${ORIGIN}/result.html`);
await page.waitForSelector(".badge.low");
ok(await page.isHidden("#warning"), "low-risk link shows no warning");
ok(!(await page.isDisabled("#open")) && (await page.textContent("#open")) === "Open link", "low-risk link can be opened directly");
await ctx.close();

// 4. Backend unavailable.
({ ctx, page, errors } = await open("result.html", { session: { pending: { kind: "url", value: risky } }, apiDown: true }));
await page.goto(`${ORIGIN}/result.html`);
await page.waitForSelector(".source.unavailable");
ok((await page.textContent(".source.unavailable")).startsWith("Not checked"), "offline server is reported as 'Not checked', not as safe");
ok(await page.isDisabled("#open"), "an unchecked link still needs an acknowledgement");
ok(errors.length === 0, "no page errors (offline)");
await ctx.close();

// 5. Selected text.
({ ctx, page } = await open("result.html", { session: { pending: { kind: "message",
  value: "Your account will be suspended today. Share the OTP sent to your phone to verify." } } }));
await page.goto(`${ORIGIN}/result.html`);
await page.waitForSelector(".badge");
ok(/High risk|Suspicious/.test(await page.textContent(".badge")), "selected-text check returns a warning with evidence");
ok(await page.isHidden("#actions"), "text checks show no navigation buttons");
await ctx.close();

// 6. Popup shows server status and handles offline.
({ ctx, page } = await open("popup.html", { apiDown: true }));
await page.goto(`${ORIGIN}/popup.html`);
await page.waitForSelector(".status.offline");
ok((await page.textContent("#out")).includes("Not checked"), "popup reports an offline server honestly");
await ctx.close();

await browser.close();
console.log(`\nAll ${step} Guardian Shield page checks passed.`);
