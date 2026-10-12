// Extension client against a running SafeCircle backend (skipped if none is reachable).
// Usage: BACKEND_URL=http://127.0.0.1:8000 node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWith } from "../common.js";
import { decide } from "../shield.js";

const server = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const up = await fetch(server + "/api/v1/health").then((r) => r.ok).catch(() => false);

test("link check against the live backend", { skip: !up && `no backend at ${server}` }, async () => {
  const risky = await analyzeWith({ server, timeoutMs: 5000 }, "url", "https://paypal.com.account-verify-secure.top/webscr?cmd=login");
  assert.notEqual(decide(risky).action, "allow");
  const official = await analyzeWith({ server, timeoutMs: 5000 }, "url", "https://www.paypal.com/signin");
  assert.equal(decide(official).action, "allow");
});

test("selected-text check against the live backend", { skip: !up && `no backend at ${server}` }, async () => {
  const r = await analyzeWith({ server, timeoutMs: 5000 }, "message",
    "Your account will be suspended today. Share the OTP sent to your phone to verify.");
  assert.ok(["medium", "high"].includes(r.risk_level));
});

test("validation errors surface as http errors", { skip: !up && `no backend at ${server}` }, async () => {
  await assert.rejects(analyzeWith({ server, timeoutMs: 5000 }, "url", "has space"), { kind: "http" });
});
