import { readFileSync, writeFileSync } from "node:fs";
import { minimizeUrl } from "../../extension/shield.js";
const [inp, out] = process.argv.slice(2);
const rows = readFileSync(inp, "utf8").split("\n").filter(Boolean).filter((u) => /[?#]/.test(u)).map((u) => {
  let full = u; try { full = new URL(u).href; } catch {}
  return { full, min: minimizeUrl(u) };
});
writeFileSync(out, JSON.stringify(rows));
