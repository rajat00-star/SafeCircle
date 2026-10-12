import { analyze, render, renderUnavailable } from "./common.js";
import { decide, describeError, validateNavigableUrl } from "./shield.js";

const $ = (id) => document.getElementById(id);
const out = $("out");

async function loadItem() {
  const m = location.hash.match(/^#guard=([\w-]{8,64})$/);
  if (m) {
    const key = "guard:" + m[1];
    const data = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.remove(key);
    return data ? { ...data, guard: true } : null;
  }
  const { pending } = await chrome.storage.session.get("pending");
  await chrome.storage.session.remove("pending");
  return pending || null;
}

function goBack(guard) {
  if (guard && history.length > 1) history.back();
  else chrome.tabs.getCurrent((t) => (t ? chrome.tabs.remove(t.id) : window.close()));
}

function showLinkActions(item, result) {
  const d = result ? decide(result) : { action: "warn", requiresAcknowledgement: true };
  const v = validateNavigableUrl(item.value);
  $("actions").hidden = false;
  $("back").addEventListener("click", () => goBack(item.guard));
  if (!v.ok) {
    $("open").hidden = true;
    out.append(Object.assign(document.createElement("p"), { className: "error", textContent: v.reason }));
    return;
  }
  if (d.action !== "allow") {
    $("warning").hidden = false;
    $("warning").className = `warning ${result ? result.risk_level : "unknown"}`;
    $("warn-title").textContent = !result ? "This link could not be checked"
      : d.action === "block" ? "High risk: this link shows strong scam warning signs" : "Caution: this link shows warning signs";
    $("warn-text").textContent = !result ? "SafeCircle could not analyse it, so it is neither confirmed safe nor unsafe."
      : "Review the evidence below. Going back is the safe choice. If you were asked to log in, pay or share a code, don't.";
    $("open").textContent = "Open anyway";
  }
  if (d.requiresAcknowledgement) {
    $("ack-row").hidden = false;
    $("open").disabled = true;
    $("ack").addEventListener("change", () => { $("open").disabled = !$("ack").checked; });
  }
  $("open").addEventListener("click", () => {
    if (d.requiresAcknowledgement && !$("ack").checked) return;
    chrome.tabs.getCurrent((t) => (t ? chrome.tabs.update(t.id, { url: v.url }) : location.assign(v.url)));
  });
}

const item = await loadItem();
if (!item) {
  out.textContent = "Nothing to check. Right-click a link or selected text and choose SafeCircle.";
} else {
  $("subject").textContent = item.value;
  let result = item.result || null;
  if (!result) {
    try { result = await analyze(item.kind, item.value); }
    catch (e) { renderUnavailable(out, describeError(e)); }
  }
  if (result) render(out, result);
  if (item.kind === "url") showLinkActions(item, result);
}
