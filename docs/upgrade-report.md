# Problem Statement 02 upgrade: delivery report (2026-10-12)

Branch `scam-pattern-recognition`, 6 commits on top of `5d699d0`. Nothing pushed, published or deployed.

## 1. Architecture

The existing FastAPI detector (`backend/app/detector`) is untouched, so its published evaluation still holds. A new
case layer, `backend/app/scamdna`, sits on top: per-event tactic detection (financial rules added on top of the base
detector) → redaction and indicators → case assessment (ordering, attack chain, risk components, uncertainty,
conflicts, gaps, recommendations) → alert decision with de-duplication → campaign correlation. Routers `cases`,
`forensics` and `demo`, a service layer (`services/cases.py`) and four new tables. The Next.js static site gains
Overview, Scam DNA, Forensics and Campaign Radar views; the MV3 extension becomes Guardian Shield. Diagram and module
table: [scam-dna.md](scam-dna.md).

## 2. Features and how they connect

- **Scam DNA**: cases of events; every addition re-evaluates the case and explains what changed.
- **Forensics**: one report for text, conversation, link or screenshot (local Tesseract); can add its findings to a case.
- **Campaign Radar**: correlates cases using the indicators each case assessment produces; dismissals per pair.
- **Guardian Shield**: browser checks through the same API; warning page before risky navigation.
- **Overview**: counts from the same cases and their audit logs.

## 3. Files and design decisions

New backend: `app/scamdna/{tactics,evidence,assessment,alerts,campaigns,ocr,demo}.py`, `app/services/cases.py`,
`app/routers/{cases,forensics,demo}.py`, migration `a336d9eb6fd1`, `scripts/make_demo_screenshot.py`, tests
`test_scamdna_engine.py`, `test_cases_api.py`, `test_forensics.py`, `test_campaigns.py`, `test_evaluation_set.py`.
Changed: `models.py`, `schemas.py`, `config.py`, `main.py` (routers, 5 MB cap for the screenshot path, `blob:` images
in CSP), `routers/profiles.py` (export includes investigations), `requirements.txt` (+ `pillow==12.3.0`, already in the venv).

New frontend: `app/{cases,forensics,campaigns}/page.tsx`, `components/{AttackChain,CaseView,OverviewDashboard}.tsx`,
`public/demo/scam-sms-demo.png`. Changed: `lib/api.ts`, `Nav.tsx` (Overview · Scam DNA · Forensics · Campaign Radar ·
History · Browser Protection; contacts, privacy and how-it-works moved to the footer), `layout.tsx`, `page.tsx`,
`GlobeHero.tsx` (copy and CTAs only), `extension/page.tsx`, `globals.css`.

Extension: new `shield.js`, `guard.js`, `tests/`; rewritten `common.js`, `background.js` (module worker),
`result.*`, `popup.*`, `options.*`, `manifest.json` (v1.1.0, + `scripting`, optional host permissions).

Decisions: detector reused not modified; assessment is a pure function of stored redacted events; evidence stored
redacted, screenshots never stored; transparent correlation instead of a model; spam-model similarity reported but
never scored and never alerts on its own; case status is user-controlled (review is a computed flag); link guard is
opt-in and fails open with a visible "?" so browsing never breaks.

## 4. API endpoints added

`/cases` (GET, POST), `/cases/{id}` (GET, PATCH, DELETE), `/cases/{id}/events` (POST),
`/cases/{id}/events/{event_id}` (DELETE), `/forensics/text`, `/forensics/url`, `/forensics/screenshot` (POST),
`/campaigns` (GET), `/campaigns/dismissals` (POST, DELETE), `/overview` (GET), `/demo/scenarios` (GET),
`/demo/scenarios/{key}/cases` (POST), `/demo/scenarios/{key}/check/{case_id}` (GET), `/demo/campaigns` (POST),
`/demo/cases` (DELETE). Changed: `/profiles/me/export` adds `investigations`. Existing endpoints unchanged.

## 5. Migration

