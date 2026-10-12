"""SafeCircle Guardian API."""
from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .logging_config import configure_logging
from .routers import analyze, cases, contacts, demo, forensics, meta, profiles

settings = get_settings()
configure_logging(settings.log_level)
log = logging.getLogger("safecircle.api")

MAX_BODY_BYTES = 64 * 1024

app = FastAPI(
    title="SafeCircle Guardian API",
    version="1.0.0",
    description="Explainable scam, phishing and social-engineering detection with consent-based trusted contacts.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Browser extensions call the API from chrome-extension:// origins.
    allow_origin_regex=r"^(chrome|moz)-extension://[a-z0-9-]+$",
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Guardian-Token"],
    max_age=600,
)

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex
    started = time.perf_counter()
    length = request.headers.get("content-length")
    # Screenshot uploads get a larger cap, enforced again while streaming in the endpoint.
    limit = settings.max_upload_bytes if request.url.path == forensics.SCREENSHOT_PATH else MAX_BODY_BYTES
    if length and length.isdigit() and int(length) > limit:
        response = JSONResponse({"detail": "Request body too large"}, status_code=413)
    else:
        try:
            response = await call_next(request)
        except Exception:
            log.exception("unhandled_error", extra={"request_id": request_id, "path": request.url.path})
            response = JSONResponse({"detail": "Internal server error", "request_id": request_id}, status_code=500)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    else:
        response.headers["Content-Security-Policy"] = CSP
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Only method, route path, status and timing are logged: never bodies, query strings or tokens.
    log.info("request", extra={"request_id": request_id, "method": request.method, "path": request.url.path,
                               "status": response.status_code,
                               "duration_ms": round((time.perf_counter() - started) * 1000, 1)})
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse({"detail": "Invalid request", "errors": errors}, status_code=422)


@app.exception_handler(StarletteHTTPException)
async def http_error(_request: Request, exc: StarletteHTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


API_PREFIX = "/api/v1"
for r in (meta.router, analyze.router, profiles.router, contacts.router, cases.router, forensics.router, demo.router):
    app.include_router(r, prefix=API_PREFIX)

if settings.static_dir and Path(settings.static_dir).is_dir():
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="site")
