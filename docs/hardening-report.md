# Security and reliability hardening (2026-10-12)

Branch `hardening`, created from `validation` at `43fade6`. A restore tag `checkpoint/pre-hardening` points to
that commit. Nothing was pushed or deployed. `backend/safecircle.db` was not opened (still 528,384 bytes, last
modified 09:21, before this work). `frontend/out` was not rebuilt: the production build was made in a scratch copy.
The frozen v2 set, its labels, its checksum and `results_v2_baseline.json` are unchanged.

This fixes the three medium findings M1–M3 from [validation-report.md](validation-report.md). No product feature
was added. The owner approved the two changes that alter detection (M1 and M2) in the project thread before they
were made.

## 1. What changed

| Finding | Fix | Detection effect |
|---|---|---|
| **M1** The link guard sent the full clicked URL, query string included. The popup sent the full tab URL. | The link guard and the popup now send a **minimal address** (`minimizeUrl`, `extension/shield.js`). Scheme, host, port and path are unchanged. Each query value becomes `x` characters of the same length. A value that is itself a web address is cut to its origin. Short plain lower-case words (≤ 24 letters, such as `login`) are kept. Token-like keys are masked. The `#fragment` is dropped. The full URL is kept only in the extension's session memory, for "Open anyway". The cache key is the minimal address. An address with hidden credentials is never sent from the popup. | Measured below (§2). Small and one-directional: a few phishing URLs lose a login or brand word that sat inside a token-like value. |
| **M2** A single matched tactic could reach high (a genuine courier OTP scored exactly 60). | In `assess_case` (`backend/app/scamdna/assessment.py`), a case with **exactly one tactic and no other component** (no second tactic, combination, stage bonus or cross-event repeat) is held at 59, which is medium. A new uncertainty reason says so, and the case goes to review. Any corroboration restores the uncapped score. | High becomes medium for single-tactic cases, which are still warned and reviewed. Flagged versus clear does not change, so precision and recall are unaffected. A bare "send me the OTP" is now medium, not high. |
| **M3** An "ignore the earlier message" or reassurance follow-up after a risky request produced no conflict. | `detect_text` records retraction phrases ("ignore / disregard … earlier / previous / last … message / SMS / link …") on the event (`retraction`). `_conflicts` now adds a conflict when a **later** event retracts, or reassures with safety advice, after an **earlier** event made any risky request (OTP/PIN, collect, payment diversion or pressure, credential or suspicious link, remote access, digital arrest, family impersonation). The note names both evidence numbers, says that newer is not more trustworthy and that the earlier request still counts, and points out when the follow-up makes its own request. | Conflicts already trigger review. **Scores never go down**: tactic weights are aggregated by maximum, and a retraction adds no tactic. A retraction with no earlier request is not a conflict. |

The original single-message detector (`app/detector`) and all rule weights are unchanged.

### Files changed

- `extension/shield.js`, `extension/background.js`, `extension/popup.js` (M1)
- `backend/app/scamdna/assessment.py` (M2, M3) and `backend/app/scamdna/tactics.py` (M3)
- New tests: `backend/tests/test_hardening.py` (14) and `extension/tests/privacy.test.mjs` (7)
- New evaluation files: `evaluation/holdout_v3/{dataset_v3.json, dataset_v3.sha256, evaluate_v3.py,
  results_v3_prefix.json, results_v3_postfix.json}`, `evaluation/holdout_v2/results_v2_posthardening.json` (a
  new file; the baseline is untouched), and `evaluation/hardening/{minimize_urls.mjs, url_minimization_impact.py,
  url_minimization_impact.json}`
- Docs and fixtures: this report, `docs/extension-manual-check.md` (M1 text, new step 10b),
  `e2e/fixtures/guard-test.html` (one link with a query string), and links in `STATUS.md` and `README.md`

## 2. M1: which rules need the query string, and the measured impact

Four URL rules read the query (`backend/app/detector/url_analyzer.py`): `sensitive_path` (login or verify words in
path + query), `brand_in_path` (a brand name in path + query), `long_url` (raw length > 120) and
`embedded_redirect` (a query value that is a web address). The masking keeps length, embedded origins and plain
words, so most of these still fire. Host-based rules and the host model never used the query.

Each URL with a query or fragment was run through the real `minimizeUrl`, and then through `analyze_single_url`
before and after (`evaluation/hardening/url_minimization_impact.json`):

