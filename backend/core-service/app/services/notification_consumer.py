"""Notifications consumer.

Subscribes to queue `els-notifications`. On each message:
1. Persists a notification document into MongoDB (`notifications` collection).
2. Publishes to Redis channel `els:ws:user:{user_id}` so the gateway pushes
   it to any open WebSocket for that user.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from bson import ObjectId

from app.config import settings
from app.db.mongo import get_db
from app.services.redis_pub import RedisPublisher
from app.services.servicebus import ServiceBusConsumer

logger = logging.getLogger(__name__)

redis_pub = RedisPublisher(settings.REDIS_URL)


def _serialize(doc: dict) -> dict:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    if isinstance(out.get("user_id"), ObjectId):
        out["user_id"] = str(out["user_id"])
    ts = out.get("created_at")
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        out["created_at"] = ts.isoformat()
    return out


async def handle(subject: str, data: dict) -> None:
    if subject != "notification.create":
        logger.info("[notifications] ignoring subject=%s", subject)
        return

    raw_user = data.get("user_id")
    if not raw_user:
        logger.warning("notification.create missing user_id")
        return

    user_oid = ObjectId(raw_user) if ObjectId.is_valid(raw_user) else raw_user

    doc = {
        "user_id": user_oid,
        "type": (data.get("type") or "info").strip(),
        "title": (data.get("title") or "").strip(),
        "message": (data.get("message") or "").strip(),
        "metadata": data.get("metadata") or {},
        "read": False,
        "created_at": datetime.now(timezone.utc),
    }

    db = get_db()
    res = await db.notifications.insert_one(doc)
    doc["_id"] = res.inserted_id

    await redis_pub.push_to_user(str(raw_user), "notification", _serialize(doc))
    logger.info("[notifications] persisted+pushed type=%s user=%s", doc["type"], raw_user)


def make_consumer() -> ServiceBusConsumer:
    return ServiceBusConsumer(
        connection_string=settings.AZURE_SERVICE_BUS_CONNECTION_STRING,
        queue=settings.SB_QUEUE_NOTIFICATIONS,
        handler=handle,
        max_concurrency=4,
    )
