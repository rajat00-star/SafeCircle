// Shared helpers for extension pages. No remote code is loaded.
export const DEFAULT_SERVER = "http://127.0.0.1:8000";

export async function getServer() {
  const { server } = await chrome.storage.sync.get({ server: DEFAULT_SERVER });
  return server.replace(/\/$/, "");
}

export async function analyze(kind, value) {
  const server = await getServer();
  const res = await fetch(`${server}/api/v1/analyze/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kind === "url" ? { url: value } : { text: value }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || `Server error ${res.status}`);
  return body;
}

const LABEL = { low: "Low risk", medium: "Suspicious", high: "High risk" };

// Builds DOM nodes with textContent only, so nothing from the page or server is parsed as HTML.
export function render(root, result) {
  root.replaceChildren();
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const head = el("div", `head ${result.risk_level}`);
  head.append(el("span", `badge ${result.risk_level}`, `${LABEL[result.risk_level]} · ${result.risk_score}/100`));
  head.append(el("p", "verdict", result.verdict));
  root.append(head);
  if (result.categories.length) {
    root.append(el("h3", null, "Warning signs"));
    const ul = el("ul");
    for (const c of result.categories) {
      const li = el("li");
      li.append(el("strong", null, c.title));
      li.append(el("div", "muted", c.explanation));
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
}