| Set | URLs | With query/fragment | high→medium | medium→low | low→medium | Unchanged |
|---|---|---|---|---|---|---|
| Phishing dev | 20,000 | 3,635 | 19 | **51** (0.26% of all) | 0 | 3,565 |
| Phishing test sample | 5,000 | 928 | 5 | **10** (0.20% of all) | 1 | 912 |

Signals lost on the dev set: `sensitive_path` 133, `brand_in_path` 26, `long_url` 8. These are cases where a
login or brand word sat inside a token-like value (for example `?otpverification.aspxg9a…`). High→medium links
are still warned. Medium→low links are no longer warned. This is the accepted privacy trade-off. No benign URL
set is stored in the repository, so the false-positive side was not measured. Masking can only remove signals,
apart from the single low→medium case above (cause not investigated), so it should rarely add false
alarms. Remaining exposure: the **path** is still sent, and some sites put tokens or e-mail addresses in the path.

## 3. Evaluation

### Frozen v2 (reported unchanged)

`evaluation/holdout_v2/results_v2_baseline.json` is unchanged (`git diff` is empty, and the dataset checksum
`8ac1dba4…` still matches). On the 51 scam/benign scenarios: **precision 0.885 (23/26), recall 0.958 (23/24),
FPR 0.111 (3/27)**.

v2 was re-run after the fixes into a separate file, for information only. This run is **not independent**: the
user's task named the v2 error types (courier OTP, new-login alert, LPG booking) as regression cases. Binary
metrics are identical (23/3/24/1). Two scenarios changed: HO05 (genuine courier OTP) went from alert to warn, so
it is still a false positive but no longer high; HG05 ("please ignore" after a phishing link) now records a
conflict and requires review, and stays alert.

### New v3 set (post-fix check)

`evaluation/holdout_v3/dataset_v3.json`: 38 synthetic DEMO DATA scenarios (17 benign, 15 scam, 6 ambiguous). It
was written and committed with a checksum (`5022df47…`) **before any fix was implemented** and before the
detector ran on it (commit `c1d83e7`). It was not used to tune anything. Caveat: its author had already read the
rules, the v2 set and the v2 errors, so it is a fresh check, **not an independent benchmark**. The pre-fix run
used an export of `checkpoint/pre-hardening` with the same v3 files.

| v3 (n = 32 scam/benign) | TP | FP | TN | FN | Precision | Recall | FPR |
|---|---|---|---|---|---|---|---|
| Before hardening | 14 | 4 | 13 | 1 | 0.778 | 0.933 | 0.235 |
| **After hardening** | 14 | 4 | 13 | 1 | 0.778 | 0.933 | 0.235 |
| Keyword baseline | 13 | 6 | 11 | 2 | 0.684 | 0.867 | 0.353 |
| Original single-message detector | 14 | 11 | 6 | 1 | 0.560 | 0.933 | 0.647 |

Acceptable outcome went from 32/38 to 33/38. Outcome changes: the cab ride PIN (benign) went from alert to warn,
which is now acceptable. A bare OTP request (scam) and a collect request followed by reassurance (scam) went from
alert to warn and are still flagged. Conflicts: all three contradictory scams now record a conflict and require
review; before, only one did.

Remaining v3 errors, all unchanged by these fixes and not tuned: three benign messages at medium from one
tactic (card blocked on request, a society maintenance reminder, a lunch split by UPI), a TRAI number-block
call-back scam rated clear (only a generic threat matched), and an ambiguous "rent to my new account" rated
high. The single-tactic cap does not cover medium, so a single 0.30–0.35 tactic still gives a medium warning.

**Synthetic benchmark performance does not establish real-world fraud-detection accuracy.**

## 4. Tests run (all on 2026-10-12, on branch `hardening`)

