"""Environment-based configuration. Every setting can be overridden with an
environment variable of the same name prefixed with SAFECIRCLE_."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SAFECIRCLE_", env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "sqlite:///./safecircle.db"
    # Used to sign alert tickets. MUST be set to a long random value in production.
    secret_key: str = Field(default="dev-only-insecure-secret-change-me", min_length=16)
    cors_origins: str = "http://localhost:3000"
    public_base_url: str = ""             # used in invite links; empty = the address the request came to
    static_dir: str = ""                 # path to the exported Next.js site; empty = API only

    max_text_chars: int = 5000
    max_url_chars: int = 2048
    rate_limit_per_minute: int = 60      # per client IP, analysis endpoints
    alert_limit_per_hour: int = 10       # per profile
    invite_ttl_hours: int = 72
    alert_ticket_ttl_minutes: int = 60
    max_contacts: int = 5
    trust_proxy_headers: bool = False    # set true behind a trusted reverse proxy (Render, Fly, etc.)

    # Optional LLM explanation layer. Disabled unless a provider and key are configured.
    llm_provider: str = "none"           # "none" | "anthropic"
    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-5-5"
    llm_timeout_seconds: float = 8.0

    log_level: str = "INFO"

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production and s.secret_key.startswith("dev-only"):
        raise RuntimeError("SAFECIRCLE_SECRET_KEY must be set in production")
    return s
