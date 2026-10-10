"""Builds paper/SafeCircle-Guardian-Paper.docx from the measured results in evaluation/results/metrics.json."""
import json
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
M = json.loads((ROOT / "evaluation/results/metrics.json").read_text())
msg, url = M["messages"], M["urls"]
pct = lambda x: f"{x * 100:.1f}%"

doc = Document()
st = doc.styles["Normal"]
st.font.name = "Calibri"
st.font.size = Pt(11)
for s in ("Heading 1", "Heading 2", "Title"):
    doc.styles[s].font.name = "Cambria"

def P(text, bold=False, italic=False, align=None, size=None):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold, r.italic = bold, italic
    if size:
        r.font.size = Pt(size)
    if align:
        p.alignment = align
    return p

def table(header, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Light Grid Accent 1"
    for i, h in enumerate(header):
        t.rows[0].cells[i].text = h
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = str(v)
    doc.add_paragraph()
    return t

def caption(text):
    P(text, italic=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)

doc.add_heading("SafeCircle Guardian: Explainable, Privacy-Preserving Scam and Phishing Detection with Consent-Based Trusted Contacts", 0)
P("SafeCircle Guardian team · HackBriven 2026, Cybersecurity & Digital Trust track · October 2026", italic=True)

h = msg["hybrid@30"]
doc.add_heading("Abstract", 1)
P("Online fraud increasingly exploits human judgement rather than software flaws: messages create urgency, impersonate trusted "
  "organisations, request one-time passwords, demand payment and ask for secrecy. We present SafeCircle Guardian, an open-source "
  "system that analyses user-submitted messages and links, explains the specific social-engineering tactics it finds, recommends "
  "safe actions, and lets users ask a trusted contact for a second opinion under two-sided, revocable consent. The detector combines "
  "15 interpretable tactic rules with negation handling, 21 static (non-fetching) URL signals, and two lightweight local models, "
  "and runs on a CPU in about one millisecond with no external AI service. On a held-out split of the SMS Spam Collection "
  f"(n = {h['n']}), the hybrid detector reaches precision {h['precision']:.3f}, recall {h['recall']:.3f}, F1 {h['f1']:.3f} at a "
  f"false-positive rate of {pct(h['false_positive_rate'])}. On {url['n_per_class']:,} reported phishing URLs versus "
  f"{url['n_per_class']:,} popular hostnames, static URL analysis reaches F1 {url['full_url']['f1']:.3f} "
  f"(recall {url['full_url']['recall']:.3f}, false-positive rate {pct(url['full_url']['false_positive_rate'])}). We report the "
  "datasets' limits, a threat model, and the places where our evaluation was not fully blind.")

doc.add_heading("1. Introduction", 1)
P("The US Federal Trade Commission received 3 million fraud reports in 2025 with $15.9 billion in reported losses [1], and the FBI's "
  "Internet Crime Complaint Center received 1,008,597 complaints describing nearly $21 billion in losses [2]. Many of these "
  "frauds begin with a message: a fake bank 'KYC' warning, a parcel 'redelivery fee', a 'Hi Mum, this is my new number' text, or a "
  "call to install remote-access software. Classic spam filters answer 'spam or not', but a person deciding whether to share a code "
  "needs to know why a message is dangerous and what to do next, and often wants to ask someone they trust.")
P("Mobile platforms also limit what third-party apps can see: Google Play restricts SMS and Call Log permissions to default handler "
  "apps [14], and iOS offers message filtering through a dedicated extension point rather than inbox access [15]. A practical "
  "assistant must therefore work on content the user chooses to submit and must not over-claim monitoring abilities.")
P("Contributions: (1) an explainable hybrid detector that maps text to named persuasion tactics with evidence spans and safety-advice "
  "negation; (2) a static URL analyser with brand-impersonation, typosquatting and a hostname model, evaluated with and without a "
  "path-bias control; (3) a consent-based trusted-contact protocol with signed, minimal alerts; (4) an open, reproducible "
  "evaluation with honest limitations.")

doc.add_heading("2. Related work", 1)
P("Social engineering and persuasion. Stajano and Wilson derived seven principles of scam victimisation, including distraction, "
  "social compliance, herd, dishonesty, kindness, need and greed, and time pressure [3]. Cialdini's principles of influence [4] were "
  "applied to phishing by Ferreira et al. [5]. Our tactic categories (urgency, authority impersonation, secrecy, reward, threat) "
  "operationalise these ideas as detectable, explainable signals.")
P("Message filtering. Almeida et al. introduced the SMS Spam Collection and benchmarked classical classifiers [6, 7]; linear models "
  "over bag-of-words features remain strong baselines. Malicious URL detection. Ma et al. showed that lexical and host features of "
  "URLs can detect malicious sites without blacklists [8]; Sahingoz et al. used NLP features of URLs [9]; URLNet learned character- and "
  "word-level URL representations [10]. Explainability. Post-hoc methods such as LIME [11] explain black-box models; we instead use "
  "inherently interpretable rules and linear models whose per-feature contributions are shown to the user. LLM risks. Indirect "
  "prompt injection lets attacker-controlled content steer LLM-integrated applications [12, 18]; we keep any LLM out of the scoring path.")

doc.add_heading("3. Research questions", 1)
for q in ["RQ1. How does an explainable hybrid (rules + linear model) detector compare with rules-only and model-only baselines on "
          "held-out messages?",
          "RQ2. How well does static, non-fetching URL analysis detect phishing URLs, and what does a lightweight hostname model add?",
          "RQ3. Is the detector fast enough for interactive use on commodity CPUs?",
          "RQ4. Can a trusted-contact workflow guarantee two-sided consent, user-initiated alerts and data minimisation, verified by tests?"]:
    doc.add_paragraph(q, style="List Bullet")

doc.add_heading("4. System and methodology", 1)
doc.add_heading("4.1 Architecture", 2)
P("A FastAPI service hosts the detector and the consent workflow and serves a statically exported Next.js dashboard; a Manifest V3 "
  "browser extension submits links or selected text on explicit user action. PostgreSQL (SQLite for development) stores only opt-in "
  "data. Figure 1 shows a real analysis result.")
doc.add_picture(str(ROOT / "slides/img/result.png"), width=Inches(5.8))
caption("Figure 1. Analysis of an author-written bank KYC scam example: score, highlighted evidence and per-tactic explanations.")
doc.add_heading("4.2 Detector", 2)
P("Normalisation applies NFKC, lower-casing, zero-width removal and folding of 47 Cyrillic/Greek confusable letters (cf. Unicode "
  "UTS #39 [19]) while keeping a map back to original offsets. Fifteen regular-expression rules plus two obfuscation checks assign "
  "evidence to 12 tactic categories with expert-set weights (e.g., OTP request 0.55, remote access 0.50, impersonation 0.12). Requests "
  "for OTPs, credentials or secrecy that are preceded by negations ('never share your OTP') are suppressed. Eight tactic "
  "combinations add bonuses. Category weights combine by noisy-OR, r = 1 − Π(1 − wᵢ).")
P("Links are extracted (including bare and defanged domains) and analysed without network access using 21 static signals: raw IP, "
  "'@' userinfo trick, punycode, confusable characters, shorteners, free hosting, abused TLDs, deep subdomains, hyphenated or "
  "digit-heavy domains, unusual ports, plain http, length, brand names on non-brand registered domains (via the public-suffix list), "
  "typosquatting (digit folding plus edit distance 1), sensitive path words, risky downloads and embedded redirects. A hostname "
  "character 3–5-gram logistic regression adds a signal of weight 0.4·p when p ≥ 0.8. A TF-IDF (word 1–2-gram) logistic regression "
  "[13] scores the message text. The final score is 1 − (1 − r_rules)(1 − r_url)(1 − 0.6·p_ml), shown as 0–100, with ≥ 30 "
  "'suspicious' and ≥ 60 'high risk'.")
doc.add_heading("4.3 Trusted-contact protocol", 2)
P("A user creates an anonymous profile (display name only; a 256-bit bearer token of which only the SHA-256 is stored). Adding a "
  "contact returns a one-time link whose token sits in the URL fragment so it is never sent to servers or in Referer headers. The "
  "contact sees what they will and will not receive and accepts or declines; invites expire after 72 hours. Alerts reach only active "
  "contacts, only when the user sends them, and carry the risk level, tactic codes, an optional note and, if ticked, a redacted "
  "excerpt. To avoid storing analyses, the server returns an HMAC-SHA256 'alert ticket' bound to the profile and valid for 60 minutes; "
  "alerts are built only from verified tickets. Either side can end the link; all decisions are logged append-only.")
doc.add_heading("4.4 Data and protocol", 2)
table(["Use", "Source (licence)", "Size"], [
    ["Message train / test", "SMS Spam Collection [7] (CC BY 4.0), stratified 80/20, seed 42", "4,459 / 1,115 (747 spam overall)"],
    ["Phishing URLs test / dev", "Phishing.Database [16] (MIT), disjoint random samples, snapshot 2026-10-10", "5,000 / 20,000"],
    ["Benign hosts test / dev", "Cisco Umbrella top-1M [17], disjoint uniform samples, snapshot 2026-10-10", "5,000 / 20,000"],
])
caption("Table 1. Datasets.")
P("Thresholds (30/60) and the message-model weight (0.6) were fixed before the first evaluation. The message model's C was chosen by "
  "5-fold cross-validation on the training split; the hostname-model weight and gate were chosen on a validation split of the dev "
  "data. Because benign hosts have no paths, we also evaluate phishing URLs reduced to their hostnames. Disclosure: after a first "
  "evaluation run we inspected test-set error examples and aggregate signal counts and then revised several URL heuristics and two "
  "message rules (checked on dev data and author-written scenarios). The final test numbers are therefore not fully blind; the "
  "first-run numbers are reported in Section 6.")

doc.add_heading("5. Threat model (summary)", 1)
table(["Threat", "Mitigation"], [
    ["False negatives (novel wording, other languages)", "Three independent signal families; advice shown at all levels; honest recall reporting"],
    ["False positives", "Negation handling; low brand-mention weight; official brand-domain lists; two thresholds"],
    ["Obfuscation (zero-width, look-alikes, defanged links)", "Normalisation, confusable folding, obfuscation signal"],
    ["Prompt injection against optional LLM", "LLM never scores; redacted, delimited input; output labelled; injection phrases raise risk"],
    ["Malicious URLs (SSRF, drive-by)", "Links never fetched or resolved"],
    ["Data leakage", "No storage by default; opt-in redacted excerpts; content-free logs"],
    ["Unauthorised alerts / forged alerts", "Two-sided consent, rate limits, contact cap, HMAC-signed tickets"],
    ["Token theft, IDOR, abuse", "Hashed tokens, fragment-only links, scoped queries, per-IP limits, body-size limit"],
])

doc.add_heading("6. Evaluation", 1)
doc.add_heading("6.1 RQ1: messages", 2)
rows = []
for k, name in (("rules_only@30", "Rules only (≥ 30)"), ("ml_only@0.5", "Model only (p ≥ 0.5)"),
                ("hybrid@30", "Hybrid (≥ 30)"), ("hybrid@60", "Hybrid (≥ 60)")):
    m = msg[k]; c = m["confusion_matrix"]
    rows.append([name, f"{m['precision']:.3f}", f"{m['recall']:.3f}", f"{m['f1']:.3f}", pct(m["false_positive_rate"]),
                 f"{c['tp']}/{c['fp']}/{c['tn']}/{c['fn']}"])
table(["Detector", "Precision", "Recall", "F1", "FPR", "TP/FP/TN/FN"], rows)
caption(f"Table 2. Held-out SMS test split (n = {msg['hybrid@30']['n']}; {msg['hybrid@30']['positives']} spam).")
P("Rules alone recall only 20% of SMS spam, as expected: most of this 2011 corpus is marketing and premium-rate spam rather than "
  "social engineering. The hybrid matches the model's recall with slightly lower precision (F1 0.950 vs 0.959) while adding "
  "tactic-level evidence. At the 'high risk' threshold the hybrid produced no false positives on this split.")
doc.add_picture(str(ROOT / "evaluation/results/cm_messages_hybrid.png"), width=Inches(2.8))
caption("Figure 2. Confusion matrix, hybrid detector at score ≥ 30.")

doc.add_heading("6.2 RQ2: URLs", 2)
rows = []
for k, name in (("full_url_heuristics_only", "Heuristics, full URL"), ("hostname_only_heuristics_only", "Heuristics, hostname only"),
                ("full_url", "Heuristics + hostname model, full URL"), ("hostname_only", "Heuristics + hostname model, hostname only")):
    m = url[k]
    rows.append([name, f"{m['precision']:.3f}", f"{m['recall']:.3f}", f"{m['f1']:.3f}", pct(m["false_positive_rate"])])
table(["Detector / view", "Precision", "Recall", "F1", "FPR"], rows)
caption(f"Table 3. {url['n_per_class']:,} phishing URLs vs {url['n_per_class']:,} benign hostnames.")
P("Static heuristics are precise but miss most phishing URLs, many of which sit on free hosting or compromised legitimate sites. The "
  "hostname model triples recall at a modest false-positive cost. Removing paths changes results little (F1 0.761 to 0.742), "
  "suggesting the gain is not an artefact of path bias. Before the revisions disclosed in Section 4.4, heuristics alone scored "
  "precision 0.739, recall 0.213 and FPR 7.5%, and the message hybrid scored precision 0.940, recall 0.953 and FPR 0.93%.")
doc.add_heading("6.3 RQ3: latency", 2)
lm, lu = msg["latency_hybrid"], url["full_url"]["latency"]
P(f"In-process on a 4-core x86_64 container (Python 3.13): message analysis p50 {lm['p50_ms']} ms, p95 {lm['p95_ms']} ms "
  f"(n = {lm['n']}); URL analysis p50 {lu['p50_ms']} ms, p95 {lu['p95_ms']} ms (n = {lu['n']:,}). An HTTP round trip on localhost "
  "against PostgreSQL measured p50 4.8 ms, p95 6.9 ms (n = 50).")
doc.add_heading("6.4 RQ4: consent workflow", 2)
P("The consent properties are verified by automated tests rather than a user study: alerts to pending, declined or revoked contacts "
  "are rejected; forged or foreign alert tickets are rejected; other profiles cannot read or revoke contacts; contact links stop "
  "working when the user deletes their data; alert and contact limits are enforced. In total, 63 backend tests pass on SQLite and "
  "PostgreSQL 16, and an 18-step browser end-to-end test covers the full journey in Chromium.")

doc.add_heading("7. Limitations", 1)
for t in ["The SMS benchmark is old, UK-centred spam; no public, licensed, modern multilingual scam corpus was reachable for this work.",
          "Benign URLs are popular hostnames, easier than everyday links with paths; real-world false-positive rates may differ.",
          "Test errors were inspected before final revisions (Section 4.4), so the final test results are optimistic.",
          "English only; no OCR for screenshots; no voice-call analysis.",
          "Rules can be learned and evaded by adversaries; the models will drift and need retraining.",
          "No user study of comprehension, trust or behaviour change yet."]:
    doc.add_paragraph(t, style="List Bullet")

doc.add_heading("8. Conclusion and future work", 1)
P("SafeCircle Guardian shows that useful, explainable scam assistance can run cheaply and privately: users see which tactic was used, "
  "where, and what to do, and can involve a trusted person without surrendering their data. Next steps are a licensed, "
  "scam-specific and multilingual (including Hindi and Hinglish) evaluation set, OCR for screenshots, a user study, and native "
  "share-sheet and message-filter integrations within platform rules.")

doc.add_heading("Data and code availability", 1)
P("Source code, trained artifacts, evaluation scripts and raw metrics (evaluation/results/metrics.json) are in the project repository "
  "under the MIT licence; datasets retain their original licences.")

doc.add_heading("References", 1)
refs = [
    "[1] U.S. Federal Trade Commission, “FTC Testifies to Joint Economic Committee on Agency’s Efforts to Combat Fraud,” press release, Mar. 25, 2026. https://www.ftc.gov/news-events/news/press-releases/2026/03/ftc-testifies-joint-economic-committee-agencys-efforts-combat-fraud",
    "[2] Federal Bureau of Investigation, “Cryptocurrency and AI Scams Bilk Americans of Billions” (2025 IC3 Internet Crime Report), press release, Apr. 6, 2026. https://www.fbi.gov/news/press-releases/cryptocurrency-and-ai-scams-bilk-americans-of-billions",
    "[3] F. Stajano and P. Wilson, “Understanding scam victims: seven principles for systems security,” Communications of the ACM, vol. 54, no. 3, pp. 70–75, 2011.",
    "[4] R. B. Cialdini, Influence: The Psychology of Persuasion, rev. ed. New York: Harper Business, 2006.",
    "[5] A. Ferreira, L. Coventry, and G. Lenzini, “Principles of persuasion in social engineering and their use in phishing,” in Human Aspects of Information Security, Privacy, and Trust (HAS 2015), LNCS 9190, Springer, 2015, pp. 36–47.",
    "[6] T. A. Almeida, J. M. Gómez Hidalgo, and A. Yamakami, “Contributions to the study of SMS spam filtering: new collection and results,” in Proc. ACM DocEng, 2011, pp. 259–262.",
    "[7] T. A. Almeida and J. M. Gómez Hidalgo, “SMS Spam Collection,” UCI Machine Learning Repository, 2011. doi:10.24432/C5CC84.",
    "[8] J. Ma, L. K. Saul, S. Savage, and G. M. Voelker, “Beyond blacklists: learning to detect malicious web sites from suspicious URLs,” in Proc. ACM KDD, 2009, pp. 1245–1254.",
    "[9] O. K. Sahingoz, E. Buber, O. Demir, and B. Diri, “Machine learning based phishing detection from URLs,” Expert Systems with Applications, vol. 117, pp. 345–357, 2019.",
    "[10] H. Le, Q. Pham, D. Sahoo, and S. C. H. Hoi, “URLNet: Learning a URL representation with deep learning for malicious URL detection,” arXiv:1802.03162, 2018.",
    "[11] M. T. Ribeiro, S. Singh, and C. Guestrin, “‘Why should I trust you?’: Explaining the predictions of any classifier,” in Proc. ACM KDD, 2016, pp. 1135–1144.",
    "[12] K. Greshake, S. Abdelnabi, S. Mishra, C. Endres, T. Holz, and M. Fritz, “Not what you’ve signed up for: Compromising real-world LLM-integrated applications with indirect prompt injection,” in Proc. ACM AISec, 2023. arXiv:2302.12173.",
    "[13] F. Pedregosa et al., “Scikit-learn: Machine learning in Python,” Journal of Machine Learning Research, vol. 12, pp. 2825–2830, 2011.",
    "[14] Google, “Use of SMS or Call Log permission groups,” Play Console Help. https://support.google.com/googleplay/android-developer/answer/10208820 (accessed Oct. 10, 2026).",
    "[15] Apple, “SMS and MMS Message Filtering,” Apple Developer Documentation. https://developer.apple.com/documentation/identitylookup/sms-and-mms-message-filtering (accessed Oct. 10, 2026).",
    "[16] M. Krog, N. Chababy, et al., “Phishing.Database,” GitHub repository, MIT License. https://github.com/mitchellkrogza/Phishing.Database (snapshot Oct. 10, 2026).",
    "[17] Cisco Umbrella, “Umbrella Popularity List (top 1 million),” http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip (downloaded Oct. 10, 2026).",
    "[18] OWASP Foundation, “OWASP Top 10 for Large Language Model Applications,” LLM01: Prompt Injection, 2025. https://genai.owasp.org/",
    "[19] Unicode Consortium, “Unicode Technical Standard #39: Unicode Security Mechanisms.” https://www.unicode.org/reports/tr39/",
]
for r in refs:
    p = doc.add_paragraph(r)
    p.paragraph_format.space_after = Pt(4)
    for run in p.runs:
        run.font.size = Pt(9.5)

out = ROOT / "paper/SafeCircle-Guardian-Paper.docx"
doc.save(out)
print("wrote", out)
