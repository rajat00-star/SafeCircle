"""Cross-feature integration checks added during independent validation (2026-10-12).

Each test drives the real HTTP API across more than one feature: UPI Scam Guard -> Scam DNA case ->
Campaign Radar -> Scam Network -> Evidence Report. All inputs are synthetic DEMO DATA.
"""
API = "/api/v1"

SCAM_QR = "upi://pay?pa=evalrefund.desk@ybl&pn=Refund%20Desk&am=2999&cu=INR"
SCAM_CONTEXT = "Your refund of Rs 2,999 is ready. Scan and enter PIN to receive it."


def _case(client, h, title):
    r = client.post(f"{API}/cases", headers=h, json={"title": title})
    assert r.status_code == 201
    return r.json()["id"]


def _other_profile(client):
    r = client.post(f"{API}/profiles", json={"display_name": "Other"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_upi_check_flows_into_case_network_campaigns_and_report(client, profile):
    h = profile["headers"]
    a, b = _case(client, h, "Refund QR one"), _case(client, h, "Refund QR two")
    r = client.post(f"{API}/upi/check", headers=h, json={"input": SCAM_QR, "context": SCAM_CONTEXT, "case_id": a})
    assert r.status_code == 200
    upd = r.json()["case_update"]
    assert upd["event_added"] and not upd["duplicate"] and upd["risk_level"] in ("medium", "high")

    case_a = client.get(f"{API}/cases/{a}", headers=h).json()
    assert len(case_a["events"]) == 1 and case_a["events"][0]["channel"] == "upi_app"
    assert "evalrefund.desk@ybl" not in str(case_a)          # stored masked, never raw
    assert case_a["last_change"]["score_after"] == case_a["risk_score"]

    # The same handle, in a differently worded message, attached to a second case.
    r = client.post(f"{API}/upi/check", headers=h,
                    json={"input": "evalrefund.desk@ybl", "context": "Pending refund. Approve the request with your PIN.",
                          "case_id": b})
    assert r.status_code == 200
    # The second check sees the first case.
    assert any(m["case_id"] == a for m in r.json()["case_matches"])

    camp = client.get(f"{API}/campaigns", headers=h).json()
    pairs = [l["pair"] for c in camp["campaigns"] for l in c["links"]]
    assert len(pairs) == len(set(pairs)) == 1
    link = camp["campaigns"][0]["links"][0]
    assert any(e["type"] == "upi_handles" for e in link["exact"])

    net = client.get(f"{API}/network", headers=h).json()
    upi_nodes = [n for n in net["nodes"] if n.get("kind") == "upi"]
    assert len(upi_nodes) == 1 and upi_nodes[0]["case_count"] == 2
    assert upi_nodes[0]["label"].startswith("ev***@")
    # The pair shares an exact indicator, so no inferred (dashed) edge is drawn between them.
    assert not [e for e in net["edges"] if e["basis"] == "inferred"]
    assert all(e["to"].startswith("upi:") or not e["to"].startswith("case:")
               for e in net["edges"] if e["basis"] == "observed")

    rep = client.get(f"{API}/cases/{a}/report", headers=h).json()
    assert rep["assessment"]["risk_level"] == case_a["risk_level"]
    assert rep["assessment"]["risk_score"] == case_a["risk_score"]
    assert len(rep["timeline"]) == len(case_a["events"])
    assert rep["indicators"]["upi_handles_masked"] == ["ev***@ybl"]
    assert [c["case_title"] for c in rep["related_cases"]] == ["Refund QR two"]
    assert "NOT been submitted" in rep["submission_status"]
    assert "not a calibrated probability" in rep["assessment"]["score_label"]


def test_campaigns_are_stable_and_not_duplicated_by_repeat_evidence(client, profile):
    h = profile["headers"]
    a, b = _case(client, h, "A"), _case(client, h, "B")
    msg = "Your KYC has expired and the account will be blocked today. Update at http://eval-kyc-renew.example/form"
    for cid in (a, b):
        assert client.post(f"{API}/cases/{cid}/events", headers=h, json={"kind": "message", "content": msg}).status_code == 200
    first = client.get(f"{API}/campaigns", headers=h).json()
    # Re-submitting identical evidence and re-reading must not add campaigns, links or alerts.
    for cid in (a, b):
        r = client.post(f"{API}/cases/{cid}/events", headers=h, json={"kind": "message", "content": msg})
        assert r.json()["duplicate_of"] and r.json()["alert"]["notify"] is False
    second = client.get(f"{API}/campaigns", headers=h).json()
    assert [c["id"] for c in first["campaigns"]] == [c["id"] for c in second["campaigns"]]
    assert len(second["campaigns"]) == 1 and len(second["campaigns"][0]["links"]) == 1
    for cid in (a, b):
        log = client.get(f"{API}/cases/{cid}", headers=h).json()["log"]
        assert sum(e["notify"] for e in log) == 1


def test_demo_campaign_reload_replaces_instead_of_duplicating(client, profile):
    h = profile["headers"]
    assert client.post(f"{API}/demo/campaigns", headers=h).status_code == 201
    n1 = len(client.get(f"{API}/cases", headers=h).json())
    c1 = client.get(f"{API}/campaigns", headers=h).json()["campaigns"]
    assert client.post(f"{API}/demo/campaigns", headers=h).status_code == 201
    n2 = len(client.get(f"{API}/cases", headers=h).json())
    c2 = client.get(f"{API}/campaigns", headers=h).json()["campaigns"]
    assert n1 == n2 and len(c1) == len(c2)
    assert all(c["is_demo"] for c in c2)


def test_inferred_edges_only_without_shared_indicators_and_carry_uncertainty(client, profile):
    h = profile["headers"]
    assert client.post(f"{API}/demo/campaigns", headers=h).status_code == 201
    net = client.get(f"{API}/network", headers=h).json()
    shared_by_pair = {}
    for e in net["edges"]:
        if e["basis"] == "observed":
            shared_by_pair.setdefault(e["to"], set()).add(e["from"])
    inferred = [e for e in net["edges"] if e["basis"] == "inferred"]
    for e in inferred:
        assert e["uncertainty"]
        # Organisation names are claims, so they are not "exact" for Campaign Radar; ignore them here.
        non_org = {frozenset((x, y)) for ind, cases in shared_by_pair.items() if not ind.startswith("org:")
                   for x in cases for y in cases if x != y}
        assert frozenset((e["from"], e["to"])) not in non_org
    assert net["stats"]["inferred_edges"] == len(inferred)


def test_weak_single_signal_is_not_overconfident(client, profile):
    h = profile["headers"]
    cid = _case(client, h, "Weak")
    r = client.post(f"{API}/cases/{cid}/events", headers=h,
                    json={"kind": "message", "content": "Please reply urgently, it is important."})
    case = r.json()["case"]
    assert case["risk_level"] != "high"
    rep = client.get(f"{API}/cases/{cid}/report", headers=h).json()
    assert rep["assessment"]["uncertainty"]["level"] in ("low", "medium", "high")
    if case["risk_level"] == "medium":
        assert "single tactic" in " ".join(case["assessment"]["uncertainty"]["reasons"])


def test_link_only_case_discloses_missing_wording(client, profile):
    h = profile["headers"]
    cid = _case(client, h, "Link only")
    r = client.post(f"{API}/cases/{cid}/events", headers=h,
                    json={"kind": "url", "content": "http://axisbank-secure-login.example/netbanking/verify"})
    a = r.json()["case"]["assessment"]
    assert any("Only link addresses" in x for x in a["uncertainty"]["reasons"])


def test_unreadable_screenshot_is_not_stored_and_not_called_safe(client, profile):
    import io
    from PIL import Image
    h = profile["headers"]
    cid = _case(client, h, "Blank screenshot")
    buf = io.BytesIO()
    Image.new("RGB", (400, 200), "white").save(buf, "PNG")
    r = client.post(f"{API}/forensics/screenshot", params={"case_id": cid},
                    headers={**h, "Content-Type": "image/png"}, content=buf.getvalue())
    assert r.status_code == 200
    body = r.json()
    assert body["stored"] is False and body["review_required"] is True
    assert "No assessment" in body["primary_action"] or body["analysis_status"] in ("partial", "unavailable")
    assert client.get(f"{API}/cases/{cid}", headers=h).json()["events"] == []


def test_foreign_profile_cannot_reach_case_through_any_feature(client, profile):
    h = profile["headers"]
    cid = _case(client, h, "Private")
    client.post(f"{API}/upi/check", headers=h, json={"input": SCAM_QR, "context": SCAM_CONTEXT, "case_id": cid})
    other = _other_profile(client)
    assert client.get(f"{API}/cases/{cid}", headers=other).status_code == 404
    assert client.get(f"{API}/cases/{cid}/report", headers=other).status_code == 404
    assert client.get(f"{API}/cases/{cid}/report.md", headers=other).status_code == 404
    assert client.post(f"{API}/upi/check", headers=other,
                       json={"input": SCAM_QR, "context": SCAM_CONTEXT, "case_id": cid}).status_code == 404
    assert client.post(f"{API}/forensics/text", headers=other,
                       json={"text": "hello there", "case_id": cid}).status_code == 404
    assert client.post(f"{API}/cases/{cid}/events", headers=other,
                       json={"kind": "message", "content": "x y z"}).status_code == 404
    mine = _case(client, other, "Mine")
    assert client.post(f"{API}/campaigns/dismissals", headers=other,
                       json={"case_a": mine, "case_b": cid}).status_code == 404
    # The other profile's UPI check must not reveal that the handle exists in someone else's case.
    r = client.post(f"{API}/upi/check", headers=other, json={"input": SCAM_QR, "context": SCAM_CONTEXT})
    assert r.json()["case_matches"] == []
    net = client.get(f"{API}/network", headers=other).json()
    assert all(n.get("case_id") != cid for n in net["nodes"])
    assert not [n for n in net["nodes"] if n.get("kind") == "upi"]
    # And the owner's case did not change.
    assert len(client.get(f"{API}/cases/{cid}", headers=h).json()["events"]) == 1


def test_protected_endpoints_require_a_profile(client):
    for method, path in (("get", "/cases"), ("get", "/network"), ("get", "/campaigns"), ("get", "/overview"),
                         ("get", "/cases/x/report"), ("get", "/cases/x/report.md"), ("get", "/profiles/me/export")):
        assert getattr(client, method)(f"{API}{path}").status_code == 401, path
    r = client.post(f"{API}/upi/check", json={"input": SCAM_QR, "case_id": "x"})
    assert r.status_code == 401


def test_report_markdown_never_contains_raw_secrets_or_identifiers(client, profile):
    h = profile["headers"]
    cid = _case(client, h, "Secrets")
    text = ("Axis Bank: your OTP is 482913. Call 9876543210 or mail help@axis-support.example. "
            "Card 4111 1111 1111 1111. Pay evalsecret.user@okaxis now.")
    assert client.post(f"{API}/cases/{cid}/events", headers=h, json={"kind": "message", "content": text}).status_code == 200
    md = client.get(f"{API}/cases/{cid}/report.md", headers=h).text
    js = str(client.get(f"{API}/cases/{cid}/report", headers=h).json())
    for secret in ("482913", "9876543210", "help@axis-support.example", "4111 1111 1111 1111", "evalsecret.user@okaxis"):
        assert secret not in md and secret not in js, secret
