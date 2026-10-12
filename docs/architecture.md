# Architecture

```
 ┌───────────────┐   ┌──────────────────────┐
 │ Web dashboard │   │ Browser extension    │   user-initiated only
 │ Next.js (TS)  │   │ MV3: context menu,   │
 │ static export │   │ toolbar popup        │
 └──────┬────────┘   └──────────┬───────────┘
        │  HTTPS JSON (same origin)│ CORS: chrome-extension://
        ▼                          ▼
 ┌───────────────────────────────────────────────────────────┐
 │ FastAPI app (one container)                                │
 │  middleware: request id, size limit, security headers,     │
 │              content-free JSON logs, error handling        │
 │  routers: analyze · profiles/privacy · contacts/alerts ·   │
 │           guardian (contact side) · meta/health            │
 │  ┌──────────────── detector (pure Python) ───────────────┐ │
 │  │ normalize → rules (12 tactics, evidence spans)        │ │
 │  │          → URL extraction → static URL analysis       │ │
 │  │              (+ hostname char-n-gram model)           │ │
 │  │          → message model (TF-IDF + LR)                │ │
 │  │          → noisy-OR fusion → level, recommendations   │ │
 │  └────────────────────────────────────────────────────────┘ │
 │  optional: services/llm.py (Claude summary; never scores)  │
 └──────────────┬────────────────────────────────────────────┘
                │ SQLAlchemy 2 + Alembic
                ▼
        PostgreSQL (prod) / SQLite (dev, tests)
```

Since the Problem Statement 02 upgrade, a case layer sits on top of the detector: `app/scamdna` (tactics, evidence
redaction, case assessment, alert de-duplication, campaign correlation, local OCR, demo fixtures) with routers
`cases`, `forensics` and `demo`. The detector itself is unchanged. See [scam-dna.md](scam-dna.md).

## Design decisions

| Decision | Why |
|---|---|
| Deterministic detector decides the score; LLM optional | Works with no paid API, is reproducible, explainable, and immune to prompt injection in the scored path. |
| Static URL analysis, never fetch | Fetching attacker links from a server enables SSRF, confirms to the attacker that the link was opened, and is slow. |
| Noisy-OR fusion `1 − Π(1 − wᵢ)` | Independent tactics add up; each weight is visible and explainable; no single weak hint dominates. |
| Static Next.js export served by FastAPI | One deployable unit, same origin (no CORS, no third-party cookies), works on any container host. |
| Anonymous profiles with bearer tokens (SHA-256 stored) | No email/phone needed; minimal personal data; server can't recover tokens. |
| Contact tokens in the URL fragment (`#t=`) | Fragments are not sent to servers or in `Referer`, so access links don't leak into logs. |
| HMAC-signed alert tickets | Lets the user forward a result without the server storing the analysis, while preventing forged alert contents. |
| Model artifacts checked with SHA-256 before `joblib.load` | joblib unpickling can execute code; the hash pins the artifact to what training produced. |
| Case layer reuses, never modifies, the detector | Keeps the published detector evaluation valid; financial rules live in `scamdna/tactics.py`. |
| Assessment is a pure function of stored, redacted events | Cases can be re-evaluated at any time without the original text, and the engine is unit-testable without a database. |
| Screenshots read with local Tesseract, image discarded | No paid vision API, nothing leaves the server, nothing sensitive is retained. |
| Transparent correlation (exact indicators + Jaccard) | Every campaign link can be explained and dismissed; no model to justify. |

## Data model

`profiles` (display name, hashed token, privacy settings) → `analyses` (only when history is on: score, level,
category codes, content SHA-256, optional redacted excerpt) · `trusted_contacts` (status machine:
pending → active | declined | expired; active → revoked) → `alerts` (summary, optional note/excerpt, ack time) ·
`consent_events` (append-only audit) · `scam_cases` → `case_events` (redacted evidence, detection JSON, screenshot
facts) and `case_log` (append-only: evidence, reassessments, alert decisions, status changes) ·
`campaign_dismissals`. All child rows cascade-delete with the profile.

## Scaling path

- Stateless API: scale horizontally behind a load balancer; the detector is CPU-only (~1 ms/message).
- Replace the in-process rate limiter with Redis (`SlidingWindowLimiter` is the single seam).
- PostgreSQL via `SAFECIRCLE_DATABASE_URL`; migrations with Alembic.
- Model artifacts are versioned files; retrain with `evaluation/train_*.py` and redeploy.
- Notification channels (email/push) would plug in at `send_alert` without changing the consent model.
