# Scam DNA, Forensics, Campaign Radar and Guardian Shield

Problem Statement 02 (AI-driven scam pattern recognition): *detect emerging AI-enabled scam workflows in UPI,
banking or wallet contexts and deliver timely, useful alerts without creating alert fatigue.*

SafeCircle's answer: **detect how a financial scam unfolds across multiple events, explain its evidence, warn
at the right moment, and identify potentially related scam campaigns.**

## How the four features connect

```
 messages · chats · links · screenshots                         browser: links, selected text
          │                                                               │
          ▼                                                               ▼
 ┌──────────────── Forensics ────────────────┐                ┌── Guardian Shield (MV3) ──┐
 │ validate → preserve (hash) → OCR (local)   │                │ context menu · popup ·    │
 │ → redact → tactic detection → link checks  │                │ optional link guard       │
 └──────────────┬─────────────────────────────┘                └────────────┬──────────────┘
                │ "add findings to case"                                    │ /analyze/url, /analyze/message
                ▼                                                           ▼
 ┌──────────────── Scam DNA case ──────────────────────────────────────────────────────────┐
 │ events (redacted) → per-event tactics → case assessment: stages, attack chain,          │
 │ observed vs inferred, risk components, uncertainty, conflicts, gaps, recommendations    │
 │ → change explanation → alert decision (new / escalated / updated / suppressed)          │
 └──────────────┬──────────────────────────────────────────────────────────────────────────┘
                │ indicators (domains, links, path patterns, hashed UPI handles and phones, orgs, wording)
                ▼
 ┌──────────────── Campaign Radar ──────────────┐        ┌──────── Overview ────────┐
 │ exact matches + transparent similarity →      │  ───▶ │ metrics computed from    │
 │ clusters, uncertain links, user dismissals    │        │ your own cases; DEMO     │
 └───────────────────────────────────────────────┘        │ counts labelled          │
                                                           └──────────────────────────┘
```

## Detection architecture (backend/app/scamdna)

| Module | Responsibility | Notes |
|---|---|---|
| `tactics.py` | Financial tactic taxonomy (19 tactics in 5 victim-facing stages + evasion), per-event detection | Reuses the unchanged base detector (`app/detector`) and adds rules for UPI collect / PIN-to-receive, QR-to-receive, payment diversion, "safe account", digital arrest, KYC expiry. Safety advice with no request halves weights; negation is sentence-scoped. |
| `evidence.py` | Redaction and indicators | Removes OTPs/PINs/passwords near secret words, card/account/phone numbers, e-mails; strips query strings from links; UPI handles and phones become keyed HMAC hashes. |
| `assessment.py` | Case-level analysis | Ordering (reported time vs submission order), attack chain graph, risk components (tactics + cross-event combinations + stage bonus, noisy-OR), uncertainty, review, conflicts, missing evidence, stage-aware recommendations, change explanation, fingerprint. |
| `alerts.py` | Alert de-duplication | new · escalated · updated · deescalated · suppressed · none. |
| `campaigns.py` | Correlation | Exact indicators vs heuristic similarity; union-find clusters; uncertain links kept separate; `IndicatorSource` hook for a verified feed later. |
| `ocr.py` | Upload safety + local OCR | MIME allow-list, magic bytes, header dimension cap, re-encode in memory (drops EXIF), Tesseract via stdin with timeout. |
| `demo.py` | DEMO DATA fixtures | Five walkthrough scenarios + ten campaign cases, each with expected outcomes. |

The separate quantities are kept separate in every response:

- **Signal severity**: per tactic, expert-set weight (× link score for link tactics, × 0.5 when discounted).
- **Risk score**: heuristic 0-100 from a noisy-OR of components; labelled *"not a calibrated probability of fraud"*.
- **Model signal**: the SMS spam model's similarity; shown, never added to the score.
- **Data quality**: good / limited / poor (short text, link only, OCR confidence).
- **Uncertainty and review**: reasons listed; review when evidence conflicts, uncertainty is high, or evidence is unreadable.

Thresholds are settings (`SAFECIRCLE_CASE_MEDIUM_THRESHOLD=30`, `SAFECIRCLE_CASE_HIGH_THRESHOLD=60`).

### Observed vs inferred

- Event nodes and evidence edges are **observed**: they point to text or links the user submitted.
- Sequence edges are observed only when the user gave a received time for every event; otherwise they are labelled
  *order added (unconfirmed)*. No timestamp is ever invented.
- Stage-progression edges (e.g. Pressure → Harvest) and the *repeated indicator* tactic are **inferred** and drawn dashed.

### Alert fatigue

1. Identical evidence resubmitted to a case is not re-analysed; the decision is logged as suppressed.
2. A reassessment alerts only if the level rose, or a new tactic with weight ≥ 0.45 appeared. Everything else is
   logged as suppressed, so the audit trail shows what was held back and why.
3. The spam-model similarity alone never raises an alert.
4. Low-risk cases never join campaigns, so genuine notifications cannot cluster.

