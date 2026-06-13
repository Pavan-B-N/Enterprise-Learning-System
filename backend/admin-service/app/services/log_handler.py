"""Log handler — DB-side helpers for the centralized telemetry log store."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.db.mongo import get_db

LOG_COLLECTION = "telemetry_logs"
TTL_DAYS = 30


async def ensure_indexes() -> None:
    db = get_db()
    coll = db[LOG_COLLECTION]
    await coll.create_index("service")
    await coll.create_index("level")
    await coll.create_index("raid")
    await coll.create_index("user_id")
    await coll.create_index([("service", 1), ("level", 1), ("created_at", -1)])
    await coll.create_index([("raid", 1), ("timestamp", 1)])
    await coll.create_index("created_at", expireAfterSeconds=TTL_DAYS * 24 * 60 * 60)


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(timezone.utc)


async def ingest(entries: list[dict]) -> int:
    if not entries:
        return 0
    docs = []
    now = datetime.now(timezone.utc)
    for e in entries:
        docs.append({
            "service": e.get("service") or "unknown",
            "level": e.get("level") or "info",
            "message": e.get("message") or "",
            "timestamp": _parse_ts(e.get("timestamp")),
            "raid": e.get("raid"),
            "user_id": e.get("user_id"),
            "status_code": e.get("status_code"),
            "response_time": e.get("response_time"),
            "path": e.get("path"),
            "method": e.get("method"),
            "ip": e.get("ip"),
            "user_agent": e.get("user_agent"),
            "meta": e.get("meta"),
            "created_at": now,
        })
    db = get_db()
    result = await db[LOG_COLLECTION].insert_many(docs, ordered=False)
    return len(result.inserted_ids)


async def query(filters: dict) -> dict:
    db = get_db()
    coll = db[LOG_COLLECTION]

    f: dict = {}
    if filters.get("service"): f["service"] = filters["service"]
    if filters.get("level"): f["level"] = filters["level"]
    if filters.get("raid"): f["raid"] = filters["raid"]
    if filters.get("user_id"): f["user_id"] = filters["user_id"]

    frm, to = filters.get("from"), filters.get("to")
    if frm or to:
        f["created_at"] = {}
        if frm: f["created_at"]["$gte"] = _parse_ts(frm)
        if to: f["created_at"]["$lte"] = _parse_ts(to)

    if filters.get("search"):
        f["message"] = {"$regex": re.escape(filters["search"]), "$options": "i"}

    page = max(1, int(filters.get("page", 1) or 1))
    limit = min(200, max(1, int(filters.get("limit", 50) or 50)))

    cursor = coll.find(f).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
    logs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("timestamp"), datetime): doc["timestamp"] = doc["timestamp"].isoformat()
        if isinstance(doc.get("created_at"), datetime): doc["created_at"] = doc["created_at"].isoformat()
        logs.append(doc)

    total = await coll.count_documents(f)
    return {
        "logs": logs,
        "pagination": {
            "page": page, "limit": limit, "total": total,
            "pages": (total + limit - 1) // limit if total else 0,
        },
    }


async def trace_by_raid(raid: str) -> dict:
    db = get_db()
    coll = db[LOG_COLLECTION]
    cursor = coll.find({"raid": raid}).sort("timestamp", 1)

    logs: list[dict] = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("timestamp"), datetime): doc["timestamp"] = doc["timestamp"].isoformat()
        if isinstance(doc.get("created_at"), datetime): doc["created_at"] = doc["created_at"].isoformat()
        logs.append(doc)

    by_service: dict[str, list] = {}
    for log in logs:
        svc = log.get("service") or "unknown"
        by_service.setdefault(svc, []).append(log)

    services = list(by_service.keys())
    started = logs[0]["timestamp"] if logs else None
    ended = logs[-1]["timestamp"] if logs else None
    total_ms = 0
    if started and ended:
        total_ms = int((datetime.fromisoformat(ended) - datetime.fromisoformat(started)).total_seconds() * 1000)

    return {
        "raid": raid,
        "summary": {
            "total_logs": len(logs),
            "services": services,
            "service_count": len(services),
            "total_duration_ms": total_ms,
            "has_errors": any(l.get("level") == "error" for l in logs),
            "started_at": started,
            "ended_at": ended,
        },
        "timeline": logs,
        "by_service": by_service,
    }


async def get_stats(hours: int = 24) -> dict:
    db = get_db()
    coll = db[LOG_COLLECTION]
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    by_service_cur = coll.aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$service", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ])
    by_service = {doc["_id"]: doc["count"] async for doc in by_service_cur}

    by_level_cur = coll.aggregate([
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$level", "count": {"$sum": 1}}},
    ])
    by_level = {doc["_id"]: doc["count"] async for doc in by_level_cur}

    total = await coll.count_documents({"created_at": {"$gte": since}})
    errors = await coll.count_documents({"created_at": {"$gte": since}, "level": "error"})

    recent_raids_cur = coll.aggregate([
        {"$match": {"created_at": {"$gte": since}, "raid": {"$ne": None}}},
        {"$group": {
            "_id": "$raid",
            "started_at": {"$min": "$timestamp"},
            "services": {"$addToSet": "$service"},
            "log_count": {"$sum": 1},
            "has_errors": {"$max": {"$cond": [{"$eq": ["$level", "error"]}, 1, 0]}},
        }},
        {"$sort": {"started_at": -1}},
        {"$limit": 25},
    ])
    recent_raids = []
    async for doc in recent_raids_cur:
        recent_raids.append({
            "raid": doc["_id"],
            "started_at": doc["started_at"].isoformat() if isinstance(doc["started_at"], datetime) else doc["started_at"],
            "services": doc["services"],
            "log_count": doc["log_count"],
            "has_errors": bool(doc["has_errors"]),
        })

    return {
        "period_hours": hours,
        "total_logs": total,
        "error_count": errors,
        "error_rate": f"{(errors / total * 100):.2f}%" if total else "0%",
        "by_service": by_service,
        "by_level": by_level,
        "recent_raids": recent_raids,
    }


async def purge(older_than_days: int = 30) -> int:
    db = get_db()
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    result = await db[LOG_COLLECTION].delete_many({"created_at": {"$lt": cutoff}})
    return result.deleted_count