`a336d9eb6fd1` adds `scam_cases`, `case_events`, `case_log`, `campaign_dismissals`. Additive and reversible;
upgrade/downgrade/upgrade and `alembic check` verified on SQLite. Your local `backend/safecircle.db` was upgraded after
a copy was saved as `backend/safecircle.before-scamdna.db` (git-ignored). PostgreSQL is exercised by CI only.

## 6. Start

```bash
cd frontend && npm run build
cd ../backend && SAFECIRCLE_STATIC_DIR=../frontend/out .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000 (not `localhost`: the build's API base points at 127.0.0.1, and a different host name is a
different origin). Split dev mode is unchanged (README).

## 7. Chrome extension

`chrome://extensions` → Developer mode → Load unpacked → `extension/`. Right-click a link or selected text, or use the
toolbar popup. Options: server address, timeout, link guard (asks for site access when switched on). Manual check
still needed: load it in your Chrome, right-click `https://paypal.com.account-verify-secure.top/webscr?cmd=login`
on any page and confirm the warning page, *Go back* and the ticked *Open anyway*; then enable the link guard and
click a look-alike link on a test page.

## 8. 90-second demo script

See the table in [scam-dna.md](scam-dna.md#judge-demo-90-seconds).

## 9. Tests (actual runs, 2026-10-12)

| Suite | Command | Result |
|---|---|---|
| Backend (SQLite) | `cd backend && python -m pytest -q` | 122 passed, 0 failed, 0 skipped (63 original + 59 new; OCR tests ran with Tesseract 5.5.3) |
| Extension unit + live integration | `BACKEND_URL=http://127.0.0.1:8000 node --test extension/tests/` | 18 passed, 0 failed, 0 skipped |
| Frontend type check | `npx tsc --noEmit` | passed |
| Production build | `npm run build` | passed, 12 routes |
| Original browser E2E | `node e2e/e2e.mjs` | 18/18 passed |
| Scam DNA browser E2E | `node e2e/scamdna.mjs` | 21/21 passed |
| Guardian Shield pages E2E | `node e2e/extension-pages.mjs` | 17/17 passed |
| Synthetic evaluation | `python evaluation/scam_dna/evaluate_scam_dna.py` | see below |

E2E suites ran against the built site served by FastAPI on a scratch database, with Google Chrome 155.
`e2e/extension.mjs` (loads the unpacked extension) could not run: branded Chrome ignores `--load-extension`.
Lint is still not configured in this project.

Evaluation (30 synthetic scenarios, written by the same team, not independent): initial run P 0.800, R 0.889, FPR 0.333;
after fixes P 0.944, R 0.944, FPR 0.083 (1 false positive: genuine merchant collect request; 1 false negative: novel
recruitment hook). Details: [evaluation/scam_dna/README.md](../evaluation/scam_dna/README.md).

## 10. Known limitations and manual checks

- Real extension runtime and link guard not exercised by automation (see 7).
- English only. Rules miss new scripts until a known stage appears (S18).
- Text alone cannot tell a genuine merchant collect request from a scam (B08).
- Risk scores are uncalibrated heuristics; the evaluation set is small and synthetic.
- Link guard does not see script-driven navigation, typed addresses or modifier-clicks.
- In-process rate limiter; PostgreSQL migration only checked in CI.

## 11. Simulated or external-data dependent

All scenario and campaign cases are synthetic DEMO DATA; the globe is a labelled demo; no threat-intelligence feed,
bank, UPI or wallet integration exists; overview counts are real counts of local cases (mostly demo cases in a demo).

## 12. Recommended next steps before submission

1. Load the extension unpacked in your Chrome and do the manual check in section 7.
2. Rebuild the frontend if you change `frontend/.env.local`, and serve from the same host name it points at.
3. Re-record screenshots for the slides and paper (the `docs/screenshots` set predates this upgrade).
4. Review and merge the branch; CI will run the PostgreSQL migration and OCR tests.
5. If time allows: Hindi/Hinglish phrases for the financial rules, and a held-out scenario set written by someone else.
