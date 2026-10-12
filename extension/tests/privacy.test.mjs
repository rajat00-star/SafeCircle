// Development regression suite for finding M1: the link guard and popup send a minimal address.
import test from "node:test";
import assert from "node:assert/strict";
import { minimizeUrl } from "../shield.js";
import { installChromeMock } from "./chrome-mock.mjs";

test("query values are replaced by same-length placeholders; host and path unchanged", () => {
  const raw = "https://shop.example/orders/view?token=Ab12Cd34Ef&email=asha%40mail.example";
  const m = minimizeUrl(raw);
  assert.equal(m, "https://shop.example/orders/view?token=xxxxxxxxxx&email=" + "x".repeat(19));
  assert.equal(m.length, raw.length);
  assert.doesNotMatch(m, /Ab12|asha|mail\.example/);
});

test("fragment and credentials never leave the browser", () => {
  assert.equal(minimizeUrl("https://docs.example/page#access_token=secret123"), "https://docs.example/page");
  assert.equal(minimizeUrl("https://user:pw@site.example/"), null);
  assert.equal(minimizeUrl("javascript:alert(1)"), null);
});

test("an embedded web address keeps only its origin, so the redirect check still works", () => {
  const m = minimizeUrl("https://r.example/out?next=https%3A%2F%2Fevil.example%2Freset%3Fuid%3D991&x=1");
  assert.equal(m, "https://r.example/out?next=https%3A%2F%2Fevil.example&x=x");
  assert.match(minimizeUrl("https://r.example/out?u=//evil.example/p"), /u=https%3A%2F%2Fevil\.example$/);
});

test("short plain words such as login stay, so the login/verify-word check still works", () => {
  assert.equal(minimizeUrl("https://a.example/index.php?page=login&lang=en"), "https://a.example/index.php?page=login&lang=en");
  assert.equal(minimizeUrl("https://a.example/?q=John"), "https://a.example/?q=xxxx");   // capitalised: could be a name
});

test("token-like keys are masked too, keeping their length", () => {
  const m = minimizeUrl("https://a.example/authorize.php?9w5dlawavfzzhicuz");
  assert.equal(m, "https://a.example/authorize.php?" + "x".repeat(17));
});

test("addresses without a query are sent unchanged", () => {
  assert.equal(minimizeUrl("https://sbi-kyc.example/login"), "https://sbi-kyc.example/login");
});

test("link guard sends only the minimal address and keeps the full one locally for 'Open anyway'", async () => {
  const sent = [];
  globalThis.fetch = async (_u, init) => {
    sent.push(JSON.parse(init.body).url);
    return { status: 200, ok: true, json: async () => ({ risk_level: "high", risk_score: 80, verdict: "x", categories: [], urls: [], recommendations: [] }) };
  };
  const mock = installChromeMock({ settings: { linkGuard: true }, granted: true });
  const bg = await import("../background.js");
  const full = "https://pay-verify.example/login?session=9f8e7d6c&mail=asha%40mail.example#step2";
  await bg.handleGuard({ url: full, pageOrigin: "https://news.example", newTab: false }, { id: 3 });
  assert.deepEqual(sent, ["https://pay-verify.example/login?session=xxxxxxxx&mail=" + "x".repeat(19)]);
  const id = mock.calls.tabsUpdate.at(-1).url.split("guard=")[1];
  assert.equal(mock.session["guard:" + id].value, full);
});
