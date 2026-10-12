// Minimal in-memory stand-in for the chrome.* APIs used by the extension.
export function installChromeMock({ settings = {}, granted = false } = {}) {
  const calls = { tabsCreate: [], tabsUpdate: [], registered: [], badge: [], title: [] };
  const sync = { server: "http://127.0.0.1:8000", timeoutMs: 8000, linkGuard: false, ...settings };
  const session = {};
  let perms = granted;
  const ev = () => ({ addListener() {} });
  globalThis.chrome = {
    calls,
    runtime: { onInstalled: ev(), onStartup: ev(), onMessage: ev(), getURL: (p) => `chrome-extension://test/${p}` },
    permissions: { onRemoved: ev(), onAdded: ev(), contains: async () => perms, request: async () => (perms = true), remove: async () => !(perms = false) },
    storage: {
      onChanged: ev(),
      sync: { get: async (d) => ({ ...d, ...sync }), set: async (o) => Object.assign(sync, o) },
      session: { get: async (k) => (typeof k === "string" ? { [k]: session[k] } : { ...session }), set: async (o) => Object.assign(session, o),
                 remove: async (k) => { delete session[k]; } },
    },
    scripting: {
      getRegisteredContentScripts: async () => calls.registered.map((id) => ({ id })),
      registerContentScripts: async (s) => { calls.registered.push(...s.map((x) => x.id)); },
      unregisterContentScripts: async ({ ids }) => { calls.registered = calls.registered.filter((x) => !ids.includes(x)); },
    },
    contextMenus: { onClicked: ev(), create() {}, removeAll: (cb) => cb && cb() },
    action: { setBadgeText: async (o) => calls.badge.push(o), setBadgeBackgroundColor: async () => {}, setTitle: async (o) => calls.title.push(o) },
    tabs: { create: async (o) => calls.tabsCreate.push(o), update: async (id, o) => calls.tabsUpdate.push({ id, ...o }) },
  };
  return { calls, session, sync };
}
