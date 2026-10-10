# Single deployable image: Next.js static site + FastAPI API.
ARG NODE_IMAGE=node:22-alpine
ARG PYTHON_IMAGE=python:3.13-slim
FROM ${NODE_IMAGE} AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${PYTHON_IMAGE} AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    SAFECIRCLE_STATIC_DIR=/app/site SAFECIRCLE_TRUST_PROXY_HEADERS=true
WORKDIR /app
COPY backend/requirements.txt backend/requirements-ai.txt ./
ARG WITH_AI=false
RUN pip install -r requirements.txt && if [ "$WITH_AI" = "true" ]; then pip install -r requirements-ai.txt; fi
COPY backend/ ./
COPY --from=web /web/out /app/site
RUN useradd --create-home --uid 10001 app && chown -R app /app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/v1/health')"
# Apply migrations, then serve. PORT is provided by most hosting platforms.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
