# Advanced feature engineering: delivery report (2026-10-12)

Branch `advanced-features` (3 commits on top of `scam-pattern-recognition`), restore point tag
`checkpoint/pre-advanced-features`. Nothing was pushed or deployed. The SQLite database `backend/safecircle.db`
was not touched: every run used a scratch database.

## Reused, not rebuilt
- **Adaptive risk engine (E):** this already existed. It reassesses on every new piece of evidence and reports what
  changed, conflicts, missing evidence, review state and fingerprint-based alert suppression.
- Scam DNA tactic rules, redaction and keyed hashing, case storage and alert decisions, Campaign Radar correlation,
  the Forensics report UI conventions, ProfileGate, and demo campaign fixtures.

## New features and why
1. **UPI Scam Guard (A)** is the most direct fit for PS02 ("UPI, banking or wallet contexts"). It checks a UPI ID
   or payment QR *before* paying.
2. **Evidence report (C)** turns an investigation into something a victim can hand to a bank or to 1930. It is
   cheap to build because it reuses stored data.
3. **Scam network (B)** gives a visual view of the indicators Campaign Radar already computes, with no second
   correlation engine.
- **Voice analyzer (D)** was skipped because it needs a speech-to-text model (a large local one such as Whisper,
  or a paid API).

## Files
Created: `backend/app/scamdna/upi.py`, `backend/app/scamdna/report.py`, `backend/app/scamdna/network.py`,
`backend/app/routers/upi.py`, `backend/tests/test_upi_guard.py`, `backend/tests/test_report_network.py`,
`frontend/app/upi/page.tsx`, `frontend/app/cases/report/page.tsx`, `frontend/app/network/page.tsx`,
`frontend/public/demo/demo-upi-qr.png` (DEMO DATA QR code), `e2e/advanced.mjs`, `docs/advanced-features.md`,
`docs/screenshots/30-upi-guard-high.png`, `docs/screenshots/32-evidence-report.png`, this report.

Modified: `backend/app/main.py` (router), `backend/app/routers/cases.py` (report and network endpoints),
`backend/app/schemas.py` (UPI schemas), `frontend/lib/api.ts`, `frontend/components/Nav.tsx` (UPI Guard link),
`frontend/components/CaseView.tsx` ("Evidence report" button), `frontend/app/campaigns/page.tsx` (link to the
network), `frontend/app/layout.tsx` (footer links), `frontend/app/globals.css` (new styles and print styles),
`README.md`, `STATUS.md`, `docs/api.md`, `docs/openapi.json`.

## API endpoints added
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/upi/check` | `{input, context?, case_id?}`. Works without a profile; with a profile it also matches your cases |
| GET | `/api/v1/cases/{id}/report` 🔒 | JSON; `include_excerpts`, `include_related` |
| GET | `/api/v1/cases/{id}/report.md` 🔒 | Markdown |
| GET | `/api/v1/network` 🔒 | `shared_only` |

No existing endpoint changed. No migrations and no dependencies were added.

## Tests actually run (2026-10-12)
| Suite | Result |
|---|---|
| Backend `pytest` | **152 passed** (122 before + 22 UPI + 8 report/network) |
| Extension `node --test` | 18/18 (extension code unchanged) |
| Frontend `tsc --noEmit` and `next build` | pass (15 static routes) |
| `e2e/advanced.mjs` (new) | **30/30** in Chrome |
| `e2e/e2e.mjs`, `scamdna.mjs`, `extension-pages.mjs` | 18/18, 21/21, 17/17, so the four existing features show no regressions |
| `next lint` | not run: the repo has no ESLint config |

Inputs covered: benign (shop QR, plain handle), suspicious (refund QR, "customer care" handle), ambiguous (unlisted
handle suffix, which is information only) and malformed (10 parser cases plus 2 through the UI). These are
automated tests on synthetic DEMO DATA. They are not a measurement of real-world accuracy.

## Limitations and manual checks
- UPI Guard cannot see who owns a handle and consults no bank, NPCI or fraud database. It matches only your own cases.
- QR decoding uses the browser's `BarcodeDetector` (Chrome/Edge on macOS, Android and ChromeOS). Other browsers get a
  "paste the link" message. The camera is not used (the app's `Permissions-Policy` blocks it).
- The PDF comes from the browser's print dialog. The print layout was checked with print-media emulation, not on paper.
- The graph layout is tuned for up to a few dozen cases.
- `frontend/out` was **not** rebuilt, because the `next dev` server on port 3000 shares `frontend/.next`. Rebuild it
  when that server is stopped (see the commands below).
- The extension still needs the earlier manual check of loading it unpacked in Chrome.

## Commands
```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npm run typecheck && npm run build        # after stopping the dev server on :3000
cd backend && SAFECIRCLE_STATIC_DIR=../frontend/out .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
# open http://127.0.0.1:8000/upi/ , /network/ , and a case → Evidence report
cd e2e && BASE_URL=http://127.0.0.1:8000 CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node advanced.mjs
```
