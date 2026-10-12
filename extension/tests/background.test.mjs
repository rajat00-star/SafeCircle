import test from "node:test";
import assert from "node:assert/strict";
import { installChromeMock } from "./chrome-mock.mjs";

const high = { risk_level: "high", risk_score: 91, verdict: "x", categories: [], urls: [], recommendations: [] };
const low = { ...high, risk_level: "low", risk_score: 2 };
let fetchCount = 0;
let reply = high;
globalThis.fetch = async () => { fetchCount++; if (reply instanceof Error) throw reply; return { status: 200, ok: true, json: async () => reply }; };

const mock = installChromeMock({ settings: { linkGuard: true }, granted: true });
const bg = await import("../background.js");
const tab = { id: 7 };

test("risky link: navigation is replaced by the warning page; result kept in session memory", async () => {
  const r = await bg.handleGuard({ url: "https://sbi-kyc.example/login", pageOrigin: "https://news.example", newTab: false }, tab);
  assert.deepEqual(r, { action: "block", handled: true });
  const upd = mock.calls.tabsUpdate.at(-1);
  assert.equal(upd.id, 7);
  assert.match(upd.url, /result\.html#guard=/);
  const id = upd.url.split("guard=")[1];
  assert.equal(mock.session["guard:" + id].decision.requiresAcknowledgement, true);
});

test("same link again within the cache window is not re-sent", async () => {
  const before = fetchCount;
  await bg.handleGuard({ url: "https://sbi-kyc.example/login", pageOrigin: "https://news.example" }, tab);
  assert.equal(fetchCount, before);
});

test("low-risk link continues; new-tab links are opened by the worker", async () => {
  reply = low;
  assert.deepEqual(await bg.handleGuard({ url: "https://ok.example/", pageOrigin: "https://news.example" }, tab), { action: "allow", handled: false });
  const r = await bg.handleGuard({ url: "https://ok2.example/", pageOrigin: "https://news.example", newTab: true }, tab);
  assert.equal(r.handled, true);
  assert.equal(mock.calls.tabsCreate.at(-1).url, "https://ok2.example/");
});

test("backend unavailable: fail open, but flagged as not checked", async () => {
  reply = new TypeError("Failed to fetch");
  const r = await bg.handleGuard({ url: "https://down.example/", pageOrigin: "https://news.example" }, tab);
  assert.equal(r.action, "allow_unchecked");
  assert.match(r.reason, /Not checked/);
  assert.equal(mock.calls.badge.at(-1).text, "?");
});

test("same-site links are never sent", async () => {
  const before = fetchCount;
  await bg.handleGuard({ url: "https://news.example/other", pageOrigin: "https://news.example" }, tab);
  assert.equal(fetchCount, before);
});

test("guard script registers only when enabled and permitted", async () => {
  await bg.syncGuard();
  assert.deepEqual(mock.calls.registered, ["sc-link-guard"]);
  await chrome.storage.sync.set({ linkGuard: false });
  await bg.syncGuard();
  assert.deepEqual(mock.calls.registered, []);
  await chrome.storage.sync.set({ linkGuard: true });
  await chrome.permissions.remove({});
  await bg.syncGuard();
  assert.deepEqual(mock.calls.registered, []);
});
