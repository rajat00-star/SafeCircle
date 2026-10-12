# Synthetic holdout evaluation, v2 (DEMO DATA)

> **This is a synthetic benchmark. Good results here do not show real-world fraud-detection accuracy.** Every
> message was written by one person for this test, in English, without real victims, real fraud reports or
> code-mixed language. Treat the numbers as a regression and sanity check on known scam patterns.

## What is in it

`dataset_v2.json`: 65 scenarios, 83 pieces of evidence. All people, accounts and UPI handles are fictional
(`eval…` handles, `.example` domains); real brand names appear only inside text that impersonates them.

| Category | Scenarios | Label |
|---|---|---|
| Benign bank notifications | 11 | benign |
| Ordinary personal messages | 6 | benign |
| Legitimate UPI requests and QR payloads | 6 | benign |
| Obvious scams | 13 | scam |
| Borderline and ambiguous | 9 | ambiguous |
| Multi-stage (message + link + UPI + screenshot, 2 benign, 6 scam) | 8 | 6 scam, 2 benign |
| Malformed, irrelevant, contradictory | 8 | 5 integration, 1 benign, 2 scam |
| Repeated and duplicate evidence | 4 | 3 scam, 1 benign |
| **Total** | **65** | 24 scam, 27 benign, 9 ambiguous, 5 integration-only |

Every scenario was written with its label and its acceptable outcomes (`clear`, `review`, `warn`, `alert`) **before
the detector was run**. The dataset was committed (`e8d847f`) and its SHA-256 recorded in `dataset_v2.sha256` before
the first run. The evaluator refuses to score a file whose checksum does not match, so labels cannot be quietly
edited afterwards.

QR codes are represented by the `upi://pay?...` text they decode to, because the app decodes QR images in the
browser and the API only ever sees that text. Screenshots are rendered from text to PNG at run time and go through
the real upload endpoint and local Tesseract OCR.

## How it is run

```bash
backend/.venv/bin/python evaluation/holdout_v2/evaluate_holdout.py      # writes results_v2_baseline.json
backend/.venv/bin/python evaluation/holdout_v2/overlap_check.py         # writes overlap_report.json
```

Each scenario gets a new profile and case in a temporary SQLite database (`backend/safecircle.db` is never opened).
Evidence goes through the same endpoints as the web app: `POST /cases/{id}/events`, `POST /upi/check` with
`case_id`, `POST /forensics/text` and `POST /forensics/screenshot`. The result is the case state read back with
`GET /cases/{id}`.

Outcome mapping: high risk → `alert`, medium → `warn`, low with review required → `review`, low → `clear`.

- **Precision, recall and rates** use only the 51 scenarios labelled scam or benign. A scenario counts as
  *flagged* when its outcome is anything other than `clear`, because that is when the app raises an alert.
  A *strict* variant counts only `warn` and `alert`.
- **Ambiguous** scenarios (9) are left out of precision and recall. Each is scored only against the outcomes
  written down for it in advance, for example `clear` or `review` for an "is this still your number?" opener.
- **Integration** scenarios (5) are scored only on API behaviour: the status code, whether the case changed,
  whether anything was stored.

## Results (rules unchanged, run once on 2026-10-12)

Detector code at commit `5ff0919` (no rule was changed for or after this run). File: `results_v2_baseline.json`.

| System | TP | FP | TN | FN | Precision | Recall | FPR | FNR | F1 |
|---|---|---|---|---|---|---|---|---|---|
| **SafeCircle (Scam DNA case engine)** | 23 | 3 | 24 | 1 | 0.885 (23/26) | 0.958 (23/24) | 0.111 (3/27) | 0.042 (1/24) | 0.920 |
| SafeCircle, strict (warn/alert only) | 23 | 3 | 24 | 1 | 0.885 (23/26) | 0.958 (23/24) | 0.111 (3/27) | 0.042 (1/24) | 0.920 |
| Baseline: keyword list | 19 | 4 | 23 | 5 | 0.826 (19/23) | 0.792 (19/24) | 0.148 (4/27) | 0.208 (5/24) | 0.809 |
| Baseline: original single-message detector | 22 | 18 | 9 | 2 | 0.550 (22/40) | 0.917 (22/24) | 0.667 (18/27) | 0.083 (2/24) | 0.688 |

The strict and normal rows match because no labelled scenario ended in `review`.

Confusion matrix (SafeCircle, n = 51):

| | Flagged | Not flagged |
|---|---|---|
| **Scam (24)** | 23 TP | 1 FN |
| **Benign (27)** | 3 FP | 24 TN |

Outcome by label (all 65):

| Label | clear | review | warn | alert |
|---|---|---|---|---|
| scam (24) | 1 | 0 | 6 | 17 |
| benign (27) | 24 | 0 | 2 | 1 |
| ambiguous (9) | 7 | 0 | 2 | 0 |
| integration (5) | 5 | 0 | 0 | 0 |

