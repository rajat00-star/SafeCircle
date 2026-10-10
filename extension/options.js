import { getServer } from "./common.js";

const input = document.getElementById("server");
const status = document.getElementById("status");
input.value = await getServer();
document.getElementById("save").addEventListener("click", async () => {
  let v = input.value.trim().replace(/\/$/, "");
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("Use https");
  } catch {
    status.textContent = "Enter a valid https:// address (http is allowed only for localhost).";
    return;
  }
  await chrome.storage.sync.set({ server: v });
  try {
    const r = await fetch(`${v}/api/v1/health`);
    status.textContent = r.ok ? "Saved. Server reachable." : `Saved, but the server answered ${r.status}.`;
  } catch {
    status.textContent = "Saved, but the server couldn't be reached.";
  }
});