## API (all under `/api/v1`, 🔒 = profile token)

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/cases` 🔒 | List / start investigations |
| GET/PATCH/DELETE | `/cases/{id}` 🔒 | Case detail (events, assessment, last change, audit log) / rename or set status / delete |
| POST | `/cases/{id}/events` 🔒 | Add a message or link (`kind`, `content`, `channel`, optional `observed_at` with timezone); returns event, alert decision, change explanation and the updated case |
| DELETE | `/cases/{id}/events/{event_id}` 🔒 | Remove evidence and re-evaluate |
| POST | `/forensics/text` | Message or "Name: message" conversation; optional `case_id` 🔒 |
| POST | `/forensics/url` | Link, inspected as text; optional `case_id` 🔒 |
| POST | `/forensics/screenshot?case_id=&channel=` | Raw PNG/JPEG/WebP body (≤ 5 MB); local OCR |
| GET | `/campaigns` 🔒 | Clusters, uncertain links, dismissed links, method |
| POST/DELETE | `/campaigns/dismissals` 🔒 | Mark two cases as not related / restore |
| GET | `/overview` 🔒 | Metrics from your own cases, demo counts split out, recent decisions |
| GET | `/demo/scenarios` | DEMO DATA scenarios with expected outcomes |
| POST | `/demo/scenarios/{key}/cases` 🔒 | Start an empty DEMO case for a scenario |
| GET | `/demo/scenarios/{key}/check/{case_id}` 🔒 | Compare the live result with the fixture expectation |
| POST | `/demo/campaigns` 🔒 | Load the DEMO campaign cases (replaces earlier ones) |
| DELETE | `/demo/cases` 🔒 | Remove all DEMO cases |

The existing `/analyze/*`, profile, history, contact and guardian endpoints are unchanged.

## Database migration

`backend/alembic/versions/a336d9eb6fd1_scam_dna_cases_events_log_campaign_.py` (additive, reversible):
`scam_cases`, `case_events`, `case_log` (append-only audit), `campaign_dismissals`. All cascade-delete with the
profile; cases follow the profile's retention setting and appear in the data export.

```bash
cd backend && alembic upgrade head      # downgrade: alembic downgrade 3d5f40249472
```

## Guardian Shield (extension/)

- Context menu checks for links and selected text; the toolbar popup checks the current tab and shows server status.
- Link results show evidence and a warning page with **Go back (recommended)** and **Open anyway**. High risk needs a
  ticked acknowledgement first. Only `http(s)` links without hidden credentials can be opened.
- Optional **link guard** (off by default): after the user grants site access in Options, a content script sees only
  the address of a link the user clicks to another site. Risky links are replaced by the warning page; results are
  cached in memory for 10 minutes so a link is not re-sent. Same-site, local and SafeCircle-server links are never sent.
- Every result says whether it came from a completed analysis. Timeouts (configurable, default 8 s), unreachable
  servers, rate limits and malformed responses are shown as **Not checked**, never as safe. When the server is down
  the link guard lets navigation continue and the toolbar shows "?" with the reason.
- Permissions: `contextMenus`, `storage`, `activeTab`, `scripting`; `http(s)://*/*` only as an optional host permission
  requested and removed with the link-guard switch. No history, form contents, credentials, OTPs or payment details
  are read. The extension never fills forms, approves payments or enters credentials.

Browser limits: branded Chrome (137+) ignores `--load-extension`, so automated tests run the extension's pages with a
stubbed `chrome.*` API (`e2e/extension-pages.mjs`) and its worker logic in Node (`extension/tests/`). Loading the
unpacked extension and the link guard were not exercised in a real extension runtime by automation; see the manual
check below. The link guard cannot intercept navigation that pages start from script, typed addresses, or links
opened with modifier keys or middle-click; those are left to the browser.

## Judge demo (90 seconds)

Prerequisites: server running with the built site (see README), Tesseract installed, extension loaded unpacked.

| Time | Do | Say |
|---|---|---|
| 0:00 | Open http://127.0.0.1:8000, scroll to Overview | "Problem 02: scams unfold across several events. These numbers come from cases in this profile; demo cases are labelled." |
| 0:10 | Scam DNA → Play *Benign bank debit notification* → Add step 1 | "A genuine debit alert: low risk, and the fixture check confirms the live engine agrees." |
| 0:20 | Back → Play *Multi-stage bank impersonation* → add steps 1 to 4 | "Each message re-evaluates the case: 45 → 82 → 94 → 99. The chain grows from Approach to Extraction." |
| 0:40 | Read *What changed*; click the OTP node | "Every jump is explained. Solid lines are evidence, dashed are inferred. No timestamps are invented." |
| 0:50 | Forensics → *Demo screenshot* → add to the case → Investigate | "OCR runs locally with Tesseract; the image is never stored, only its hash and redacted text." |
| 1:05 | Right-click a look-alike link → *Check this link with SafeCircle* | "Guardian Shield warns before navigation, with a clear way back and an explicit override." |
| 1:15 | Campaign Radar → *Load demo campaign cases* | "Cases sharing a domain or UPI handle are grouped; similarity-only links are marked; I can dismiss any link." |
| 1:25 | Back in the case, *Resubmit step 1 unchanged* | "Same evidence, no new alert: suppressed and logged. That is how we avoid alert fatigue." |

## Simulated or dependent on external data

- All scenario and campaign data is synthetic DEMO DATA. The overview counts are real counts of local cases, which
  during a demo are mostly those demo cases (labelled as such).
- The hero globe remains a labelled DEMO DATA visual; no live geographic feed exists.
- No threat-intelligence feed is connected; Campaign Radar compares only your own cases.
- No bank, UPI or wallet integration exists. SafeCircle sees only what the user submits.
