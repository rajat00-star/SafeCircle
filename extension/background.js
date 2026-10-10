// Context menus only. The extension never reads pages on its own.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "sc-link", title: "Check this link with SafeCircle", contexts: ["link"] });
  chrome.contextMenus.create({ id: "sc-text", title: "Check selected text with SafeCircle", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const item = info.menuItemId === "sc-link"
    ? { kind: "url", value: info.linkUrl }
    : { kind: "message", value: (info.selectionText || "").slice(0, 5000) };
  if (!item.value) return;
  // Kept in session storage (memory only, cleared when the browser closes), not in the URL.
  await chrome.storage.session.set({ pending: item });
  chrome.tabs.create({ url: chrome.runtime.getURL("result.html") });
});
