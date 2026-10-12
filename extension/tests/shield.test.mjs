import test from "node:test";
import assert from "node:assert/strict";
import { decide, decideUnavailable, describeError, shouldGuard, ShieldError, validateNavigableUrl, validateResult } from "../shield.js";

const ok = { risk_level: "high", risk_score: 88, verdict: "x", categories: [], urls: [], recommendations: [] };

test("navigable URLs: only http(s), no hidden credentials", () => {
  assert.equal(validateNavigableUrl("https://example.com/a").ok, true);
  assert.equal(validateNavigableUrl("javascript:alert(1)").ok, false);
  assert.equal(validateNavigableUrl("data:text/html,hi").ok, false);
  assert.equal(validateNavigableUrl("https://paypal.com@evil.example/").ok, false);
  assert.equal(validateNavigableUrl("not a url").ok, false);
  assert.equal(validateNavigableUrl("https://x.example/" + "a".repeat(2100)).ok, false);
});

test("risk levels map to allow / warn / block-with-acknowledgement", () => {
  assert.deepEqual(decide({ ...ok, risk_level: "low" }), { action: "allow", requiresAcknowledgement: false });
  assert.deepEqual(decide({ ...ok, risk_level: "medium" }), { action: "warn", requiresAcknowledgement: false });
  assert.deepEqual(decide(ok), { action: "block", requiresAcknowledgement: true });
});

test("invalid responses are rejected, never treated as safe", () => {
  assert.equal(validateResult(ok), ok);
  for (const bad of [null, "x", { ...ok, risk_level: "safe" }, { ...ok, risk_score: 101 }, { ...ok, categories: null }]) {
    assert.throws(() => validateResult(bad), (e) => e instanceof ShieldError && e.kind === "invalid");
  }
});

test("unavailable service is described honestly", () => {
  assert.match(decideUnavailable(new ShieldError("timeout", "t")).reason, /^Not checked: .*too long/);
  assert.match(describeError(new ShieldError("offline", "o")), /could not be reached/);
  assert.equal(decideUnavailable(new ShieldError("offline", "o")).action, "allow_unchecked");
});

test("guard skips same-site, local and SafeCircle-server links", () => {
  assert.equal(shouldGuard("https://other.example/x", "https://news.example", "http://127.0.0.1:8000"), true);
  assert.equal(shouldGuard("https://news.example/x", "https://news.example", ""), false);
  assert.equal(shouldGuard("http://127.0.0.1:8000/api", "https://news.example", "http://127.0.0.1:8000"), false);
  assert.equal(shouldGuard("http://localhost:3000/", "https://news.example", ""), false);
  assert.equal(shouldGuard("mailto:a@b.c", "https://news.example", ""), false);
});
