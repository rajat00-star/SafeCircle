import { analyze, render } from "./common.js";

const out = document.getElementById("out");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const url = tab?.url || "";
document.getElementById("subject").textContent = url || "No address";
if (!/^https?:/i.test(url)) {
  out.textContent = "This page isn't a website address that can be checked.";
} else {
  try { render(out, await analyze("url", url)); }
  catch (e) { out.className = "error"; out.textContent = `${e.message}. Check the server address in the extension options.`; }
}
