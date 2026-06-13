"""Notification CRUD routes (core-service).

WebSocket push happens in services/notification_consumer.py; these endpoints
expose the persisted history so the UI can render the bell badge & dropdown.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

from app.db.mongo import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _user_id(request: Request) -> str:
    uid = request.headers.get("X-User-Id", "")
    if not uid:
        raise HTTPException(status_code=400, detail="missing X-User-Id")
    return uid


def _user_filter(uid: str) -> dict:
    return {"user_id": ObjectId(uid)} if ObjectId.is_valid(uid) else {"user_id": uid}


def _serialize(doc: dict) -> dict:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    if isinstance(out.get("user_id"), ObjectId):
        out["user_id"] = str(out["user_id"])
    ts = out.get("created_at")
    if isinstance(ts, datetime):
        # BSON Date round-trips as naive UTC. Attach tzinfo so isoformat()
        # emits an explicit '+00:00' offset and the browser doesn't parse
        # it as local time (otherwise IST users see ~5:30h skew).
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        out["created_at"] = ts.isoformat()
    return out


@router.get("")
async def list_notifications(request: Request, limit: int = 50, only_unread: bool = False):
    uid = _user_id(request)
    db = get_db()
    q = _user_filter(uid)
    if only_unread:
        q["read"] = False
    cursor = db.notifications.find(q).sort("created_at", -1).limit(max(1, min(limit, 200)))
    items = [_serialize(d) async for d in cursor]
    unread = await db.notifications.count_documents({**_user_filter(uid), "read": False})
    return {"items": items, "unread_count": unread}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, request: Request):
    uid = _user_id(request)
    if not ObjectId.is_valid(notif_id):
        raise HTTPException(status_code=400, detail="invalid id")
    db = get_db()
    res = await db.notifications.update_one(
        {"_id": ObjectId(notif_id), **_user_filter(uid)},
        {"$set": {"read": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="not_found")
    return {"ok": True}


@router.post("/mark-all-read")
async def mark_all_read(request: Request):
    uid = _user_id(request)
    db = get_db()
    res = await db.notifications.update_many(
        {**_user_filter(uid), "read": False}, {"$set": {"read": True}}
    )
    return {"ok": True, "updated": res.modified_count}
