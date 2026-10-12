import json, sys, collections
sys.path.insert(0, "backend")
from app.detector.engine import analyze_single_url
rows = json.load(open(sys.argv[1])); total = int(sys.argv[2])
tr = collections.Counter(); sig = collections.Counter(); skipped = 0
for r in rows:
    if r["min"] is None: skipped += 1; continue
    a, b = analyze_single_url(r["full"]), analyze_single_url(r["min"])
    tr[f"{a.risk_level}->{b.risk_level}"] += 1
    sa = {e["rule"] for c in a.categories for e in c.evidence}; sb = {e["rule"] for c in b.categories for e in c.evidence}
    for s in sa - sb: sig["lost " + s] += 1
    for s in sb - sa: sig["gained " + s] += 1
print(json.dumps({"urls": total, "with_query_or_fragment": len(rows), "not_sendable": skipped, "level_transitions": dict(sorted(tr.items())), "signal_changes": dict(sig)}))
