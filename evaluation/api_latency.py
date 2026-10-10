"""Measure end-to-end HTTP latency of /analyze/message against a running server.

Usage: python evaluation/api_latency.py http://127.0.0.1:8000 [n]
Uses the SMS test split messages, sequential requests, one client.
"""
import json
import statistics
import sys
import time
from pathlib import Path

import httpx

base, n = sys.argv[1].rstrip("/"), int(sys.argv[2]) if len(sys.argv) > 2 else 300
root = Path(__file__).resolve().parent
rows = [l.split("\t", 1)[1] for l in (root / "data/sms_spam_collection.tsv").read_text(errors="replace").splitlines() if "\t" in l]
test = [rows[i] for i in json.loads((root / "data/sms_split.json").read_text())["test"]][:n]
lat = []
with httpx.Client(timeout=10) as c:
    c.post(f"{base}/api/v1/analyze/message", json={"text": "warm up"})
    for t in test:
        t0 = time.perf_counter()
        r = c.post(f"{base}/api/v1/analyze/message", json={"text": t})
        lat.append((time.perf_counter() - t0) * 1000)
        r.raise_for_status()
lat.sort()
print(json.dumps({"n": len(lat), "p50_ms": round(lat[len(lat) // 2], 2), "p95_ms": round(lat[int(len(lat) * .95) - 1], 2),
                  "mean_ms": round(statistics.mean(lat), 2)}))
