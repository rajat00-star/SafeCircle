# SafeCircle Guardian

**Explainable scam, phishing and social-engineering protection with consent-based trusted contacts.**
HackBriven 2026 · Cybersecurity & Digital Trust track.

Paste a message or a link. SafeCircle highlights the exact words and link features that look like a scam
(urgency, impersonation, OTP/PIN requests, payment pressure, threats, secrecy, look-alike domains…),
explains each one in plain language, tells you what to do, and lets you ask someone you trust for a second
opinion. Their help is opt-in on both sides.

| | |
|---|---|
| ![Result](docs/screenshots/02-scam-result.png) | ![Trusted contact inbox](docs/screenshots/08-guardian-inbox.png) |

## What works today

- **Message and link analysis** (`POST /api/v1/analyze/message`, `/analyze/url`): 12 tactic categories with evidence spans,
  static link inspection (never fetches the link), a local language model and a local domain model. No paid AI API needed.
- **Explanations and recommendations** for every finding, including reporting channels (India 1930 / cybercrime.gov.in, US FTC, UK 7726).
- **Trusted contacts with two-sided consent**: invite link → contact sees exactly what they will and won't receive →
  accept/decline → user explicitly sends an alert → either side can end it. Every decision is in an audit trail.
- **Privacy controls**: nothing stored by default; opt-in history; opt-in redacted excerpts; retention 1–365 days;
  export and delete-everything.
- **Browser extension (Manifest V3)**: right-click a link or selected text, or check the current tab. No page access in the background.
- **Optional AI summary** (Claude, off by default) that can never change the score; untrusted text is delimited and redacted.
- **Security controls**: input validation, rate limits, body-size limit, signed alert tickets, hashed tokens,
  security headers/CSP, structured logs without content.

## Measured results (held-out test data, reproducible)

| Setting | Precision | Recall | F1 | FPR |
|---|---|---|---|---|
| Messages, full detector (score ≥ 30) | 0.947 | 0.953 | 0.950 | 0.83% |
| Messages, full detector (score ≥ 60) | 1.000 | 0.638 | 0.779 | 0.00% |
| Links, rules + domain model (full URL) | 0.951 | 0.634 | 0.761 | 3.26% |
| Links, rules + domain model (hostname only) | 0.949 | 0.609 | 0.742 | 3.26% |

Messages: SMS Spam Collection test split (1,115 messages). Links: 5,000 reported phishing URLs vs 5,000 popular
hostnames. Median analysis time 0.69 ms per message (in-process). Full details, baselines and limitations in
[docs/methodology.md](docs/methodology.md) and [evaluation/results/metrics.json](evaluation/results/metrics.json).

## Quick start (local)

Requirements: Python 3.11+ (tested on 3.13), Node 20+ (tested on 22).

```bash
# Backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head                 # creates safecircle.db (SQLite)
uvicorn app.main:app --reload        # http://localhost:8000/api/docs

# Frontend (second terminal)
cd frontend
npm ci
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev   # http://localhost:3000
```

Single-process mode (what production runs): `cd frontend && npm run build`, then start the backend with
`SAFECIRCLE_STATIC_DIR=../frontend/out` and open http://localhost:8000.

With Docker: `SAFECIRCLE_SECRET_KEY=$(openssl rand -hex 32) docker compose up --build` (app + PostgreSQL).

## Tests

```bash
cd backend && python -m pytest -q                      # 63 unit/API tests (SQLite)
SAFECIRCLE_TEST_DATABASE_URL=postgresql+psycopg2://... python -m pytest -q   # same suite on PostgreSQL
cd e2e && npm i && BASE_URL=http://127.0.0.1:8000 CHROMIUM=/path/to/chrome node e2e.mjs        # 18 browser checks
CHROMIUM=/path/to/chrome node extension.mjs                                                      # extension checks
python evaluation/evaluate.py --benign-hosts <file>   # see evaluation/README.md
```

## Repository map

```
backend/        FastAPI app, detector, models, Alembic migrations, tests
  app/detector/ normalize.py, rules.py, url_analyzer.py, ml.py, engine.py, models/ (trained artifacts)
frontend/       Next.js 15 + TypeScript dashboard (static export served by the API)
extension/      Chrome/Edge Manifest V3 extension
evaluation/     training + evaluation scripts, datasets, results
e2e/            Playwright end-to-end and extension tests
docs/           architecture, API, threat model, privacy, deployment, methodology, screenshots
paper/          research paper (.docx, editable)    slides/  presentation (.pptx, editable)
```

## Documentation

[Architecture](docs/architecture.md) · [API](docs/api.md) · [Threat model](docs/threat-model.md) ·
[Privacy](docs/privacy.md) · [Deployment](docs/deployment.md) · [Methodology & evaluation](docs/methodology.md) ·
[Project status](STATUS.md) · [Security policy](SECURITY.md)

## What SafeCircle does not do

It does not read your SMS, WhatsApp, email or calls. Mobile platforms restrict that access (for example, Google Play only
allows SMS/Call Log permissions for default handler apps), and we do not try to get around it. You choose what to check.
No detector is perfect: a low score is not a guarantee.

## Licence

MIT. Datasets keep their own licences (see [LICENSE](LICENSE)).
