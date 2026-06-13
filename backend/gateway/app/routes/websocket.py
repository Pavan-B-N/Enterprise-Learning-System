"""WebSocket bridge.

Endpoint: GET /ws?token=<jwt>

Each connection:
1. Validates the JWT (same secret as REST), extracts user_id.
2. Subscribes to Redis channel `els:ws:user:{user_id}`.
3. Forwards every published payload (`{"event", "data"}`) verbatim to the
   browser as a JSON frame.
4. Sends a periodic `{"event": "ping"}` keepalive every 25s.

Backend services emit events via core-service's services/redis_pub.py.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import jwt
import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

PING_INTERVAL = 25.0


def _decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
    except jwt.InvalidTokenError:
        return None


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    payload = _decode_token(token) if token else None
    user_id = payload.get("sub") if payload else None

    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    if not settings.REDIS_URL:
        await websocket.accept()
        await websocket.send_json({"event": "error", "data": {"reason": "redis_unconfigured"}})
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return

    await websocket.accept()
    await websocket.send_json({"event": "ready", "data": {"user_id": user_id}})

    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    channel = f"els:ws:user:{user_id}"
    await pubsub.subscribe(channel)

    async def _ping_loop():
        try:
            while True:
                await asyncio.sleep(PING_INTERVAL)
                await websocket.send_json({"event": "ping", "data": {}})
        except Exception:  # noqa: BLE001
            return

    async def _redis_loop():
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                raw = msg.get("data") or "{}"
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8", errors="ignore")
                try:
                    await websocket.send_text(raw)
                except Exception:  # noqa: BLE001
                    return
        except asyncio.CancelledError:
            raise

    ping_task = asyncio.create_task(_ping_loop())
    redis_task = asyncio.create_task(_redis_loop())

    try:
        # Read loop just keeps the connection alive and reacts to client closes.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("ws error: %s", exc)
    finally:
        ping_task.cancel()
        redis_task.cancel()
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            await redis_client.close()
        except Exception:  # noqa: BLE001
            pass
