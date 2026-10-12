// Guardian Shield decision logic. Pure functions: no chrome.* APIs, no network,
// so they can be unit-tested in Node (extension/tests/shield.test.mjs).

export const LEVELS = ["low", "medium", "high"];

export class ShieldError extends Error {
  // kind: offline | timeout | http | ratelimited | invalid | config
  constructor(kind, message) { super(message); this.kind = kind; }
}

// Only ordinary web addresses may be opened from a warning page.
export function validateNavigableUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "No address." };
  if (raw.length > 2048) return { ok: false, reason: "The address is too long." };
  let u;
  try { u = new URL(raw.trim()); } catch { return { ok: false, reason: "This is not a valid web address." }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `Only http and https links can be opened (this is ${u.protocol.replace(":", "")}).` };
  }
  if (u.username || u.password) return { ok: false, reason: "The link hides its real destination behind an '@'." };
  if (!u.hostname) return { ok: false, reason: "The address has no host name." };
  return { ok: true, url: u.href };
}

// Checks that an API response has the shape the extension relies on. Anything else is
// treated as "not checked", never as "safe".
export function validateResult(body) {
  const fail = (why) => { throw new ShieldError("invalid", `The server sent an unexpected response (${why}).`); };
  if (!body || typeof body !== "object") fail("not an object");
  if (!LEVELS.includes(body.risk_level)) fail("risk level");
  if (typeof body.risk_score !== "number" || body.risk_score < 0 || body.risk_score > 100) fail("risk score");
  if (typeof body.verdict !== "string") fail("verdict");
  for (const k of ["categories", "urls", "recommendations"]) if (!Array.isArray(body[k])) fail(k);
  return body;
}

// What to do before navigating to a link, given a completed analysis.
//   allow -> open the link
//   warn  -> show the warning page; "continue" is a single explicit click
//   block -> show the warning page; continuing needs a ticked acknowledgement first
export function decide(result) {
  if (result.risk_level === "high") return { action: "block", requiresAcknowledgement: true };
  if (result.risk_level === "medium") return { action: "warn", requiresAcknowledgement: false };
  return { action: "allow", requiresAcknowledgement: false };
}

// When the service could not answer, the link guard lets navigation continue (it would
// otherwise break browsing whenever the server is down) but says clearly that nothing was checked.
export function decideUnavailable(error) {
  return { action: "allow_unchecked", reason: describeError(error) };
}

export function describeError(e) {
  const kind = e && e.kind;
  if (kind === "timeout") return "Not checked: the SafeCircle server took too long to answer.";
  if (kind === "offline") return "Not checked: the SafeCircle server could not be reached. Check the address in the extension options.";
  if (kind === "ratelimited") return "Not checked: too many checks in a short time. Try again in a minute.";
  if (kind === "invalid") return "Not checked: the server's response could not be understood.";
  if (kind === "http") return `Not checked: ${e.message}`;
  return `Not checked: ${e && e.message ? e.message : "unknown error"}`;
}

// Hosts never sent to the server by the link guard: the SafeCircle server itself and local addresses.
export function shouldGuard(target, pageOrigin, server) {
  const v = validateNavigableUrl(target);
  if (!v.ok) return false;
  const u = new URL(v.url);
  if (pageOrigin && u.origin === pageOrigin) return false;            // same-site navigation is not checked
  if (server) { try { if (u.origin === new URL(server).origin) return false; } catch { /* ignore */ } }
  if (["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return false;
  return true;
}

// What the link guard and popup send to the server: scheme, host, port and path unchanged; each query
// value replaced by "x" characters of the same length (keeps the "very long link" check); a value that is
// itself a web address cut down to its origin (keeps the "redirects to another site" check); short plain
// lower-case words such as "login" kept (keeps the login/verify-word check); the #fragment dropped.
// Tokens, e-mail addresses and IDs in the query therefore never leave the browser. Returns null for
// addresses that may not be opened at all.
const EMBEDDED_URL = /^(?:https?:)?\/\//i;
const PLAIN_WORD = /^[a-z][a-z-]{0,23}$/;
const PLAIN_KEY = /^[A-Za-z_][\w.\-[\]]{0,31}$/;

function decodePart(s) {
  try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch { return null; }
}

export function minimizeUrl(raw) {
  const v = validateNavigableUrl(raw);
  if (!v.ok) return null;
  const u = new URL(v.url);
  const query = u.search.slice(1);
  const parts = !query ? [] : query.split("&").map((seg) => {
    const i = seg.indexOf("=");
    let key = i < 0 ? seg : seg.slice(0, i);
    let value = i < 0 ? null : seg.slice(i + 1);
    if (value !== null) {
      const d = decodePart(value);
      if (d !== null && EMBEDDED_URL.test(d)) {
        try {
          const e = new URL(d.startsWith("//") ? "https:" + d : d);
          value = encodeURIComponent(`${e.protocol}//${e.host}`);
        } catch { value = "x".repeat(value.length); }
      } else if (d === null || !PLAIN_WORD.test(d)) {
        value = "x".repeat(value.length);
      }
    }
    const dk = decodePart(key);
    if (dk === null || !PLAIN_KEY.test(dk)) key = "x".repeat(key.length);
    return value === null ? key : `${key}=${value}`;
  });
  return `${u.protocol}//${u.host}${u.pathname}${parts.length ? "?" + parts.join("&") : ""}`;
}

// Small in-memory cache so the same link is not re-sent within a short window.
export function cacheKey(kind, value) { return `${kind}:${value}`; }
export function isFresh(entry, now, ttlMs) { return !!entry && now - entry.at < ttlMs; }
