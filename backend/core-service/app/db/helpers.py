"""Small db-side helpers shared across route modules.

Centralises the awkward bits:
* turning header user-id strings into `ObjectId` for filtering
* deriving the canonical primary role from `users.roles[]`
* serialising `_id` / nested ObjectIds for JSON responses
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId


def to_oid(value: Any) -> ObjectId | None:
    """Best-effort conversion to ObjectId. Returns None if not convertible."""
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str) and ObjectId.is_valid(value):
        return ObjectId(value)
    return None


def oid_filter(field: str, value: Any) -> dict:
    """Build a Mongo filter that works whether the stored value is ObjectId or str."""
    oid = to_oid(value)
    if oid is None:
        return {field: value}
    # Most of our seed data stores ObjectId, but some legacy writes still emit
    # strings. Match either.
    return {field: {"$in": [oid, str(oid)]}}


def primary_role(user: dict) -> str:
    """Pick the most privileged role from `users.roles[]`."""
    roles = user.get("roles") or ([user["role"]] if user.get("role") else [])
    if not roles:
        return "learner"
    for priv in ("admin", "manager", "learner"):
        if priv in roles:
            return priv
    return roles[0]


def serialize_doc(doc: dict | None) -> dict | None:
    """Top-level ObjectId/datetime → JSON-friendly conversion."""
    if doc is None:
        return None
    out: dict[str, Any] = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [
                str(x) if isinstance(x, ObjectId)
                else x.isoformat() if isinstance(x, datetime)
                else x
                for x in v
            ]
        else:
            out[k] = v
    return out