| Command | Result |
|---|---|
| `cd backend && .venv/bin/python -m pytest -q` | **176 passed** (162 before + 14 in `test_hardening.py`) |
| `cd extension && node --test` (API running on :8000) | **25/25** (18 before + 7 in `privacy.test.mjs`; the 3 live-API tests ran) |
| `cd backend && .venv/bin/python scripts/demo_story_check.py` | 10/10 PASS (its own temporary database) |
| `npm run typecheck` and `npm run build` in a scratch copy of `frontend/` (`node_modules` symlinked) | pass, 15 static routes |
| Scratch API: `SAFECIRCLE_DATABASE_URL=sqlite:///<scratch>/e2e.db .venv/bin/alembic upgrade head`, then `uvicorn app.main:app --host 127.0.0.1 --port 8000` with `SAFECIRCLE_STATIC_DIR=<scratch>/out SAFECIRCLE_RATE_LIMIT_PER_MINUTE=1000` | served the scratch build |
| `cd e2e && BASE_URL=http://127.0.0.1:8000 API_BASE=http://127.0.0.1:8000 CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node <suite>.mjs` | `e2e` **18/18**, `scamdna` **21/21**, `extension-pages` **17/17**, `advanced` **30/30**, `demo` **12/12** |
| `backend/.venv/bin/python evaluation/holdout_v3/evaluate_v3.py --out results_v3_postfix.json` (pre-fix: same command in an export of `checkpoint/pre-hardening`, `--out results_v3_prefix.json`) | §3 |
| `backend/.venv/bin/python evaluation/holdout_v2/evaluate_holdout.py --out results_v2_posthardening.json` | §3 |
| `node evaluation/hardening/minimize_urls.mjs <list> <out.json>`, then `backend/.venv/bin/python evaluation/hardening/url_minimization_impact.py <out.json> <count>` | §2 |

A first e2e attempt failed with `no such table: profiles` because the scratch database had not been migrated.
After `alembic upgrade head` on the scratch database, every suite passed. The real database was not involved.

## 5. Manual Chrome check: NOT VERIFIED

The real extension runtime has still **not** been tested; Chrome 137+ ignores `--load-extension`. The automated
tests cover `minimizeUrl`, the service worker with a mocked `chrome.*`, and the extension pages with a stubbed
`chrome.*`. They do not prove the installed extension works. To check by hand, follow
[extension-manual-check.md](extension-manual-check.md) steps 1–12. Step **10b** is new for this change:

1. Start the API on a scratch database (`export SAFECIRCLE_DATABASE_URL=sqlite:////tmp/safecircle-extcheck.db`,
   `.venv/bin/alembic upgrade head`, `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000`), and serve
   `e2e/fixtures` with `python3 -m http.server 8765 --bind 127.0.0.1`.
2. Load `extension/` unpacked in `chrome://extensions`, then turn on the link guard in Options and allow site
   access.
3. Open `http://127.0.0.1:8765/guard-test.html` in a new tab. Open **Inspect views: service worker** → Network.
4. Click **High-risk test link with a query string**. The `analyze/url` request payload must be exactly
   `{"url":"http://sbi-kyc-verify-login.example/update?session=xxxxxxxxxx&email=xxxxxxxxxxxxxxxxxxx&next=https%3A%2F%2Fpay.example"}`
   (the API returns high, 80, for it). It must not contain `Ab12Cd34Ef`, `asha`, `id=77` or `#step2`.
5. The high-risk warning page appears. Tick the acknowledgement and click **Open anyway**: the address bar shows
   the full original address, including `#step2`, and Chrome reports that the `.example` site cannot be reached.
6. Click the toolbar icon on any page with a query string. The popup's request must also carry masked values.
7. Record each result in the table at the end of extension-manual-check.md.

## 6. Remaining trade-offs and risks

- **M1:** about 0.2–0.3% of phishing URLs lose a warning (medium→low) because their login or brand words sat
  inside token-like query values. The path is still sent. The right-click "Check this link" still sends the full
  URL, because the user submitted it on purpose.
- **M2:** a lone OTP or PIN request from an unknown sender is now medium (warn + review), not high. Anything that
  corroborates it brings back high. Single-tactic medium false positives (a new-login alert matched on "login to",
  card-blocked confirmations, payment reminders) are unchanged; fixing them would need rule changes judged on a
  new set. The new-login development test asserts "not high", and it is still medium.
- **M3:** retraction is phrase-based (English, "ignore / disregard … earlier / previous …"), so other wordings
  are missed. Cases stored before this change have no `retraction` field until their evidence is added again;
  safety-advice conflicts do work on old cases. Reassurance after a request is now always a conflict, which can
  add review prompts when a genuine safety notice sits in the same case as a scam message.
- Low findings L1–L5 from the validation report are unchanged.
- `frontend/out` is still stale and needs a rebuild when no dev server shares `frontend/`. Nothing listened on
  :3000 during this work, but the folder was left alone as instructed.
