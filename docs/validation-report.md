# Independent validation and demo readiness (2026-10-12)

Branch `validation`, created from `advanced-features` at `5ff0919`. No product feature was added and no detection
rule was changed. Nothing was pushed or deployed. `backend/safecircle.db` was not opened: every run used a
temporary database (its last-modified time is still 09:21, before this work began).

## 1. Repository state checked first

- `advanced-features` was clean, 4 commits ahead of the restore tag `checkpoint/pre-advanced-features`, which
  points to `ae7c783` (the end of the PS02 upgrade). There were no uncommitted user changes.
- There is no `main` branch. The default branch is `master` (`5d699d0`).
- A `next dev` server (PID 5147) was running on :3000 from `frontend/`. It was left alone, and the production
  build was made in a scratch copy, so `frontend/.next` and `frontend/out` were not touched. **`frontend/out` is
  still stale**: it does not contain the advanced-feature pages until it is rebuilt with the dev server stopped.

## 2. Independent evaluation set

`evaluation/holdout_v2/`: 65 synthetic DEMO DATA scenarios (24 scam, 27 benign, 9 ambiguous, 5 integration-only),
83 pieces of evidence, covering every category asked for. Labels and acceptable outcomes were written and committed
with a checksum **before the first run**. Method, leakage analysis and every error are in
[evaluation/holdout_v2/README.md](../evaluation/holdout_v2/README.md).

**Leakage disclosed.** The earlier 30-scenario v1 set's post-fix result (P 0.944 / R 0.944 / FPR 0.083) is *not*
independent, because four rule fixes were made from its errors. v2 was written without reading the rule regexes.
Its overlap with v1, the tests, the fixtures and the rules was measured: 1 of 83 texts is ≥ 0.3 trigram-Jaccard
(an amazon.in URL), and 3 scenarios repeat scam families from v1. They are marked.

## 3. Measured results (rules unchanged, single run)

| System (n = 51 labelled scam/benign) | TP | FP | TN | FN | Precision | Recall | FPR | FNR |
|---|---|---|---|---|---|---|---|---|
| **SafeCircle case engine** | 23 | 3 | 24 | 1 | 0.885 (23/26) | 0.958 (23/24) | 0.111 (3/27) | 0.042 (1/24) |
| Keyword baseline | 19 | 4 | 23 | 5 | 0.826 (19/23) | 0.792 (19/24) | 0.148 (4/27) | 0.208 (5/24) |
| Original single-message detector | 22 | 18 | 9 | 2 | 0.550 (22/40) | 0.917 (22/24) | 0.667 (18/27) | 0.083 (2/24) |

- Flagged means any outcome other than `clear`. The strict variant (medium or high only) gives the same numbers,
  because no labelled scenario ended in review-only.
- Ambiguous scenarios are kept out of precision and recall and scored against their pre-written acceptable
  outcomes: 8/9. Integration expectations: 9/9. Acceptable outcome overall: 55/60.
- Errors: 3 false positives (a genuine delivery OTP meant for the courier → **high**; a new-login alert → medium; an
  LPG booking → medium). 1 false negative (a task-job scam with a registration fee). The ambiguous stock tip came
  out clear.
- **Synthetic benchmark performance does not establish real-world fraud-detection accuracy.**

## 4. Integration across the feature areas

`backend/tests/test_validation_integration.py` (10 tests, all pass) drives the real API across features. Together
with the holdout run, the demo dry run and the existing suites, this covers:

| Requirement | Result | Evidence |
|---|---|---|
| UPI check attaches evidence to a case when asked | pass | test 1; holdout HU*/HS05/HM*; demo step 4 |
| New evidence triggers reassessment, with "what changed" | pass | test 1; demo step 4 (36 → 97, escalated) |
| Scam DNA shows evidence and keeps uncertainty | pass | link-only and weak-signal tests; unreadable screenshot not called safe |
| Network separates observed indicators from inferred similarity | pass, with note L1 | inferred edges only for pairs with no shared non-claim indicator, each with uncertainty text |
| Evidence report matches case data and discloses limitations | pass | risk, score and evidence count equal the case; "NOT been submitted"; score labelled not a probability |
| Campaign Radar adds no unsupported claims or duplicates | pass | stable IDs across reads; repeat evidence and demo reload add no groups |
| Repeated unchanged evidence causes no duplicate alerts | pass | HD01–HD04; demo steps 5b/5c |
| No cross-profile access through any feature | pass | case, events, report, report.md, UPI attach, forensics attach, dismissals, network, UPI case matching |
| Benign, suspicious, ambiguous, malformed, contradictory | pass, with notes | holdout categories; contradictory note below |

**No integration defect was confirmed, so no product code was changed.**

## 5. Privacy and security findings

No high-severity issue was found. Severity is the reviewer's judgement.

