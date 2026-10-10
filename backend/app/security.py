"""Tokens, authentication dependencies, signed alert tickets and rate limiting."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time
from collections import deque

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import Profile


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    # Tokens are 256-bit random values, so a fast hash is sufficient (no dictionary attack possible).
    return hashlib.sha256(token.encode()).hexdigest()


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def optional_profile(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> Profile | None:
    token = _bearer(authorization)
    if not token:
        return None
    profile = db.scalar(select(Profile).where(Profile.token_hash == hash_token(token)))
    if profile is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired profile token")
    return profile


def require_profile(profile: Profile | None = Depends(optional_profile)) -> Profile:
    if profile is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Create a profile first (POST /api/v1/profiles)",
                            headers={"WWW-Authenticate": "Bearer"})
    return profile


# ---------- Signed alert tickets ----------
# The analysis result is not stored unless the user enabled history. To let the
# user forward a result to a trusted contact anyway, /analyze returns a short-lived
# HMAC-signed ticket holding only the summary. The server can verify it was produced
# by the detector (not forged by the client) without keeping the message.

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_ticket(payload: dict) -> str:
    s = get_settings()
    body = dict(payload, exp=int(time.time()) + s.alert_ticket_ttl_minutes * 60)
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(s.secret_key.encode(), raw, hashlib.sha256).digest()
    return _b64(raw) + "." + _b64(sig)


def verify_ticket(ticket: str) -> dict:
    s = get_settings()
    try:
        raw_b64, sig_b64 = ticket.split(".", 1)
        raw = _unb64(raw_b64)
        sig = _unb64(sig_b64)
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed alert ticket")
    expected = hmac.new(s.secret_key.encode(), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alert ticket signature is invalid")
    body = json.loads(raw)
    if body.get("exp", 0) < time.time():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alert ticket expired; analyse the message again")
    return body


# ---------- Rate limiting ----------

class SlidingWindowLimiter:
    """In-process sliding-window limiter.

    Good for a single instance. For horizontal scaling swap in a shared store
    (e.g. Redis INCR with expiry); see docs/deployment.md.
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: float) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > window_seconds:
                q.popleft()
            if len(q) >= limit:
                retry = int(window_seconds - (now - q[0])) + 1
                return False, retry
            q.append(now)
            if len(self._hits) > 50_000:  # bound memory under abuse
                self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < window_seconds}
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(scope: str, per_minute: int | None = None):
    def dependency(request: Request) -> None:
        limit = per_minute or get_settings().rate_limit_per_minute
        ok, retry = limiter.check(f"{scope}:{client_ip(request)}", limit, 60)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests, slow down",
                                headers={"Retry-After": str(retry)})
    return dependency
