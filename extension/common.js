// Shared helpers for extension pages and the service worker. No remote code is loaded.
import { ShieldError, validateResult } from "./shield.js";

export const DEFAULT_SERVER = "http://127.0.0.1:8000";
export const DEFAULTS = { server: DEFAULT_SERVER, timeoutMs: 8000, linkGuard: false };

export async function getSettings() {
  return chrome.storage.sync.get(DEFAULTS);
}

export async function getServer() {
  const { server } = await getSettings();
  return server.replace(/\/$/, "");
}

// fetch with a timeout and typed errors. `fetchImpl` is injectable for tests.
export async function analyzeWith({ server, timeoutMs, fetchImpl = fetch }, kind, value) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${server}/api/v1/analyze/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "url" ? { url: value } : { text: value }),
      signal: ctrl.signal,
      credentials: "omit",
    });
  } catch (e) {
    throw e && e.name === "AbortError" ? new ShieldError("timeout", "Timed out") : new ShieldError("offline", "Server unreachable");
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => null);
  if (res.status === 429) throw new ShieldError("ratelimited", "Rate limited");
  if (!res.ok) {
    const detail = body && (typeof body.detail === "string" ? body.detail : body.errors?.map((x) => x.message).join("; "));
    throw new ShieldError("http", detail || `Server error ${res.status}`);
  }
  return validateResult(body);
}

export async function analyze(kind, value) {
  const s = await getSettings();
  return analyzeWith({ server: s.server.replace(/\/$/, ""), timeoutMs: s.timeoutMs }, kind, value);
}

export async function health(server, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${server}/api/v1/health`, { signal: ctrl.signal, credentials: "omit" });
    const b = await r.json().catch(() => ({}));
    return { reachable: true, ok: r.ok && b.status === "ok", detail: r.ok ? b.status : `HTTP ${r.status}` };
  } catch (e) {
    return { reachable: false, ok: false, detail: e && e.name === "AbortError" ? "timed out" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

const LABEL = { low: "Low risk", medium: "Suspicious", high: "High risk" };

// Builds DOM nodes with textContent only, so nothing from the page or server is parsed as HTML.
export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function render(root, result) {
  root.replaceChildren();
  const src = el("p", "source ok", "Completed analysis by your SafeCircle server. The link was read as text, never opened.");
  root.append(src);
  const head = el("div", `head ${result.risk_level}`);
  head.append(el("span", `badge ${result.risk_level}`, `${LABEL[result.risk_level]} · ${result.risk_score}/100`));
  head.append(el("p", "verdict", result.verdict));
  root.append(head);
  if (result.categories.length) {
    root.append(el("h3", null, "Warning signs and evidence"));
    const ul = el("ul");
    for (const c of result.categories) {
      const li = el("li");
      li.append(el("strong", null, c.title));
      li.append(el("div", "muted", c.explanation));
      const ev = (c.evidence || []).map((e) => e.text).filter(Boolean).slice(0, 3);
      if (ev.length) {
        const chips = el("div", "chips");
        for (const t of ev) chips.append(el("span", "chip", t));
        li.append(chips);
      }
      ul.append(li);
    }
    root.append(ul);
  }
  for (const u of result.urls) {
    if (!u.signals.length) continue;
    root.append(el("h3", null, `Link: ${u.registered_domain || u.hostname}`));
    const ul = el("ul");
    for (const s of u.signals) ul.append(el("li", null, `${s.title}. ${s.detail}`));
    root.append(ul);
  }
  root.append(el("h3", null, "What to do"));
  const recs = el("ul");
  for (const r of result.recommendations.slice(0, 4)) recs.append(el("li", null, r));
  root.append(recs);
  if (result.risk_level === "low") {
    root.append(el("p", "muted", "Low risk means no warning signs were found in the address or text. It is not proof of safety."));
  }
}

export function renderUnavailable(root, message) {
  root.replaceChildren();
  root.append(el("p", "source unavailable", message));
  root.append(el("p", "muted", "Nothing was analysed, so this is not a safety rating. If money, codes or passwords are involved, verify through a channel you already trust."));
}
