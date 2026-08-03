"""SQLModel data models for Echo's personal assistant persistence."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.utcnow()


class Note(SQLModel, table=True):
    """Personal notes saved by the user."""

    __tablename__ = "notes"

    id: Optional[int] = Field(default=None, primary_key=True)
    text: str = Field(index=False)
    created_at: datetime = Field(default_factory=_utcnow)


class ChatSession(SQLModel, table=True):
    """A single voice conversation session with the agent."""

    __tablename__ = "chat_sessions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    room_name: str = Field(index=True)
    participant_identity: Optional[str] = Field(default=None, index=True)
    model_mode: Optional[str] = Field(default=None)
    started_at: datetime = Field(default_factory=_utcnow)
    ended_at: Optional[datetime] = Field(default=None)


class ChatMessage(SQLModel, table=True):
    """An individual turn within a chat session (user or assistant)."""

    __tablename__ = "chat_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: UUID = Field(foreign_key="chat_sessions.id", index=True)
    role: str = Field(index=True)  # "user" | "assistant"
    content: str
    created_at: datetime = Field(default_factory=_utcnow)
    tool_calls: Optional[str] = Field(default=None)  # JSON, optional
    tool_results: Optional[str] = Field(default=None)  # JSON, optional


class KnowledgeDoc(SQLModel, table=True):
    """RAG-ingested documents for the knowledge base."""

    __tablename__ = "knowledge_docs"

    id: Optional[int] = Field(default=None, primary_key=True)
    source: str  # "upload", "url", "manual"
    title: str
    content_hash: str = Field(index=True, unique=True)
    chunk_count: int = Field(default=0)
    metadata_: Optional[str] = Field(default=None, alias="metadata")  # JSON
    created_at: datetime = Field(default_factory=_utcnow)
