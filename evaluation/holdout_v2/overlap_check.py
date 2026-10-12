"""Check the v2 holdout texts against everything the rules may already have seen.

Compares every v2 event text with string literals from the v1 scenario set, the backend tests, the demo
fixtures and the e2e scripts, using word-trigram Jaccard similarity and shared UPI handles / domains.
Writes overlap_report.json. A high score means "possibly seen before", not proof of leakage.

    backend/.venv/bin/python evaluation/holdout_v2/overlap_check.py
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
WORD = re.compile(r"[a-z0-9]+")
IDENT = re.compile(r"[a-z0-9._-]+@[a-z]+|[a-z0-9-]+\.(?:example|test|com|in)\b", re.I)


def grams(t: str) -> set:
    w = WORD.findall(t.lower())
    return {" ".join(w[i:i + 3]) for i in range(len(w) - 2)}


def jac(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def py_strings(path: Path) -> list[str]:
    out = []
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) > 25:
            out.append(node.value)
    return out


def corpus() -> list[tuple[str, str]]:
    items = []
    v1 = json.loads((ROOT / "evaluation/scam_dna/scenarios_v1.json").read_text())
    for sc in v1["scenarios"]:
        for e in sc["events"]:
            items.append((f"v1:{sc['id']}", e["content"]))
    for p in sorted((ROOT / "backend/tests").glob("test_*.py")):
        items += [(f"tests:{p.name}", s) for s in py_strings(p)]
    for p in [ROOT / "backend/app/scamdna/demo.py", ROOT / "backend/app/scamdna/tactics.py",
              ROOT / "backend/app/scamdna/upi.py", ROOT / "backend/app/detector/rules.py"]:
        items += [(f"app:{p.name}", s) for s in py_strings(p)]
    for p in sorted((ROOT / "e2e").glob("*.mjs")):
        items += [(f"e2e:{p.name}", s) for s in re.findall(r"[\"'`]([^\"'`\n]{26,})[\"'`]", p.read_text())]
    return items


def main() -> None:
    data = json.loads((HERE / "dataset_v2.json").read_text())
    ref = [(src, t, grams(t), {x.lower() for x in IDENT.findall(t)}) for src, t in corpus()]
    rows = []
    for sc in data["scenarios"]:
        for i, e in enumerate(sc["events"], 1):
            text = e.get("content") or f"{e.get('input', '')} {e.get('context', '')}"
            if not text.strip():
                continue
            g, ids = grams(text), {x.lower() for x in IDENT.findall(text)}
            best = max(ref, key=lambda r: jac(g, r[2]))
            shared = sorted({x for r in ref for x in (ids & r[3])})
            rows.append({"scenario": sc["id"], "event": i, "max_trigram_jaccard": round(jac(g, best[2]), 3),
                         "closest_source": best[0], "closest_text": best[1][:160], "shared_identifiers": shared})
    rows.sort(key=lambda r: -r["max_trigram_jaccard"])
    summary = {"events_checked": len(rows),
               "jaccard_ge_0.5": sum(r["max_trigram_jaccard"] >= 0.5 for r in rows),
               "jaccard_ge_0.3": sum(r["max_trigram_jaccard"] >= 0.3 for r in rows),
               "jaccard_ge_0.15": sum(r["max_trigram_jaccard"] >= 0.15 for r in rows),
               "events_sharing_an_identifier": sum(bool(r["shared_identifiers"]) for r in rows)}
    (HERE / "overlap_report.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(summary, indent=2))
    for r in rows[:15]:
        print(r["max_trigram_jaccard"], r["scenario"], r["event"], r["closest_source"], "|", r["closest_text"][:100], r["shared_identifiers"])


if __name__ == "__main__":
    main()
