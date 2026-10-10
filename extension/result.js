import { analyze, render } from "./common.js";

const out = document.getElementById("out");
const { pending } = await chrome.storage.session.get("pending");
await chrome.storage.session.remove("pending");
if (!pending) {
  out.textContent = "Nothing to check. Right-click a link or selected text and choose SafeCircle.";
} else {
  document.getElementById("subject").textContent = pending.value;
  try { render(out, await analyze(pending.kind, pending.value)); }
  catch (e) { out.className = "error"; out.textContent = `${e.message}. Check the server address in the extension options.`; }
}
