# UPI Scam Guard, Evidence Report and Scam Network

Three features added on top of Scam DNA, Forensics, Campaign Radar and Guardian Shield. They reuse the existing
tactic rules, redaction, case storage and correlation engine. No new tables, migrations or dependencies were
needed.

## Feature-gap assessment (October 2026)

| Candidate | What already existed | Decision |
|---|---|---|
| A. UPI Scam Guard | UPI rules in `scamdna/tactics.py` (collect requests, PIN-to-receive, pay-to-handle); handles masked and keyed-hashed; Campaign Radar matches shared handles | **Built.** It was missing a way to check a UPI ID or payment QR *before* paying |
| B. Scam Network Graph | Campaign Radar computes pairwise links and stores indicators per case | **Built** as a view over the same data, with no second correlation engine |
| C. One-click evidence report | Profile export (raw JSON); no per-case report | **Built** |
| D. AI voice analyzer | Nothing | **Not built.** Audio needs a speech-to-text model (a large local one such as Whisper, or a paid API). A transcript-only version would repeat the existing message scanner |
| E. Adaptive risk engine | Already done: reassessment on every new piece of evidence, "what changed", conflicts, missing evidence, review state, fingerprint-based alert suppression (`assessment.py`, `alerts.py`) | **Not rebuilt** |

## A. UPI Scam Guard (`/upi/`, `POST /api/v1/upi/check`)

Input: a UPI ID (`name@bank`) or a `upi://pay?...` link, plus the message that came with it (optional). A QR image
is decoded **in the browser** with the `BarcodeDetector` API, and the image never leaves the device. Browsers without
QR support get a clear message asking for the link text. With `case_id`, the request is added to a Scam DNA case as
redacted evidence on the `upi_app` channel, and the case is reassessed with the usual alert de-duplication.

Signals, each labelled with its basis:

| Signal | Basis | Tactic it feeds |
|---|---|---|
| Pre-filled amount: opening the link asks you to pay ₹X | observed | (information) |
| Told you will receive money (refund, cashback, prize…) but the link is a payment | observed | `upi_collect` |
| Payee name or handle presented as a refund or reward | observed | `reward_lure` |
| Payee name or handle presented as KYC, verification or a fine | observed | `kyc_suspension` |
| Payee name names a bank or agency the handle doesn't carry, or a handle such as `hdfc.customer.care@…` | heuristic | `authority_impersonation` |
| Link type other than `upi://pay` | heuristic | (information) |
| Handle suffix not in SafeCircle's list | heuristic | (information only, never scored) |
| The same UPI ID is in one of *your* medium/high-risk cases | your_cases | `repeated_indicator` |

The note and message also go through the full Scam DNA tactic rules. The score is the same heuristic indicator as
everywhere else (see [scam-dna.md](scam-dna.md)), not a probability. Verdicts are "Strong warning signs. Do not
pay.", "Warning signs found…" or "No warning signs found… This does not confirm the payee is genuine."

**It cannot** see who owns a handle, query a bank, NPCI or any fraud database, or see, block or approve a payment.
The response says this in `limitations`. Case matching only runs for a signed-in profile and only over that
profile's cases.

## C. Evidence report (`/cases/report/?id=…`, `GET /cases/{id}/report`, `GET /cases/{id}/report.md`)

Built only from what the case stores, so it never contains OTPs, PINs, passwords, card or account numbers, phone
numbers, e-mail addresses or screenshot images. It contains:

- the assessment with its weighted components, uncertainty, review reasons, conflicts and missing evidence
- the tactics with their evidence excerpts
- a timeline per piece of evidence: the time it was received (or "Not reported by the user"), the time it was
  added, its source (DEMO DATA or user), its SHA-256, screenshot facts and link signals
- indicators (domains, links, masked UPI IDs, a count of hashed phone numbers, claimed organisations)
- related cases from Campaign Radar with exact and similarity evidence and their uncertainty
- the alert decisions, recommendations and how to report (cybercrime.gov.in, 1930)
- a SHA-256 fingerprint of the report contents (stable across exports of an unchanged case)

The user can leave out excerpts and related cases. Export (print or save as PDF, Markdown, JSON) stays disabled
until the user ticks "I have reviewed this report…". Every format states that the report **has not been submitted**
to any authority. Nothing is sent anywhere: the files are created in the browser.

## B. Scam Network Graph (`/network/`, `GET /api/v1/network?shared_only=`)

Nodes are cases and indicators (domain, shortened link, UPI handle, phone, claimed organisation). There are two
edge types, and they are never mixed:

- **observed** (solid): case → indicator, meaning the indicator was extracted from that case's own evidence.
- **inferred** (dashed): case ↔ case from Campaign Radar similarity (wording, link path, tactic overlap). These are
  drawn only when the pair shares no exact indicator, and they carry Campaign Radar's uncertainty text.

Phone numbers appear only as "Phone #n" because they exist only as keyed hashes. UPI IDs are shown masked. When
an event holds several handles the masked form is ambiguous and is labelled as such. Pairs the user dismissed in
Campaign Radar get no inferred edge. The layout is a small deterministic force simulation in the browser; nodes
are keyboard-focusable, and a list of shared indicators sits below the graph for small screens and screen readers.

## Tests

- `backend/tests/test_upi_guard.py` (22): parsing, 10 malformed inputs, pay-to-receive, merchant and bank-named
  handles, unlisted suffixes, anonymous vs profile case matching, attaching to a case, duplicate suppression, ownership.
- `backend/tests/test_report_network.py` (8): report content and no secrets, Markdown, options, stable fingerprint,
  DEMO labelling, ownership; graph observed edges, shared-only filter, phone/UPI never shown raw, inferred edges, empty profile.
- `e2e/advanced.mjs` (30 browser checks): QR decoding in the browser, high/low/malformed UPI checks, network graph
  interactions and filters, attaching a UPI check to a case, report review gating, Markdown/JSON downloads,
  print view, and no horizontal scroll at 390 px.

These are automated tests on synthetic inputs. They show the features behave as designed. They are not a
measurement of real-world detection accuracy.
