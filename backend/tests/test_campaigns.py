"""Campaign Radar correlation: exact matches, similarity, unrelated cases, dismissal, extension hook."""
from app.scamdna.campaigns import CaseSummary, correlate, pair_key, relate

KYC_TEXT = "sbi dear customer your kyc is pending and your account will be blocked today update at <link> immediately"


def case(cid, tactics, domains=(), upi=(), orgs=("sbi",), templates=(KYC_TEXT,), paths=(), level="high"):
    return CaseSummary(cid, cid.upper(), False, level, 80, list(tactics),
                       {"domains": list(domains), "upi_handles": list(upi), "upi_handles_masked": ["de***@ybl"] if upi else [],
                        "orgs": list(orgs), "path_patterns": list(paths), "links": []}, list(templates))


KYC_TACTICS = ["kyc_suspension", "credential_link", "authority_impersonation"]


def test_exact_domain_match_is_a_strong_link():
    r = relate(case("a", KYC_TACTICS, domains=["sbi-kyc-update.example"]),
               case("b", KYC_TACTICS, domains=["sbi-kyc-update.example"], templates=["completely different words here about kyc"]))
    assert r["relation"] == "strong"
    assert r["exact"][0]["label"] == "Same domain" and r["exact"][0]["basis"] == "exact"


def test_shared_upi_handle_is_exact_and_masked():
    r = relate(case("a", ["digital_arrest", "payment_diversion"], upi=["h1"], orgs=("rbi",), templates=["one"]),
               case("b", ["digital_arrest", "payment_diversion"], upi=["h1"], orgs=("cbi",), templates=["two"]))
    assert r["relation"] == "strong"
    assert "de***@ybl" in r["exact"][0]["value"]


def test_similar_wording_without_exact_indicator_is_never_strong():
    r = relate(case("a", KYC_TACTICS, domains=["x.example"]), case("b", KYC_TACTICS, domains=["y.example"]))
    assert r is not None and r["relation"] == "likely"
    assert not r["exact"] and "Similarity only" in r["uncertainty"]


def test_similar_but_unrelated_cases_are_not_grouped():
    a = case("a", KYC_TACTICS, domains=["sbi-kyc-update.example"])
    b = case("b", ["reward_lure", "upi_collect"], orgs=("phonepe",),
             templates=["congratulations you have won cashback approve the collect request in your upi app"])
    assert relate(a, b) is None
    assert correlate([a, b])["campaigns"] == []


def test_low_risk_cases_never_form_campaigns():
    benign1 = case("a", [], templates=["# is your otp for login do not share it with anyone"], level="low")
    benign2 = case("b", [], templates=["# is your otp for login do not share it with anyone"], level="low")
    out = correlate([benign1, benign2])
    assert out["campaigns"] == [] and out["cases_excluded_low_risk"] == 2


def test_clusters_explain_membership_and_dismissal_splits_them():
    a = case("a", KYC_TACTICS, domains=["d1.example"])
    b = case("b", KYC_TACTICS, domains=["d1.example"])
    c = case("c", KYC_TACTICS, domains=["d2.example"])
    out = correlate([a, b, c])
    assert len(out["campaigns"]) == 1
    camp = out["campaigns"][0]
    assert set(camp["member_ids"]) == {"a", "b", "c"}
    assert any("d1.example" in x for x in camp["exact_indicators"])
    assert camp["heuristic_indicators"] and "same people" in camp["disclaimer"]

    out = correlate([a, b, c], dismissed={pair_key("a", "c"), pair_key("b", "c")})
    assert set(out["campaigns"][0]["member_ids"]) == {"a", "b"}
    assert len(out["dismissed_links"]) == 2


def test_possible_links_are_listed_but_not_merged():
    a = case("a", ["kyc_suspension", "credential_link"], paths=["/kyc/verify"], templates=["alpha beta gamma delta epsilon zeta"])
    b = case("b", ["kyc_suspension", "credential_link"], paths=["/kyc/verify"], templates=["one two three four five six seven"])
    out = correlate([a, b])
    assert out["campaigns"] == []
    assert out["uncertain_links"] and out["uncertain_links"][0]["relation"] == "possible"


def test_external_indicator_source_hook():
    class Feed:
        name = "test-feed"

        def match(self, indicators):
            return [{"indicator": d, "label": "listed", "source": self.name, "verified": True} for d in indicators["domains"]]

    a = case("a", KYC_TACTICS, domains=["d1.example"])
    b = case("b", KYC_TACTICS, domains=["d1.example"])
    out = correlate([a, b], sources=[Feed()])
    assert out["external_sources"] == ["test-feed"]
    assert out["campaigns"][0]["external_matches"][0]["source"] == "test-feed"
    assert "No verified threat-intelligence feed" in correlate([a, b])["external_note"]
