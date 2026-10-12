// Optional link guard (content script). Registered only after the user turns it on in
// Options and grants site access. It reads nothing from the page except the address of a
// link the user clicks, and only for links leaving the current site.
(() => {
  if (window.__safeCircleGuard) return;
  window.__safeCircleGuard = true;

  function go(href, newTab) {
    if (newTab) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  }

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!a || a.hasAttribute("download")) return;
    let target;
    try { target = new URL(a.href); } catch { return; }
    if (!/^https?:$/.test(target.protocol) || target.origin === window.location.origin) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const newTab = !!a.target && a.target !== "_self";
    chrome.runtime.sendMessage({ type: "sc-guard-check", url: target.href, pageOrigin: window.location.origin, newTab })
      .then((r) => { if (!r || !r.handled) go(target.href, newTab); })
      .catch(() => go(target.href, newTab));   // extension reloaded or worker unavailable: never trap the user
  }, true);
})();
