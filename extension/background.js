// Service worker. Context menus, plus the optional link guard.
// The extension never reads page content. The link guard (off by default) only sees the
// address of a link the user clicks, and only after they granted site access in Options.
import { analyze, getSettings } from "./common.js";
import { cacheKey, decide, decideUnavailable, describeError, isFresh, minimizeUrl, shouldGuard } from "./shield.js";

const GUARD_ID = "sc-link-guard";
const ORIGINS = ["http://*/*", "https://*/*"];
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();   // in memory only; cleared when the worker stops

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "sc-link", title: "Check this link with SafeCircle", contexts: ["link"] });
    chrome.contextMenus.create({ id: "sc-text", title: "Check selected text with SafeCircle", contexts: ["selection"] });
  });
  await syncGuard();
});
chrome.runtime.onStartup.addListener(syncGuard);
chrome.permissions.onRemoved.addListener(syncGuard);
chrome.permissions.onAdded.addListener(syncGuard);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "linkGuard" in changes) syncGuard();
  if (area === "sync" && "server" in changes) cache.clear();
});

// Registers the click guard only when the user enabled it AND granted site access.
export async function syncGuard() {
  const { linkGuard } = await getSettings();
  const granted = await chrome.permissions.contains({ origins: ORIGINS });
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [GUARD_ID] });
  if (linkGuard && granted && existing.length === 0) {
    await chrome.scripting.registerContentScripts([{ id: GUARD_ID, js: ["guard.js"], matches: ORIGINS,
      runAt: "document_start", allFrames: false, persistAcrossSessions: true }]);
  } else if ((!linkGuard || !granted) && existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [GUARD_ID] });
  }
  await chrome.action.setBadgeText({ text: linkGuard && granted ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#12805c" });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  const item = info.menuItemId === "sc-link"
    ? { kind: "url", value: info.linkUrl }
    : { kind: "message", value: (info.selectionText || "").slice(0, 5000) };
  if (!item.value) return;
  // Kept in session storage (memory only, cleared when the browser closes), not in the URL.
  await chrome.storage.session.set({ pending: item });
  chrome.tabs.create({ url: chrome.runtime.getURL("result.html") });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "sc-guard-check" || !sender.tab) return false;
  handleGuard(msg, sender.tab).then(sendResponse, (e) => sendResponse(decideUnavailable(e)));
  return true;   // async response
});

export async function handleGuard(msg, tab) {
  const { server } = await getSettings();
  if (!shouldGuard(msg.url, msg.pageOrigin, server)) return openAllowed(msg, tab);
  // Only a minimal form of the address is sent (see minimizeUrl). The full address stays in this browser,
  // in session memory, so "Open anyway" can still go to the exact link the user clicked.
  const sent = minimizeUrl(msg.url);
  const key = cacheKey("url", sent);
  let entry = cache.get(key);
  if (!isFresh(entry, Date.now(), CACHE_TTL_MS)) {
    try {
      entry = { at: Date.now(), result: await analyze("url", sent) };
      cache.set(key, entry);
    } catch (e) {
      // Fail open, but say so: the toolbar shows "?" and the reason until the next check.
      await chrome.action.setBadgeText({ text: "?", tabId: tab.id });
      await chrome.action.setTitle({ title: describeError(e), tabId: tab.id });
      return { ...(await openAllowed(msg, tab)), action: "allow_unchecked", reason: describeError(e) };
    }
  }
  const d = decide(entry.result);
  if (d.action === "allow") return openAllowed(msg, tab);
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ ["guard:" + id]: { kind: "url", value: msg.url, sent, result: entry.result, decision: d } });
  const warnUrl = chrome.runtime.getURL(`result.html#guard=${id}`);
  if (msg.newTab) await chrome.tabs.create({ url: warnUrl, openerTabId: tab.id });
  else await chrome.tabs.update(tab.id, { url: warnUrl });
  return { action: d.action, handled: true };
}

// New-tab links are opened here (a page can't open a tab after an async wait without a popup blocker).
async function openAllowed(msg, tab) {
  if (msg.newTab) {
    await chrome.tabs.create({ url: msg.url, openerTabId: tab.id });
    return { action: "allow", handled: true };
  }
  return { action: "allow", handled: false };
}