- **Acceptable outcome**, over the 60 scenarios that list acceptable outcomes: 55/60.
- **Ambiguous** scenarios with an acceptable outcome: 8/9. HA08, the stock tip, came out `clear` but was expected
  to be `review` or `warn`.
- **Integration expectations** met: 9/9, including the duplicate and alert-count checks in HD01 to HD04.
  Malformed UPI input returned 422 and left the case unchanged. The 25,000-character message got 422. An
  unreadable screenshot was not stored and was marked for review. Garbage given as a URL caused no server error.
- **Alerts:** 30 notifications across 65 scenarios. 3 benign scenarios raised one each (the false positives
  below). Two scam scenarios notified twice (HM02 and HM04, each an escalation from medium to high). Repeating
  identical evidence never raised a second alert.
- **Latency:** median 7.5 ms per piece of evidence through the in-process API, including database writes. The
  slowest step was 714 ms: model loading on the first call, plus local OCR. This is not network latency.

### Errors (kept as found; no rule changed)

| ID | Truth | Got | Why |
|---|---|---|---|
| HO05 | benign | alert (60) | A genuine delivery OTP that is *meant* to be given to the courier. "Share OTP" matches the secret-request rule, which alone reaches the high threshold. |
| HB06 | benign | warn (30) | A genuine new-login alert that points to the official app. It matched the credential-request rule (which phrase triggered it was not investigated, to keep the rules untouched by this set). |
| HO06 | benign | warn (35) | An LPG booking that says "pay the delivery person only the amount on the bill" matched payment pressure. |
| HS10 | scam | clear (15) | A task-job scam ("earn ₹5,000–8,000 daily… pay ₹2,000 registration"). No task-job or registration-fee rule fired. Only impersonation was found, too weak alone. |
| HA08 | ambiguous | clear | Stock-tip spam with a "premium group": no investment-fraud signal fired. |

Other observations:
- **HG05 (contradictory evidence):** a phishing message followed by a "please ignore, we never ask for your PIN"
  message. The case stayed high, which is correct, but the engine recorded **no conflict**. Its conflict check
  only covers safety advice next to an OTP/PIN *request* or a collect request. A request to "verify your PIN at"
  a link is classed as a credential link, so the conflict was not noticed.
- **The original single-message detector** flags most UPI payloads and bank notices (FPR 0.667). Part of this
  is unfair to it: the baseline sends it the raw `upi://pay?...` text, which it was never designed for. It is
  included to show why the case engine exists, not as a fair comparison.

## Leakage and overlap

**The v1 set is not independent.** `evaluation/scam_dna/scenarios_v1.json` (30 scenarios) was written alongside the
rules. Its first run (P 0.800, R 0.889, FPR 0.333) came before any rule change, but four rule fixes were then made
from its errors. The post-fix run (P 0.944, R 0.944, FPR 0.083) is therefore **not** a held-out measurement.

**How v2 relates to it:**
- The author of v2 had read the v1 scenario texts and the shape of the API, but **not** the regular expressions in
  `backend/app/scamdna/tactics.py` or `backend/app/detector/rules.py`. That knowledge still shapes what gets
  written, so v2 is *held out from tuning*, not *blind*.
- `overlap_check.py` compares all 83 v2 evidence texts with v1, the backend tests, the demo fixtures, the rule
  files and the e2e scripts, using word-trigram Jaccard similarity. One text scored ≥ 0.3: HM07's link
  `https://www.amazon.in/gp/your-account/order-history` shares its prefix with a URL in `tests/test_detector.py`
  (0.71). Seven more scored between 0.15 and 0.22, all short shared phrases such as "share the OTP sent to your
  phone". No v2 UPI handle or `.example` domain appears anywhere else. Full list: `overlap_report.json`.
- Three scenarios repeat **scam families** already in v1 and are marked as overlapping in their descriptions:
  HB10 (purchase OTP with safety advice, v1 B03), HS07 (utility disconnection threat, v1 S08) and HM05
  (accidental credit, then a PIN-approval request, v1 S16). The wording is new, but the rules were tuned on
  these families.
- **Nothing in v2 was used to change a rule.** If rules change later, this set should no longer be called held
  out. Write a v3 validation set for the changed rules and keep `results_v2_baseline.json` as it is.

## Limitations

- 65 scenarios, one author, English only. Proportions are not those of real traffic: real inboxes are mostly
  benign, so a real-world false-positive rate would weigh much more heavily than it does here.
- Labels are one person's judgement. No inter-annotator agreement was measured.
- Synthetic screenshots are clean, rendered text. Real screenshots (compressed, cropped, dark mode) will OCR worse.
- The risk score is a heuristic. It is not a calibrated probability and has not been checked against real outcomes.
