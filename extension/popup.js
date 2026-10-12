import { analyze, getSettings, health, render, renderUnavailable } from "./common.js";
import { describeError } from "./shield.js";

const out = document.getElementById("out");
const status = document.getElementById("status");
const s = await getSettings();
const server = s.server.replace(/\/$/, "");
const granted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
document.getElementById("guard").textContent = s.linkGuard && granted
  ? "Link guard is on: links you click to other sites are checked before they open."
  : "Link guard is off. Turn it on in Options to be warned before risky links open.";

const h = await health(server);
status.textContent = h.ok ? `Server online (${server})` : h.reachable ? `Server answered but is ${h.detail}` : `Server offline (${server}): ${h.detail}`;
status.className = `status ${h.ok ? "online" : "offline"}`;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const url = tab?.url || "";
document.getElementById("subject").textContent = url || "No address";
if (!/^https?:/i.test(url)) {
  out.textContent = "This page isn't a website address that can be checked.";
} else if (!h.reachable) {
  renderUnavailable(out, "Not checked: the SafeCircle server could not be reached. Check the address in Options.");
} else {
  try { render(out, await analyze("url", url)); }
  catch (e) { renderUnavailable(out, describeError(e)); }
}
