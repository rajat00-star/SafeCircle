# Deployment

The app ships as **one Docker image** (Next.js static site + FastAPI) plus PostgreSQL.

## Required environment

| Variable | Required | Notes |
|---|---|---|
| `SAFECIRCLE_ENV` | yes | `production` enables HSTS and refuses the default secret |
| `SAFECIRCLE_SECRET_KEY` | yes | ≥ 32 random bytes (`openssl rand -hex 32`); signs alert tickets |
| `SAFECIRCLE_DATABASE_URL` | yes | `postgresql+psycopg2://…` (`postgres://` is accepted and rewritten) |
| `SAFECIRCLE_TRUST_PROXY_HEADERS` | behind a proxy | `true` so rate limits use the real client IP |
| `SAFECIRCLE_PUBLIC_BASE_URL` | optional | public origin for invite links; defaults to the request origin |
| `SAFECIRCLE_LLM_PROVIDER` / `SAFECIRCLE_ANTHROPIC_API_KEY` | optional | enables AI summaries; build with `--build-arg WITH_AI=true` |
| `PORT` | set by host | defaults to 8000 |

The container runs `alembic upgrade head` on start, then uvicorn as a non-root user. Health check: `GET /api/v1/health`.

## Option A: Render (Blueprint)
1. Push this repository to GitHub.
2. Render dashboard → **New → Blueprint** → choose the repository. `render.yaml` creates the web service and a PostgreSQL
   database, generates `SAFECIRCLE_SECRET_KEY` and wires `SAFECIRCLE_DATABASE_URL`.
3. Wait for the deploy, then verify: `curl https://<service>.onrender.com/api/v1/health`.
Free-tier services sleep when idle and free databases expire after a limited period; use paid tiers for anything real.

## Option B: any container host (Fly.io, Railway, Google Cloud Run, Azure Container Apps)
Build with `docker build -t safecircle .`, provision PostgreSQL, set the variables above, expose port `$PORT`.
HTTPS is provided by the platform.

## Option C: a VM with Docker Compose
`SAFECIRCLE_SECRET_KEY=$(openssl rand -hex 32) PUBLIC_BASE_URL=https://your.domain docker compose up -d --build`
and put a TLS-terminating proxy (Caddy, nginx) in front.

## Post-deploy checks
```bash
BASE=https://your.domain
curl -s $BASE/api/v1/health                      # {"status":"ok",...,"message_model_loaded":true}
curl -s -X POST $BASE/api/v1/analyze/message -H 'content-type: application/json' \
  -d '{"text":"Share the OTP to unblock your account now"}' | jq .risk_level   # "high"
curl -sI $BASE/ | grep -i strict-transport-security
cd e2e && BASE_URL=$BASE CHROMIUM=/path/to/chrome node e2e.mjs   # full browser journey
```
Then set the extension's server address (extension options) to `$BASE`.

## Scaling
Run several replicas (stateless). Move rate limiting to Redis before scaling out (in-process limits are per replica).
Use a managed PostgreSQL with backups. Log to the platform's log drain; logs contain no message content.
