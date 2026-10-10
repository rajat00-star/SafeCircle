from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import get_settings


class MessageIn(BaseModel):
    text: str = Field(..., min_length=1, description="Message, email or chat text to check")
    explain_with_ai: bool = Field(False, description="Ask the optional AI layer for a plain-language summary")

    @field_validator("text")
    @classmethod
    def _limit(cls, v: str) -> str:
        v = v.replace("\x00", "")
        if not v.strip():
            raise ValueError("text must not be blank")
        if len(v) > get_settings().max_text_chars:
            raise ValueError(f"text is longer than {get_settings().max_text_chars} characters")
        return v


class UrlIn(BaseModel):
    url: str = Field(..., min_length=3)

    @field_validator("url")
    @classmethod
    def _limit(cls, v: str) -> str:
        v = v.strip()
        if len(v) > get_settings().max_url_chars:
            raise ValueError("url is too long")
        if any(c.isspace() for c in v):
            raise ValueError("url must not contain spaces")
        return v


class Evidence(BaseModel):
    text: str
    start: int | None = None
    end: int | None = None
    rule: str


class CategoryOut(BaseModel):
    code: str
    title: str
    explanation: str
    weight: float
    evidence: list[Evidence]


class UrlSignalOut(BaseModel):
    code: str
    title: str
    detail: str
    weight: float


class UrlOut(BaseModel):
    url: str
    hostname: str
    registered_domain: str
    risk_score: int
    signals: list[UrlSignalOut]
    start: int | None = None
    end: int | None = None


class MlOut(BaseModel):
    probability: float
    top_terms: list[str]
    model_version: str


class AnalysisOut(BaseModel):
    kind: Literal["message", "url"]
    risk_score: int = Field(..., ge=0, le=100)
    risk_level: Literal["low", "medium", "high"]
    verdict: str
    categories: list[CategoryOut]
    combinations: list[str]
    urls: list[UrlOut]
    ml: MlOut | None
    recommendations: list[str]
    redacted_excerpt: str
    engine_version: str
    processing_ms: float
    ai_summary: str | None = None
    ai_status: str = "disabled"
    stored: bool = False
    analysis_id: str | None = None
    alert_ticket: str


class ProfileCreate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=60)

    @field_validator("display_name")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("display_name must not be blank")
        return v


class SettingsIn(BaseModel):
    store_history: bool | None = None
    store_excerpts: bool | None = None
    retention_days: int | None = Field(None, ge=1, le=365)
    display_name: str | None = Field(None, min_length=1, max_length=60)


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    display_name: str
    created_at: datetime
    store_history: bool
    store_excerpts: bool
    retention_days: int


class ProfileCreated(ProfileOut):
    token: str = Field(..., description="Shown once. Store it on the device; the server keeps only a hash.")


class AnalysisRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    kind: str
    risk_score: int
    risk_level: str
    categories: list[str]
    redacted_excerpt: str | None
    engine_version: str


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    relationship_label: str | None = Field(None, max_length=40)


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    relationship_label: str | None
    status: str
    created_at: datetime
    invite_expires_at: datetime
    consented_at: datetime | None
    ended_at: datetime | None


class ContactCreated(ContactOut):
    invite_url: str = Field(..., description="Shown once. Send it to the contact yourself.")


class InviteInfo(BaseModel):
    requester_name: str
    contact_name: str
    status: str
    invite_expires_at: datetime
    what_you_will_receive: list[str]
    what_you_will_not_receive: list[str]


class AlertCreate(BaseModel):
    alert_ticket: str = Field(..., max_length=4000)
    contact_ids: list[str] = Field(..., min_length=1, max_length=5)
    note: str | None = Field(None, max_length=280)
    include_excerpt: bool = False


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    risk_score: int
    risk_level: str
    categories: list[str]
    note: str | None
    redacted_excerpt: str | None
    acknowledged_at: datetime | None


class AlertSent(BaseModel):
    sent_to: list[str]
    skipped: list[dict]


class GuardianInbox(BaseModel):
    requester_name: str
    contact_name: str
    status: str
    alerts: list[AlertOut]
