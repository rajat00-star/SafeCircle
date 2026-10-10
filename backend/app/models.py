"""Database models. Raw message text is never stored; see docs/privacy.md."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Privacy settings (all off by default)
    store_history: Mapped[bool] = mapped_column(Boolean, default=False)
    store_excerpts: Mapped[bool] = mapped_column(Boolean, default=False)
    retention_days: Mapped[int] = mapped_column(Integer, default=30)

    analyses: Mapped[list[Analysis]] = relationship(back_populates="profile", cascade="all, delete-orphan")
    contacts: Mapped[list[TrustedContact]] = relationship(back_populates="profile", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    kind: Mapped[str] = mapped_column(String(10))
    risk_score: Mapped[int] = mapped_column(Integer)
    risk_level: Mapped[str] = mapped_column(String(10))
    categories: Mapped[list] = mapped_column(JSON, default=list)
    content_sha256: Mapped[str] = mapped_column(String(64))
    redacted_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    engine_version: Mapped[str] = mapped_column(String(20))

    profile: Mapped[Profile] = relationship(back_populates="analyses")


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    relationship_label: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # pending -> active (contact consented) | declined | revoked (by either side) | expired
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    access_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    invite_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped[Profile] = relationship(back_populates="contacts")
    alerts: Mapped[list[Alert]] = relationship(back_populates="contact", cascade="all, delete-orphan")
    events: Mapped[list[ConsentEvent]] = relationship(back_populates="contact", cascade="all, delete-orphan")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    contact_id: Mapped[str] = mapped_column(ForeignKey("trusted_contacts.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    risk_score: Mapped[int] = mapped_column(Integer)
    risk_level: Mapped[str] = mapped_column(String(10))
    categories: Mapped[list] = mapped_column(JSON, default=list)
    note: Mapped[str | None] = mapped_column(String(280), nullable=True)
    redacted_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    contact: Mapped[TrustedContact] = relationship(back_populates="alerts")


class ConsentEvent(Base):
    """Append-only audit trail of consent decisions for a trusted-contact link."""

    __tablename__ = "consent_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contact_id: Mapped[str] = mapped_column(ForeignKey("trusted_contacts.id", ondelete="CASCADE"), index=True)
    event: Mapped[str] = mapped_column(String(30))
    actor: Mapped[str] = mapped_column(String(10))  # "user" | "contact" | "system"
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    contact: Mapped[TrustedContact] = relationship(back_populates="events")
