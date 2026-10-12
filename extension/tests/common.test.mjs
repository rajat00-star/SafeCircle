import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWith } from "../common.js";

const good = { risk_level: "low", risk_score: 3, verdict: "ok", categories: [], urls: [], recommendations: [] };
const json = (status, body) => async () => ({ status, ok: status < 400, json: async () => body });
const cfg = (fetchImpl, timeoutMs = 200) => ({ server: "http://srv", timeoutMs, fetchImpl });

test("completed analysis", async () => {
  let sent;
  const r = await analyzeWith(cfg(async (url, init) => { sent = { url, init }; return json(200, good)(); }), "url", "https://x.example");
  assert.equal(r.risk_level, "low");
  assert.equal(sent.url, "http://srv/api/v1/analyze/url");
  assert.equal(sent.init.credentials, "omit");
  assert.deepEqual(JSON.parse(sent.init.body), { url: "https://x.example" });
});

test("timeout", async () => {
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))));
  await assert.rejects(analyzeWith(cfg(hang, 30), "url", "https://x.example"), { kind: "timeout" });
});

test("backend unavailable", async () => {
  await assert.rejects(analyzeWith(cfg(async () => { throw new TypeError("Failed to fetch"); }), "url", "u"), { kind: "offline" });
});

test("http errors, rate limits and invalid bodies", async () => {
  await assert.rejects(analyzeWith(cfg(json(500, { detail: "Internal server error" })), "url", "u"), { kind: "http", message: "Internal server error" });
  await assert.rejects(analyzeWith(cfg(json(429, {})), "url", "u"), { kind: "ratelimited" });
  await assert.rejects(analyzeWith(cfg(json(200, { risk_level: "safe" })), "url", "u"), { kind: "invalid" });
  await assert.rejects(analyzeWith(cfg(async () => ({ status: 200, ok: true, json: async () => { throw new Error("html"); } })), "url", "u"), { kind: "invalid" });
});
