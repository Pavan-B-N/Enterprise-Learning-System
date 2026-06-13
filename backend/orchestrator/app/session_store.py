"""
Redis-backed multi-turn session store.

A "session" represents a single user-facing question that may span multiple
specialist round-trips. We persist enough state to resume after a user
clarification reply (which arrives as a brand-new HTTP request to /chat).

Key shape: ``els:session:<session_id>``  →  JSON document, TTL = SESSION_TTL_SECONDS.

Document fields:
    session_id        unique id for this user-facing turn
    user_id           subject of the request
    role              learner | manager | admin
    correlation_id    upstream correlation id (for log stitching)
    route             specialist route (curator | assessment | ...)
    targeted_agent    if caller pinned the route (constrains re-grounding scope)
    output_format     caller-provided output format directive (or "")
    a2a_task_id       Foundry-assigned A2A task id; lets us continue the same
                      conversational thread on follow-up turns
    initial_payload   the original [DATA]+[QUERY] sent to the specialist
                      (kept for diagnostics; specialist already has it
                      server-side via task state)
    pending_needs     list of Need dicts the specialist asked for that we
                      surfaced to the user
    turn_count        number of specialist turns consumed so far
    user_message      original user message (for re-grounding context)
    created_at / updated_at  ISO-8601 timestamps
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as redis_asyncio

from app.config import settings

logger = logging.getLogger(__name__)

_KEY_PREFIX = "els:session:"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class Session:
    session_id: str
    user_id: str
    role: str
    route: str
    user_message: str
    correlation_id: str = ""
    targeted_agent: str = ""
    output_format: str = ""
    a2a_task_id: str = ""
    initial_payload: str = ""
    pending_needs: list[dict[str, Any]] = field(default_factory=list)
    turn_count: int = 0
    created_at: str = field(default_factory=_now_iso)
    updated_at: str = field(default_factory=_now_iso)

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "Session":
        return cls(**json.loads(raw))


class SessionStore:
    """Async Redis client wrapper for multi-turn task state."""

    def __init__(self, url: str | None = None, ttl: int | None = None) -> None:
        self._url = url or settings.REDIS_URL
        self._ttl = ttl or settings.SESSION_TTL_SECONDS
        self._client: redis_asyncio.Redis | None = None

    async def _conn(self) -> redis_asyncio.Redis:
        if self._client is None:
            self._client = redis_asyncio.from_url(
                self._url, encoding="utf-8", decode_responses=True
            )
        return self._client

    @staticmethod
    def new_id() -> str:
        return uuid.uuid4().hex

    async def create(self, **kwargs: Any) -> Session:
        sess = Session(session_id=self.new_id(), **kwargs)
        await self.save(sess)
        logger.info("session %s created (route=%s)", sess.session_id, sess.route)
        return sess

    async def save(self, sess: Session) -> None:
        sess.updated_at = _now_iso()
        client = await self._conn()
        await client.set(_KEY_PREFIX + sess.session_id, sess.to_json(), ex=self._ttl)

    async def get(self, session_id: str) -> Session | None:
        if not session_id:
            return None
        client = await self._conn()
        raw = await client.get(_KEY_PREFIX + session_id)
        if raw is None:
            return None
        try:
            return Session.from_json(raw)
        except (json.JSONDecodeError, TypeError) as exc:
            logger.warning("session %s corrupt: %s", session_id, exc)
            return None

    async def delete(self, session_id: str) -> None:
        if not session_id:
            return
        client = await self._conn()
        await client.delete(_KEY_PREFIX + session_id)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


# Module-level singleton — every route handler shares one Redis connection pool.
session_store = SessionStore()
