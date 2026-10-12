# Project status

Last updated: 2026-10-12. Submission deadline: 2026-10-12.

## Advanced features: UPI Scam Guard, evidence report, scam network (2026-10-12)

| Area | Evidence |
|---|---|
| UPI Scam Guard (`/upi/`, `POST /upi/check`), in-browser QR decoding | `tests/test_upi_guard.py` 22/22; e2e decodes a demo QR image in Chrome |
| Evidence report (`/cases/report/`, `/cases/{id}/report[.md]`) | `tests/test_report_network.py` (report part); e2e checks review gating, Markdown/JSON downloads and the print view |
| Scam network graph (`/network/`, `GET /network`) | `tests/test_report_network.py` (graph part); e2e checks the graph, the filters and node details |
| Whole suite | backend 152/152; extension 18/18 (extension code unchanged); type-check and static build pass; e2e `advanced.mjs` 30/30, `e2e.mjs` 18/18, `scamdna.mjs` 21/21, `extension-pages.mjs` 17/17, run against a scratch database |
| Not done | Voice analyzer (needs a speech-to-text model); adaptive risk engine already existed. No migration or new dependency. `next lint` has no ESLint config in the repo, so it was not run |

Details and the feature-gap assessment: [docs/advanced-features.md](docs/advanced-features.md).

## Problem Statement 02 upgrade (2026-10-12)

| Area | Evidence |
|---|---|
| Scam DNA case engine, alert de-duplication, Campaign Radar, Forensics with local OCR, demo fixtures | `backend/app/scamdna`; 122 backend tests pass (63 original + 59 new) |
| Alembic migration `a336d9eb6fd1` (additive) | upgrade, downgrade and re-upgrade run on SQLite; `alembic check` clean. Not yet run on PostgreSQL (CI does) |
| Frontend: Overview, Scam DNA, Forensics, Campaign Radar, Browser Protection | type-check and static build pass; `e2e/scamdna.mjs` 21/21 and original `e2e/e2e.mjs` 18/18 against the built site |
| Guardian Shield extension | `extension/tests` 18/18 (3 against the live server); `e2e/extension-pages.mjs` 17/17 runs the extension pages in Chrome with a stubbed `chrome.*`. Loading it unpacked in a real extension runtime could not be automated (Chrome 137+ ignores `--load-extension`) |
| Synthetic evaluation | `evaluation/scam_dna/` 30 scenarios; initial and post-fix results both committed |

Details: [docs/scam-dna.md](docs/scam-dna.md).

## Done and verified

| Area | Evidence |
|---|---|
| Detector (rules, link analysis, two local models, fusion, explanations) | 40 detector tests pass; evaluation in `evaluation/results/metrics.json` |
| FastAPI backend: analysis, profiles, privacy settings, history, export/delete, trusted contacts, consent, alerts, guardian inbox | 63 tests pass on SQLite and on PostgreSQL 16 (2026-10-10) |
| Alembic migration | `upgrade head` and `downgrade base` run on PostgreSQL 16 |
| Next.js dashboard (Check, History, Trusted contacts, Guardian, Privacy, How it works, Extension) | Type-check and static build pass; 18-step Playwright journey passes against a production-mode server on PostgreSQL, including mobile width and no console errors |
| Browser extension (MV3) | Loaded in Chromium; selected-text and link checks return results (`e2e/extension.mjs`). The toolbar popup's tab lookup was not exercised by the automated test |
| Optional Claude summary layer | Tested with a mocked client only (no API key available); disabled by default |
| Security controls | Rate limits, body limit, signed tickets, hashed tokens, headers/CSP, content-free logs: covered by tests or checked in responses |
| Clean-room install | Fresh venv from `requirements.txt` + `npm ci` + build + migrate + run: works |
| Docs | README, architecture, API (+ OpenAPI), threat model, privacy, deployment, methodology |
| Research paper | `paper/SafeCircle-Guardian-Paper.docx` (8 pages, 19 references, measured results only) |
| Presentation | `slides/SafeCircle-Guardian.pptx` (11 slides, real screenshots, native chart) |
| Idea document | `docs/submission/SafeCircle-Guardian-Idea.docx` |

## Measured results
Messages hybrid (≥ 30): P 0.947, R 0.953, F1 0.950, FPR 0.83%. Links (full URL): P 0.951, R 0.634, F1 0.761, FPR 3.26%.
Message analysis p50 0.69 ms in-process; HTTP p50 4.8 ms on localhost. Details: `docs/methodology.md`.

## Not verified / known limitations
- **Docker image build not run**: the container registry (Docker Hub and the ECR mirror) was unreachable from the build
  environment. The same steps were verified outside Docker (clean-room install). First real build will happen on the host.
- **Not deployed yet**: needs a hosting account (see Blockers).
- English only; OCR needs a local Tesseract install; SMS benchmark is dated spam; benign URL sample is hostnames only; final test numbers are not fully
  blind (see methodology).
- In-process rate limiter (per instance). No account recovery by design.

## Blockers (need the project owner)
1. **GitHub**: no GitHub account is linked to this workspace, so the repository can't be published. Connect GitHub and
   create an empty repository (e.g. `safecircle-guardian`).
2. **Hosting**: a Render account (free tier works) connected to that GitHub repository, then New → Blueprint. Any container
   host works; see `docs/deployment.md`.
