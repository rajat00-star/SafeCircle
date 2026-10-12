import { getSettings, health } from "./common.js";

const ORIGINS = ["http://*/*", "https://*/*"];
const $ = (id) => document.getElementById(id);
const s = await getSettings();
$("server").value = s.server;
$("timeout").value = Math.round(s.timeoutMs / 1000);
const granted = await chrome.permissions.contains({ origins: ORIGINS });
$("guard").checked = s.linkGuard && granted;

$("save").addEventListener("click", async () => {
  const v = $("server").value.trim().replace(/\/$/, "");
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("Use https");
  } catch {
    $("status").textContent = "Enter a valid https:// address (http is allowed only for localhost).";
    return;
  }
  const t = Math.min(30, Math.max(2, Number($("timeout").value) || 8));
  await chrome.storage.sync.set({ server: v, timeoutMs: t * 1000 });
  const h = await health(v);
  $("status").textContent = h.ok ? "Saved. Server reachable." : h.reachable ? `Saved, but the server reports ${h.detail}.` : "Saved, but the server couldn't be reached.";
});

$("guard").addEventListener("change", async (e) => {
  if (e.target.checked) {
    const ok = await chrome.permissions.request({ origins: ORIGINS });   // needs this click (a user gesture)
    if (!ok) {
      e.target.checked = false;
      $("guard-status").textContent = "Site access was not granted, so the link guard stays off.";
      return;
    }
    await chrome.storage.sync.set({ linkGuard: true });
    $("guard-status").textContent = "Link guard is on for pages you open from now on.";
  } else {
    await chrome.storage.sync.set({ linkGuard: false });
    await chrome.permissions.remove({ origins: ORIGINS });
    $("guard-status").textContent = "Link guard is off and site access was removed.";
  }
});
