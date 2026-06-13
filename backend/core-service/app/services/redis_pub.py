"""Redis pub/sub bridge for live WebSocket events.

Any backend service can publish to channel `els:ws:user:{user_id}` with
payload `{"event": str, "data": dict}` and the gateway's WS handler will
forward it to the right user's open sockets.

Used by core-service to push notifications to clients in real time as soon
as they're persisted.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


class RedisPublisher:
    def __init__(self, url: str) -> None:
        self._url = url
        self._client: aioredis.Redis | None = None

    async def _get(self) -> aioredis.Redis | None:
        if not self._url:
            return None
        if self._client is None:
            self._client = aioredis.from_url(self._url, decode_responses=True)
        return self._client

    async def push_to_user(self, user_id: str, event: str, data: dict[str, Any]) -> None:
        client = await self._get()
        if client is None:
            return
        channel = f"els:ws:user:{user_id}"
        payload = json.dumps({"event": event, "data": data})
        try:
            await client.publish(channel, payload)
        except Exception as exc:  # noqa: BLE001
            logger.error("redis publish failed: %s", exc)

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