| ID | Severity | Finding | Status |
|---|---|---|---|
| M1 | Medium | With the link guard on, the extension sends the **full clicked URL, query string included**, to the configured server. A query string can carry tokens or e-mail addresses. Requests are anonymous and the default server is local, but a remote server would receive every cross-site link clicked. The popup also sends the current tab's full URL when opened. | Documented. Not changed, because stripping queries alters detection; the decision belongs to the owner. |
| M2 | Medium | A single matched tactic can reach **high**. The genuine courier OTP (HO05) scored 60, exactly the high threshold, because "share OTP" alone weighs that much. Weak evidence can therefore produce an overconfident verdict for legitimate share-with-courier OTPs. | Documented in the holdout README. The rule was not changed, to keep the holdout clean. |
| M3 | Medium | Contradictory evidence is detected narrowly. A "please ignore, we never ask for your PIN" retraction after a PIN phishing link (HG05) produced **no conflict note**. Conflicts are recorded only for safety advice next to an OTP/PIN *request* or a collect request. The verdict stayed correctly high. | Documented |
| L1 | Low | In Scam Network, "Claims to be SBI" counts as a **shared indicator** and is drawn with solid observed edges. Unrelated SBI impersonations therefore look connected (5 cases in the demo). The node is labelled "A claim, not a verified sender", and Campaign Radar correctly treats it as heuristic, not exact. | Documented. Suggest excluding org claims from the "shared indicators" count or drawing them differently. |
| L2 | Low | At the 200-case profile cap with near-identical cases, `/campaigns` returned 9.8 MB and `/network` 19,900 inferred edges, about 1.5 s each, in-process. The browser graph is designed for a few dozen cases. | Documented (synthetic stress test) |
| L3 | Low | The demo UPI fixtures `sbi.refund@ybl`, `ravistores@okicici` and `hdfc.customer.care@ybl` are realistic handles that could exist on a real PSP. The `demo…`/`eval…` prefix convention is not followed there. | Documented. Renaming needs a regenerated QR image and test updates. |
| L4 | Low | The link guard covers ordinary left-clicks on `<a>` links only. Script navigation, form posts and middle/modifier-clicks are not checked. Any `chrome-extension://` origin may call the API (CORS regex). That is acceptable for the anonymous analysis endpoints; profile endpoints still need the bearer token. | Documented |
| L5 | Low | The CSP allows `script-src 'unsafe-inline'`, which the Next.js static export needs. | Known; unchanged |

Checked and found sound: QR images are decoded in the browser (`BarcodeDetector`) and never uploaded. Screenshot
uploads have a streaming size cap, a MIME allow-list, a magic-byte match, a dimension cap before decoding,
re-encoding that strips EXIF/GPS, and Tesseract run without a shell under a timeout, with nothing written to disk.
Links are never fetched (no HTTP client in `backend/app`). Logs record method, path, status and timing only.
Reports and stored evidence contain no OTPs, phone numbers, e-mail addresses, card numbers or raw UPI IDs
(re-tested). Every case endpoint returns 404 for another profile's case. The extension builds DOM with
`textContent` only, opens only http(s) URLs without credentials, and requires the tick box before "Open anyway"
on high risk. No real bank/NPCI integration, payment execution, recording or blocking exists.

## 6. Manual Chrome extension check

**NOT VERIFIED.** Chrome 137+ ignores `--load-extension`, so the real extension runtime still needs a person.
Exact steps, a controlled test page (`e2e/fixtures/guard-test.html`, `.example` links that cannot resolve) and a
results table: [extension-manual-check.md](extension-manual-check.md).

## 7. Demo

[demo-runbook.md](demo-runbook.md): one story in 8 steps with DEMO DATA only. Steps 1–7 are checked two ways:
`backend/scripts/demo_story_check.py` (API, 10/10 PASS) and `e2e/demo.mjs` (real Chrome, 12/12 against the dev
server on :3000 and 12/12 against a fresh production build). Step 8 is the manual extension check.

## 8. Commands run and results

| Command | Result |
|---|---|
| `backend/.venv/bin/python evaluation/holdout_v2/evaluate_holdout.py` | 65 scenarios scored, see §3 |
| `backend/.venv/bin/python evaluation/holdout_v2/overlap_check.py` | 83 texts; 1 ≥ 0.3, 8 ≥ 0.15 |
| `cd backend && .venv/bin/python -m pytest -q` | **162 passed** (152 before + 10 new) |
| `cd extension && node --test` | **18/18** with the API running (15 pass + 3 skipped without it) |
| `cd backend && .venv/bin/python scripts/demo_story_check.py` | 10/10 PASS |
| `npm run typecheck` and `npm run build` in a scratch copy of `frontend/` | pass, 15 static routes |
| e2e against that build on a scratch DB (`SAFECIRCLE_RATE_LIMIT_PER_MINUTE=1000`): `e2e.mjs`, `scamdna.mjs`, `extension-pages.mjs`, `advanced.mjs`, `demo.mjs` | **18/18, 21/21, 17/17, 30/30, 12/12** |

## 9. Files

Created: `evaluation/holdout_v2/{dataset_v2.json, dataset_v2.sha256, evaluate_holdout.py, overlap_check.py,
results_v2_baseline.json, overlap_report.json, README.md}`, `backend/tests/test_validation_integration.py`,
`backend/scripts/demo_story_check.py`, `e2e/demo.mjs`, `e2e/fixtures/guard-test.html`,
`docs/{validation-report.md, demo-runbook.md, extension-manual-check.md}`.
Modified: `STATUS.md`, `README.md` (links only). No product code changed.

## 10. Still outstanding

1. Manual extension check in real Chrome (§6).
2. Rebuild `frontend/out` once the dev server on :3000 is stopped.
3. Owner decisions on M1 (strip URL query strings in the extension?) and M2/M3. Any rule change must be judged on a
   new v3 set, not on v2.
4. A real-world or public labelled dataset of Indian UPI/banking scams. None was used here.
