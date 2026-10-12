"""Evidence report export and Scam Network Graph."""
API = "/api/v1"
KYC = "Dear SBI customer, your KYC is pending and your account will be blocked today. Update at http://sbi-kyc-update.top/verify?id=99"
OTP = "This is SBI support. Share the OTP 482913 now to stop the block. Call +91 98765 43210 or pay to sbi.help@ybl"


def _case(client, h, title, *messages, observed_at=None):
    c = client.post(f"{API}/cases", json={"title": title}, headers=h).json()
    for m in messages:
        body = {"kind": "message", "content": m}
        if observed_at:
            body["observed_at"] = observed_at
        client.post(f"{API}/cases/{c['id']}/events", json=body, headers=h)
    return c["id"]


def test_report_contains_reasoning_and_no_secrets(client, profile):
    h = profile["headers"]
    cid = _case(client, h, "SBI KYC", KYC, OTP)
    r = client.get(f"{API}/cases/{cid}/report", headers=h)
    assert r.status_code == 200
    d = r.json()
    assert "NOT been submitted" in d["submission_status"]
    assert d["assessment"]["risk_level"] == "high" and "probability" in d["assessment"]["score_label"]
    assert [e["seq"] for e in d["timeline"]] == [1, 2]
    assert d["timeline"][0]["received_at"] is None and d["timeline"][0]["received_at_note"] == "Not reported by the user"
    assert "sbi-kyc-update.top" in d["indicators"]["domains"]
    assert d["indicators"]["upi_handles_masked"] == ["sb***@ybl"]
    assert "keyed hashes" in d["indicators"]["phone_numbers"]
    text = r.text
    for secret in ("482913", "98765", "sbi.help@ybl", "id=99"):
        assert secret not in text
    assert len(d["content_sha256"]) == 64 and d["recommendations"]


def test_report_markdown_and_options(client, profile):
    h = profile["headers"]
    cid = _case(client, h, "SBI KYC", KYC)
    md = client.get(f"{API}/cases/{cid}/report.md", headers=h)
    assert md.status_code == 200 and md.headers["content-type"].startswith("text/markdown")
    assert md.text.startswith("# Scam evidence report: SBI KYC") and "NOT been submitted" in md.text
    bare = client.get(f"{API}/cases/{cid}/report?include_excerpts=false&include_related=false", headers=h).json()
    assert bare["timeline"][0]["excerpt"] == "[excerpt omitted by the user]"
    assert all(t["evidence"] == [] for t in bare["tactics"])
    assert bare["related_note"] == "Not included."


def test_report_fingerprint_is_stable_and_demo_is_labelled(client, profile):
    h = profile["headers"]
    client.post(f"{API}/demo/campaigns", headers=h)
    demo = next(c for c in client.get(f"{API}/cases", headers=h).json() if c["is_demo"])
    a = client.get(f"{API}/cases/{demo['id']}/report", headers=h).json()
    b = client.get(f"{API}/cases/{demo['id']}/report", headers=h).json()
    assert a["content_sha256"] == b["content_sha256"]
    assert a["is_demo"] and "DEMO DATA" in a["demo_notice"]
    assert all(e["source"].startswith("DEMO DATA") for e in a["timeline"])
    assert "**DEMO DATA**" in client.get(f"{API}/cases/{demo['id']}/report.md", headers=h).text


def test_report_requires_owner(client, profile):
    cid = _case(client, profile["headers"], "x", KYC)
    assert client.get(f"{API}/cases/{cid}/report").status_code == 401
    other = client.post(f"{API}/profiles", json={"display_name": "B"}).json()
    assert client.get(f"{API}/cases/{cid}/report", headers={"Authorization": f"Bearer {other['token']}"}).status_code == 404


def test_network_links_cases_through_shared_observed_indicators(client, profile):
    h = profile["headers"]
    a = _case(client, h, "A", KYC)
    b = _case(client, h, "B", "SBI alert: KYC expired, account blocked. Verify now at http://sbi-kyc-update.top/login")
    _case(client, h, "Unrelated", "Lunch at 1?")
    g = client.get(f"{API}/network", headers=h).json()
    ids = {n["id"] for n in g["nodes"]}
    assert {f"case:{a}", f"case:{b}"} <= ids
    dom = next(n for n in g["nodes"] if n["id"] == "domain:sbi-kyc-update.top")
    assert dom["case_count"] == 2 and dom["kind_label"] == "Domain"
    observed = [e for e in g["edges"] if e["to"] == dom["id"]]
    assert {e["from"] for e in observed} == {f"case:{a}", f"case:{b}"} and all(e["basis"] == "observed" for e in observed)
    # Pairs already linked by an exact indicator do not get a second, inferred edge.
    assert not any(e["basis"] == "inferred" and {e["from"], e["to"]} == {f"case:{a}", f"case:{b}"} for e in g["edges"])
    assert "No external" in g["source"]
    shared = client.get(f"{API}/network?shared_only=true", headers=h).json()
    assert all(n["case_count"] >= 2 for n in shared["nodes"] if n["type"] == "indicator")
    assert all(n["label"] != "Unrelated" for n in shared["nodes"])


def test_network_phone_and_upi_are_never_shown_raw(client, profile):
    h = profile["headers"]
    _case(client, h, "A", OTP)
    _case(client, h, "B", "SBI support here, share your OTP, call +91 98765 43210 and pay to sbi.help@ybl today")
    g = client.get(f"{API}/network", headers=h)
    assert "98765" not in g.text and "sbi.help@ybl" not in g.text
    kinds = {n["kind"]: n for n in g.json()["nodes"] if n["type"] == "indicator"}
    assert kinds["phone"]["label"].startswith("Phone #") and kinds["phone"]["case_count"] == 2
    assert kinds["upi"]["label"] == "sb***@ybl"


def test_network_inferred_edges_from_demo_campaigns(client, profile):
    h = profile["headers"]
    client.post(f"{API}/demo/campaigns", headers=h)
    g = client.get(f"{API}/network", headers=h).json()
    assert g["stats"]["observed_edges"] > 0
    for e in g["edges"]:
        assert e["basis"] in ("observed", "inferred")
        if e["basis"] == "inferred":
            assert e["uncertainty"] and e["from"].startswith("case:") and e["to"].startswith("case:")
    assert all(n["is_demo"] for n in g["nodes"] if n["type"] == "case")


def test_network_empty_profile(client, profile):
    g = client.get(f"{API}/network", headers=profile["headers"]).json()
    assert g["nodes"] == [] and g["edges"] == [] and g["stats"]["cases"] == 0
