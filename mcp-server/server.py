"""
Enterprise Learning System — MCP Server
=======================================

Read-only MongoDB query tools exposed to AI agents via the Model Context
Protocol. Aligned to schema v5.0.0 (`backend/schemas.md`), 23 collections.

Security model
--------------
* **Read-only.** No tool inserts, updates or deletes. Anything an admin would do
  (create user, update role, etc.) is intentionally *not* exposed here.
* **Credentials are never readable.** The `user_credentials` collection is
  hard-blocked from every tool, including the generic `query_collection`
  escape hatch. Legacy `password_hash` keys, if they ever leak onto a `users`
  document, are also stripped before returning.
* **NoSQL injection guards.** Filters supplied as JSON are sanitised
  before reaching MongoDB:
    - server-side JS operators (`$where`, `$function`, `$accumulator`,
      `$expr` with `$function`) are rejected.
    - 24-hex strings on known reference fields are coerced to ObjectId so
      filters actually match the stored ObjectId.
    - operator/field names containing path traversal (`..`) or NUL are
      rejected.
* **In-flight redaction.** Assessment questions returned while a schedule is
  still `in_progress` have `correct_index` and `explanation` stripped.
* **Bounds.** Every tool caps `limit` at `MAX_LIMIT` and projections drop
  large blob fields by default where appropriate.

The tool docstrings are what the LLM sees; keep them precise and short.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()

logger = logging.getLogger("els.mcp")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "enterprise_learning")
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "8010"))

client = MongoClient(MONGODB_URI)
db = client[MONGODB_DB]


# ─── Constants & safety ─────────────────────────────────────────────────────

MAX_LIMIT = 200
DEFAULT_LIMIT = 20

# Collections an agent may read via the generic query/count/aggregate tools.
# `user_credentials` is intentionally absent — never readable.
READABLE_COLLECTIONS: set[str] = {
    "users",
    "courses",
    "modules",
    "topics",
    "skills",
    "job_levels",
    "job_roles",
    "course_progress",
    "assessment_schedules",
    "assessment_questions",
    "assessment_results",
    "certifications",
    "work_signals",
    "knowledge_sources",
    "chat_conversations",
    "chat_messages",
    "notifications",
    "learning_curator_insights",
    "engagement_agent_insights",
    "assessment_agent_insights",
    "manager_insights_agent_insights",
    "study_plan_generator_insights",
}

# Hard-blocked even when caller knows the collection name.
BLOCKED_COLLECTIONS: set[str] = {"user_credentials"}

# Operators that can execute server-side JavaScript or otherwise escape the
# read-only contract — rejected anywhere in a filter.
DANGEROUS_OPERATORS: set[str] = {
    "$where",
    "$function",
    "$accumulator",
    "$out",
    "$merge",
}

# Per-collection field names that MUST be stripped before returning data,
# regardless of projection. Defence-in-depth: even if a stale write put a
# password_hash on a user doc, the agent can't see it.
SENSITIVE_FIELDS_BY_COLLECTION: dict[str, set[str]] = {
    "users": {"password_hash", "password"},
}

# Reference fields whose values are typically ObjectIds. When the caller
# passes a 24-hex string for one of these in a filter, we coerce.
OBJECTID_REFERENCE_FIELDS: set[str] = {
    "_id",
    "user_id",
    "course_id",
    "module_id",
    "topic_id",
    "schedule_id",
    "conversation_id",
    "manager_id",
    "reports_to",
    "job_role",
    "level",
    "assessment_result_id",
}

_HEX24_RE = re.compile(r"^[0-9a-fA-F]{24}$")


# ─── MCP server ─────────────────────────────────────────────────────────────

mcp = FastMCP(
    "Enterprise Learning DB",
    instructions=(
        "Read-only access to the Enterprise Learning System MongoDB database "
        "(schema v5.0.0). Use these tools to look up users, courses, modules, "
        "topics, progress, assessments (schedules / questions / results), "
        "certifications, work signals, notifications, chat history, agent "
        "insights and knowledge-source citations. The credentials collection "
        "is never accessible. All write paths go through the backend services."
    ),
    host=MCP_HOST,
    port=MCP_PORT,
)


# ─── Helpers ────────────────────────────────────────────────────────────────


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def serialize(doc: Any) -> Any:
    """Convert BSON values (ObjectId, datetime, date, set, bytes) → JSON-safe."""
    if doc is None:
        return None
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        if doc.tzinfo is None:
            doc = doc.replace(tzinfo=timezone.utc)
        return doc.isoformat()
    if isinstance(doc, date):
        return doc.isoformat()
    if isinstance(doc, (set, tuple)):
        return [serialize(v) for v in doc]
    if isinstance(doc, bytes):
        try:
            return doc.decode("utf-8")
        except UnicodeDecodeError:
            return doc.hex()
    if isinstance(doc, list):
        return [serialize(v) for v in doc]
    if isinstance(doc, dict):
        return {k: serialize(v) for k, v in doc.items()}
    return doc


def _err(message: str, **extra: Any) -> str:
    payload = {"error": message}
    payload.update(extra)
    return json.dumps(payload)


def _ok(data: Any) -> str:
    return json.dumps(serialize(data), indent=2, default=str)


def _to_oid(value: Any) -> ObjectId | None:
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str) and _HEX24_RE.match(value):
        try:
            return ObjectId(value)
        except InvalidId:
            return None
    return None


def _require_oid(value: str, label: str) -> ObjectId:
    oid = _to_oid(value)
    if oid is None:
        raise ValueError(f"invalid {label}: expected 24-char hex ObjectId")
    return oid


def _id_filter(field: str, value: str) -> dict:
    """Build a filter that matches whether the field is stored as ObjectId or string."""
    oid = _to_oid(value)
    if oid is None:
        return {field: value}
    return {field: {"$in": [oid, str(oid)]}}


def _clamp_limit(limit: int | None) -> int:
    if not isinstance(limit, int) or limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _sanitize_filter(value: Any, *, _depth: int = 0) -> Any:
    """Recursively reject dangerous operators and coerce 24-hex strings on known
    reference fields. Raises ValueError on anything suspicious.
    """
    if _depth > 10:
        raise ValueError("filter too deeply nested")
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if not isinstance(k, str):
                raise ValueError("filter keys must be strings")
            if "\x00" in k or ".." in k:
                raise ValueError(f"invalid filter key: {k!r}")
            if k in DANGEROUS_OPERATORS:
                raise ValueError(f"operator {k} is not allowed")
            child = _sanitize_filter(v, _depth=_depth + 1)
            # Coerce 24-hex strings on known reference fields.
            if k in OBJECTID_REFERENCE_FIELDS and isinstance(child, str):
                oid = _to_oid(child)
                if oid is not None:
                    child = oid
            out[k] = child
        return out
    if isinstance(value, list):
        return [_sanitize_filter(v, _depth=_depth + 1) for v in value]
    return value


def _strip_sensitive(collection: str, doc: dict | None) -> dict | None:
    if not doc:
        return doc
    redactions = SENSITIVE_FIELDS_BY_COLLECTION.get(collection)
    if not redactions:
        return doc
    return {k: v for k, v in doc.items() if k not in redactions}


def _strip_sensitive_many(collection: str, docs: list[dict]) -> list[dict]:
    redactions = SENSITIVE_FIELDS_BY_COLLECTION.get(collection)
    if not redactions:
        return docs
    return [{k: v for k, v in d.items() if k not in redactions} for d in docs]


def _check_collection(name: str) -> str | None:
    """Return an error JSON string if the collection is not readable; else None."""
    if name in BLOCKED_COLLECTIONS:
        return _err(f"collection '{name}' is not accessible")
    if name not in READABLE_COLLECTIONS:
        return _err(
            f"collection '{name}' is not in the readable allow-list",
            allowed=sorted(READABLE_COLLECTIONS),
        )
    return None


def _redact_questions_in_progress(qdoc: dict, schedule_status: str | None) -> dict:
    """Strip answer keys while a schedule is still in progress."""
    if schedule_status not in ("in_progress", "ready", "pending", "generating"):
        return qdoc
    redacted = dict(qdoc)
    questions = []
    for q in qdoc.get("questions") or []:
        q2 = {k: v for k, v in q.items() if k not in ("correct_index", "explanation")}
        questions.append(q2)
    redacted["questions"] = questions
    return redacted


# ─── Catalog: courses, modules, topics, skills, levels, roles ───────────────


@mcp.tool(structured_output=False)
def list_courses(limit: int = DEFAULT_LIMIT) -> str:
    """List courses with cert info, difficulty and module count.

    Returns: course_name, certification {cert_code, cert_name, level, vendor},
    difficulty, duration_hours, module count.
    """
    limit = _clamp_limit(limit)
    cursor = db.courses.find(
        {},
        {
            "course_name": 1,
            "certification": 1,
            "difficulty": 1,
            "duration_hours": 1,
            "modules": 1,
            "course_version": 1,
        },
    ).limit(limit)
    courses = []
    for c in cursor:
        c["module_count"] = len(c.get("modules", []) or [])
        c.pop("modules", None)
        courses.append(c)
    return _ok(courses)


@mcp.tool(structured_output=False)
def get_course_details(course_id: str) -> str:
    """Get full details for a course by ObjectId, including module ids and certification."""
    try:
        oid = _require_oid(course_id, "course_id")
    except ValueError as e:
        return _err(str(e))
    course = db.courses.find_one({"_id": oid})
    if not course:
        return _err("course not found")
    return _ok(course)


@mcp.tool(structured_output=False)
def get_course_by_cert_code(cert_code: str) -> str:
    """Find a course by its certification code (e.g., AZ-204, DP-203, AI-102)."""
    if not isinstance(cert_code, str) or not cert_code.strip():
        return _err("cert_code is required")
    course = db.courses.find_one({"certification.cert_code": cert_code.strip()})
    if not course:
        return _err(f"no course found for cert_code {cert_code}")
    return _ok(course)


@mcp.tool(structured_output=False)
def get_modules_for_course(course_id: str) -> str:
    """Get all modules for a course in display order, with topic id lists."""
    try:
        oid = _require_oid(course_id, "course_id")
    except ValueError as e:
        return _err(str(e))
    course = db.courses.find_one({"_id": oid}, {"modules": 1})
    if not course:
        return _err("course not found")
    module_ids = course.get("modules") or []
    if not module_ids:
        return _ok([])
    modules = list(db.modules.find({"_id": {"$in": module_ids}}))
    by_id = {m["_id"]: m for m in modules}
    ordered = [by_id[mid] for mid in module_ids if mid in by_id]
    return _ok(ordered)


@mcp.tool(structured_output=False)
def get_module(module_id: str) -> str:
    """Get a single module document (slug, title, topic id list)."""
    try:
        oid = _require_oid(module_id, "module_id")
    except ValueError as e:
        return _err(str(e))
    module = db.modules.find_one({"_id": oid})
    if not module:
        return _err("module not found")
    return _ok(module)


@mcp.tool(structured_output=False)
def get_topics_for_course(course_id: str, summary_only: bool = False) -> str:
    """Get all topics for a course in lesson order (module order, then topic order).

    Walks `course.modules[] → module.topics[]`. By default returns full
    `content_md`, `key_takeaways`, `reference_links` so the agent can ground
    questions / curator output in the actual learning material. Set
    `summary_only=True` for a lighter response (just slug, name, est. minutes).
    """
    try:
        course_oid = _require_oid(course_id, "course_id")
    except ValueError as e:
        return _err(str(e))

    course = db.courses.find_one({"_id": course_oid}, {"modules": 1})
    if not course:
        return _err("course not found")
    module_ids = course.get("modules") or []
    if not module_ids:
        return _ok([])

    modules = list(db.modules.find({"_id": {"$in": module_ids}}, {"title": 1, "topics": 1}))
    module_by_id = {m["_id"]: m for m in modules}
    ordered_topic_refs: list[tuple[ObjectId, str, int, int]] = []
    for module_order, mid in enumerate(module_ids):
        m = module_by_id.get(mid)
        if not m:
            continue
        for topic_order, tid in enumerate(m.get("topics") or []):
            ordered_topic_refs.append((tid, m.get("title", ""), module_order, topic_order))

    topic_ids = [r[0] for r in ordered_topic_refs]
    if not topic_ids:
        return _ok([])

    projection: dict | None = None
    if summary_only:
        projection = {"slug": 1, "topic_name": 1, "estimated_minutes": 1}

    topic_docs = {t["_id"]: t for t in db.topics.find({"_id": {"$in": topic_ids}}, projection)}

    out: list[dict] = []
    for tid, mod_title, mod_order, topic_order in ordered_topic_refs:
        t = topic_docs.get(tid)
        if not t:
            continue
        enriched = dict(t)
        enriched["module_title"] = mod_title
        enriched["module_order"] = mod_order
        enriched["topic_order"] = topic_order
        out.append(enriched)
    return _ok(out)


@mcp.tool(structured_output=False)
def get_topic_content(topic_id: str) -> str:
    """Full topic content (markdown body, key takeaways, reference links)."""
    try:
        oid = _require_oid(topic_id, "topic_id")
    except ValueError as e:
        return _err(str(e))
    topic = db.topics.find_one({"_id": oid})
    if not topic:
        return _err("topic not found")
    return _ok(topic)


@mcp.tool(structured_output=False)
def search_topics(query: str, limit: int = DEFAULT_LIMIT) -> str:
    """Case-insensitive search over topic name and content body.

    Matches on `topic_name`, `slug`, `content_md`, or `key_takeaways`. Returns
    a summary view (no full content body) — call `get_topic_content` for the
    full text of a hit.
    """
    if not isinstance(query, str) or not query.strip():
        return _err("query is required")
    limit = _clamp_limit(limit)
    pattern = re.escape(query.strip())
    regex = {"$regex": pattern, "$options": "i"}
    filt = {
        "$or": [
            {"topic_name": regex},
            {"slug": regex},
            {"content_md": regex},
            {"key_takeaways": regex},
        ]
    }
    rows = list(
        db.topics.find(
            filt,
            {"slug": 1, "topic_name": 1, "estimated_minutes": 1, "key_takeaways": 1},
        ).limit(limit)
    )
    return _ok(rows)


@mcp.tool(structured_output=False)
def list_skills(limit: int = DEFAULT_LIMIT) -> str:
    """List skills (slug, display name)."""
    limit = _clamp_limit(limit)
    rows = list(db.skills.find({}, {"slug": 1, "name": 1}).limit(limit))
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_skill_by_slug(slug: str) -> str:
    """Look up a skill by its kebab-case slug (e.g., `azure-storage`)."""
    if not isinstance(slug, str) or not slug.strip():
        return _err("slug is required")
    skill = db.skills.find_one({"slug": slug.strip()})
    if not skill:
        return _err("skill not found")
    return _ok(skill)


@mcp.tool(structured_output=False)
def list_job_levels() -> str:
    """List IC levels (L59, L60, ..., L70) with their display names."""
    rows = list(db.job_levels.find({}).sort("level_id", 1))
    return _ok(rows)


@mcp.tool(structured_output=False)
def list_job_roles(limit: int = DEFAULT_LIMIT) -> str:
    """List job roles with name, level and counts of required courses/skills."""
    limit = _clamp_limit(limit)
    rows = []
    for r in db.job_roles.find(
        {},
        {"role_name": 1, "level": 1, "description": 1, "required_courses": 1, "required_skills": 1},
    ).limit(limit):
        r["required_course_count"] = len(r.get("required_courses") or [])
        r["required_skill_count"] = len(r.get("required_skills") or [])
        r.pop("required_courses", None)
        r.pop("required_skills", None)
        rows.append(r)
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_job_role_details(role_id: str) -> str:
    """Get a job role with required courses (resolved to names) and skills."""
    try:
        oid = _require_oid(role_id, "role_id")
    except ValueError as e:
        return _err(str(e))
    role = db.job_roles.find_one({"_id": oid})
    if not role:
        return _err("job role not found")

    course_ids = role.get("required_courses") or []
    if course_ids:
        courses = list(
            db.courses.find(
                {"_id": {"$in": course_ids}},
                {"course_name": 1, "certification.cert_code": 1, "difficulty": 1},
            )
        )
        role["required_courses_resolved"] = courses

    skill_ids = role.get("required_skills") or []
    if skill_ids:
        skills = list(db.skills.find({"_id": {"$in": skill_ids}}, {"slug": 1, "name": 1}))
        role["required_skills_resolved"] = skills

    level_ref = role.get("level")
    if isinstance(level_ref, ObjectId):
        lvl = db.job_levels.find_one({"_id": level_ref})
        if lvl:
            role["level_resolved"] = lvl

    return _ok(role)


# ─── Knowledge sources ──────────────────────────────────────────────────────


@mcp.tool(structured_output=False)
def list_knowledge_sources(
    cert_code: str = "", source_type: str = "", limit: int = DEFAULT_LIMIT
) -> str:
    """List grounding documents indexed for retrieval.

    Args:
        cert_code: Optional filter (e.g., `AZ-204`) — matches `related_certs`.
        source_type: Optional filter — `grounding_doc` | `foundry_iq` | `ms_learn_mcp`.
        limit: max rows.
    """
    limit = _clamp_limit(limit)
    filt: dict[str, Any] = {}
    if cert_code.strip():
        filt["related_certs"] = cert_code.strip()
    if source_type.strip():
        filt["source_type"] = source_type.strip()
    rows = list(
        db.knowledge_sources.find(
            filt,
            {
                "doc_id": 1,
                "title": 1,
                "vendor": 1,
                "source_type": 1,
                "related_certs": 1,
                "uri": 1,
                "indexed_at": 1,
                "byte_size": 1,
            },
        )
        .sort("indexed_at", -1)
        .limit(limit)
    )
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_knowledge_source(doc_id: str) -> str:
    """Get a knowledge_sources row by its `doc_id` (the citation key)."""
    if not isinstance(doc_id, str) or not doc_id.strip():
        return _err("doc_id is required")
    row = db.knowledge_sources.find_one({"doc_id": doc_id.strip()})
    if not row:
        return _err("knowledge source not found")
    return _ok(row)


# ─── Users (read-only, no credentials) ─────────────────────────────────────


@mcp.tool(structured_output=False)
def list_users(role: str = "", limit: int = DEFAULT_LIMIT) -> str:
    """List users (no password fields). Optionally filter by role.

    Args:
        role: '', 'learner', 'manager', or 'admin'. Matches `users.roles[]`.
        limit: max rows (≤200).
    """
    limit = _clamp_limit(limit)
    filt: dict[str, Any] = {}
    role = (role or "").strip().lower()
    if role:
        if role not in {"learner", "manager", "admin"}:
            return _err("role must be one of: learner, manager, admin")
        filt = {"roles": role}
    cursor = db.users.find(
        filt,
        {
            "full_name": 1,
            "email": 1,
            "roles": 1,
            "job_role": 1,
            "reports_to": 1,
            "is_active": 1,
        },
    ).limit(limit)
    users = _strip_sensitive_many("users", list(cursor))
    return _ok(users)


@mcp.tool(structured_output=False)
def get_user_by_email(email: str) -> str:
    """Get a user's full profile by email (credentials never returned)."""
    if not isinstance(email, str) or "@" not in email:
        return _err("a valid email is required")
    user = db.users.find_one({"email": email.strip().lower()})
    if not user:
        return _err("user not found")
    return _ok(_strip_sensitive("users", user))


@mcp.tool(structured_output=False)
def get_user_by_id(user_id: str) -> str:
    """Get a user's full profile by ObjectId (credentials never returned)."""
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    user = db.users.find_one({"_id": oid})
    if not user:
        return _err("user not found")
    return _ok(_strip_sensitive("users", user))


@mcp.tool(structured_output=False)
def find_users_by_job_role(role_id: str, limit: int = DEFAULT_LIMIT) -> str:
    """List users currently assigned to a given `job_roles` ObjectId."""
    try:
        oid = _require_oid(role_id, "role_id")
    except ValueError as e:
        return _err(str(e))
    limit = _clamp_limit(limit)
    rows = list(
        db.users.find(
            {"job_role": oid},
            {"full_name": 1, "email": 1, "roles": 1, "reports_to": 1, "is_active": 1},
        ).limit(limit)
    )
    return _ok(_strip_sensitive_many("users", rows))


@mcp.tool(structured_output=False)
def get_team(manager_id: str) -> str:
    """Get a manager's direct reports (users with `reports_to == manager_id`)."""
    try:
        oid = _require_oid(manager_id, "manager_id")
    except ValueError as e:
        return _err(str(e))
    manager = db.users.find_one(
        {"_id": oid},
        {"full_name": 1, "email": 1, "roles": 1, "job_role": 1},
    )
    if not manager:
        return _err("manager not found")
    members = list(
        db.users.find(
            {"reports_to": {"$in": [oid, str(oid)]}},
            {"full_name": 1, "email": 1, "roles": 1, "job_role": 1, "is_active": 1},
        )
    )
    return _ok({
        "manager": _strip_sensitive("users", manager),
        "members": _strip_sensitive_many("users", members),
        "member_count": len(members),
    })


# ─── Work signals ───────────────────────────────────────────────────────────


@mcp.tool(structured_output=False)
def get_user_work_signals(user_id: str) -> str:
    """Per-user Work IQ signals + learning preferences from `work_signals`.

    Returns meeting hours, focus hours, peak focus window, interruption density,
    preferred study slot, weekly study target, and timezone. Used by the
    Engagement Agent and Study Plan Generator.
    """
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    doc = db.work_signals.find_one({"user_id": oid})
    if not doc:
        # Fallback for legacy docs that still store user_id as string.
        doc = db.work_signals.find_one({"user_id": str(oid)})
    if not doc:
        return _err("no work_signals row for this user")
    return _ok(doc)


# ─── Course progress ────────────────────────────────────────────────────────


@mcp.tool(structured_output=False)
def get_learner_progress(user_id: str, status: str = "") -> str:
    """All `course_progress` rows for a learner.

    Args:
        user_id: learner ObjectId.
        status: optional — `in_progress` or `completed`.
    """
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    filt = _id_filter("user_id", str(oid))
    status = (status or "").strip().lower()
    if status:
        if status not in {"in_progress", "completed"}:
            return _err("status must be 'in_progress' or 'completed'")
        filt["status"] = status
    rows = list(db.course_progress.find(filt).sort("last_activity", -1))
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_progress_for_course(user_id: str, course_id: str) -> str:
    """Single `course_progress` row for one (user, course) pair."""
    try:
        u = _require_oid(user_id, "user_id")
        c = _require_oid(course_id, "course_id")
    except ValueError as e:
        return _err(str(e))
    filt = {**_id_filter("user_id", str(u)), **_id_filter("course_id", str(c))}
    row = db.course_progress.find_one(filt)
    if not row:
        return _err("no progress found for this user/course")
    return _ok(row)


@mcp.tool(structured_output=False)
def get_course_progress_summary() -> str:
    """Aggregated learner counts and avg completion per (course, status).

    Useful for admin/manager dashboards. Returns rows of
    `{course_id, course_name, status, count, avg_completion}`.
    """
    pipeline = [
        {
            "$group": {
                "_id": {"course_id": "$course_id", "status": "$status"},
                "count": {"$sum": 1},
                "avg_completion": {"$avg": "$percent_complete"},
            }
        },
        {"$sort": {"_id.course_id": 1, "_id.status": 1}},
    ]
    results = list(db.course_progress.aggregate(pipeline))
    course_ids = list({r["_id"]["course_id"] for r in results if r["_id"].get("course_id")})
    name_map: dict[Any, str] = {}
    if course_ids:
        for c in db.courses.find({"_id": {"$in": course_ids}}, {"course_name": 1}):
            name_map[c["_id"]] = c.get("course_name", "")
    enriched: list[dict] = []
    for r in results:
        cid = r["_id"].get("course_id")
        enriched.append({
            "course_id": cid,
            "course_name": name_map.get(cid, ""),
            "status": r["_id"].get("status"),
            "count": r["count"],
            "avg_completion": round(r.get("avg_completion") or 0, 1),
        })
    return _ok(enriched)


@mcp.tool(structured_output=False)
def get_team_progress_overview(manager_id: str) -> str:
    """Manager-scoped progress: counts of in-progress / completed courses per team member."""
    try:
        oid = _require_oid(manager_id, "manager_id")
    except ValueError as e:
        return _err(str(e))
    members = list(
        db.users.find(
            {"reports_to": {"$in": [oid, str(oid)]}},
            {"full_name": 1, "email": 1},
        )
    )
    if not members:
        return _ok({"manager_id": str(oid), "members": []})

    member_oids = [m["_id"] for m in members]
    user_filter = {"user_id": {"$in": member_oids + [str(o) for o in member_oids]}}
    rows = list(db.course_progress.find(user_filter, {"user_id": 1, "status": 1}))

    by_user: dict[str, dict[str, int]] = {}
    for r in rows:
        key = str(r.get("user_id"))
        bucket = by_user.setdefault(key, {"in_progress": 0, "completed": 0})
        st = r.get("status")
        if st in bucket:
            bucket[st] += 1

    out = []
    for m in members:
        mid = str(m["_id"])
        bucket = by_user.get(mid, {"in_progress": 0, "completed": 0})
        out.append({
            "user_id": mid,
            "full_name": m.get("full_name"),
            "email": m.get("email"),
            "in_progress": bucket["in_progress"],
            "completed": bucket["completed"],
        })
    return _ok({"manager_id": str(oid), "members": out})


# ─── Assessments: schedules / questions / results ───────────────────────────


@mcp.tool(structured_output=False)
def get_user_assessment_results(user_id: str, limit: int = DEFAULT_LIMIT) -> str:
    """All completed `assessment_results` for a learner (newest first)."""
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    limit = _clamp_limit(limit)
    rows = list(
        db.assessment_results.find(_id_filter("user_id", str(oid)))
        .sort("submitted_at", -1)
        .limit(limit)
    )
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_assessment_result_details(result_id: str) -> str:
    """Single `assessment_results` doc with per-topic breakdown and proctor data."""
    try:
        oid = _require_oid(result_id, "result_id")
    except ValueError as e:
        return _err(str(e))
    row = db.assessment_results.find_one({"_id": oid})
    if not row:
        return _err("assessment result not found")
    return _ok(row)


@mcp.tool(structured_output=False)
def get_user_assessment_schedules(
    user_id: str, status: str = "", limit: int = DEFAULT_LIMIT
) -> str:
    """All `assessment_schedules` for a learner (history view).

    Args:
        user_id: learner ObjectId.
        status: optional — `pending` | `generating` | `ready` | `in_progress`
                | `completed` | `expired` | `failed`.
    """
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    limit = _clamp_limit(limit)
    filt = _id_filter("user_id", str(oid))
    status = (status or "").strip().lower()
    valid_status = {
        "pending", "generating", "ready", "in_progress",
        "completed", "expired", "failed",
    }
    if status:
        if status not in valid_status:
            return _err(f"status must be one of {sorted(valid_status)}")
        filt["status"] = status
    rows = list(
        db.assessment_schedules.find(filt)
        .sort("scheduled_at", -1)
        .limit(limit)
    )
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_assessment_questions(schedule_id: str) -> str:
    """Question payload for a schedule.

    `correct_index` and `explanation` are stripped while the schedule is still
    in flight (`pending` / `generating` / `ready` / `in_progress`). They
    become visible only after submission (`completed` / `expired`).
    """
    try:
        oid = _require_oid(schedule_id, "schedule_id")
    except ValueError as e:
        return _err(str(e))
    schedule = db.assessment_schedules.find_one({"_id": oid}, {"status": 1})
    if not schedule:
        return _err("schedule not found")
    qdoc = db.assessment_questions.find_one({"schedule_id": oid})
    if not qdoc:
        return _err("no questions document for this schedule")
    qdoc = _redact_questions_in_progress(qdoc, schedule.get("status"))
    return _ok(qdoc)


@mcp.tool(structured_output=False)
def get_course_assessment_stats(course_id: str) -> str:
    """Per-course assessment stats from `assessment_results`.

    Returns total submissions, pass count, pass rate, average score, and
    weak-topic frequency aggregated across all learners.
    """
    try:
        oid = _require_oid(course_id, "course_id")
    except ValueError as e:
        return _err(str(e))
    pipeline = [
        {"$match": {"course_id": oid}},
        {
            "$group": {
                "_id": "$course_id",
                "total_attempts": {"$sum": 1},
                "avg_score": {"$avg": "$score_percentage"},
                "pass_count": {"$sum": {"$cond": ["$passed", 1, 0]}},
            }
        },
    ]
    rows = list(db.assessment_results.aggregate(pipeline))
    if not rows:
        return _err("no assessment results for this course")
    base = rows[0]
    total = base["total_attempts"] or 1
    base["pass_rate"] = round(base["pass_count"] * 100 / total, 1)
    base["avg_score"] = round(base.get("avg_score") or 0, 1)

    # Weak topic frequency
    weak_pipeline = [
        {"$match": {"course_id": oid}},
        {"$unwind": "$weak_topic_ids"},
        {"$group": {"_id": "$weak_topic_ids", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    weak_rows = list(db.assessment_results.aggregate(weak_pipeline))
    if weak_rows:
        topic_ids = [w["_id"] for w in weak_rows if w.get("_id")]
        topic_names = {
            t["_id"]: t.get("topic_name")
            for t in db.topics.find({"_id": {"$in": topic_ids}}, {"topic_name": 1})
        }
        base["top_weak_topics"] = [
            {
                "topic_id": w["_id"],
                "topic_name": topic_names.get(w["_id"], ""),
                "weak_attempts": w["count"],
            }
            for w in weak_rows
        ]

    return _ok(base)


@mcp.tool(structured_output=False)
def get_proctor_violation_summary(course_id: str = "") -> str:
    """Proctor-violation counts across `assessment_results`.

    Args:
        course_id: optional — restrict to one course.
    """
    match: dict[str, Any] = {"proctor.blocked": True}
    if course_id.strip():
        try:
            match["course_id"] = _require_oid(course_id.strip(), "course_id")
        except ValueError as e:
            return _err(str(e))

    pipeline = [
        {"$match": match},
        {"$unwind": "$proctor.violations"},
        {"$group": {"_id": "$proctor.violations.type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    rows = list(db.assessment_results.aggregate(pipeline))
    return _ok([{"violation_type": r["_id"], "count": r["count"]} for r in rows])


# ─── Certifications ─────────────────────────────────────────────────────────


@mcp.tool(structured_output=False)
def get_learner_certifications(user_id: str, current_only: bool = False) -> str:
    """All certifications for a learner. Set `current_only=True` for the active set."""
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    filt = _id_filter("user_id", str(oid))
    if current_only:
        filt["is_current"] = True
    rows = list(db.certifications.find(filt).sort("issued_at", -1))
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_certification_leaderboard(limit: int = 10) -> str:
    """Top learners by current certification count (joined with user names)."""
    limit = _clamp_limit(limit)
    pipeline = [
        {"$match": {"is_current": True}},
        {
            "$group": {
                "_id": "$user_id",
                "cert_count": {"$sum": 1},
                "certs": {"$push": "$cert_code"},
            }
        },
        {"$sort": {"cert_count": -1}},
        {"$limit": limit},
    ]
    results = list(db.certifications.aggregate(pipeline))
    user_ids: list[ObjectId] = []
    for r in results:
        oid = _to_oid(r["_id"])
        if oid is not None:
            user_ids.append(oid)
    name_map: dict[Any, dict] = {}
    if user_ids:
        for u in db.users.find(
            {"_id": {"$in": user_ids}}, {"full_name": 1, "email": 1}
        ):
            name_map[u["_id"]] = u
    out = []
    for r in results:
        oid = _to_oid(r["_id"])
        u = name_map.get(oid) if oid else None
        out.append({
            "user_id": str(r["_id"]) if r["_id"] else None,
            "full_name": u.get("full_name") if u else None,
            "email": u.get("email") if u else None,
            "cert_count": r["cert_count"],
            "certs": r["certs"],
        })
    return _ok(out)


@mcp.tool(structured_output=False)
def get_certification_holders(cert_code: str, limit: int = DEFAULT_LIMIT) -> str:
    """List users who currently hold a given certification (e.g., AZ-204)."""
    if not isinstance(cert_code, str) or not cert_code.strip():
        return _err("cert_code is required")
    limit = _clamp_limit(limit)
    rows = list(
        db.certifications.find(
            {"cert_code": cert_code.strip(), "is_current": True},
            {"user_id": 1, "course_name": 1, "issued_at": 1, "score": 1, "level": 1},
        )
        .sort("issued_at", -1)
        .limit(limit)
    )
    user_ids = [r["user_id"] for r in rows if isinstance(r.get("user_id"), ObjectId)]
    name_map: dict[Any, dict] = {}
    if user_ids:
        for u in db.users.find(
            {"_id": {"$in": user_ids}}, {"full_name": 1, "email": 1}
        ):
            name_map[u["_id"]] = u
    enriched = []
    for r in rows:
        u = name_map.get(r.get("user_id"))
        enriched.append({
            "user_id": str(r.get("user_id")) if r.get("user_id") else None,
            "full_name": u.get("full_name") if u else None,
            "email": u.get("email") if u else None,
            "course_name": r.get("course_name"),
            "level": r.get("level"),
            "score": r.get("score"),
            "issued_at": serialize(r.get("issued_at")),
        })
    return _ok(enriched)


# ─── Chat history ───────────────────────────────────────────────────────────


@mcp.tool(structured_output=False)
def list_user_conversations(user_id: str, limit: int = DEFAULT_LIMIT) -> str:
    """Chat conversations for a user (most recently updated first)."""
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    limit = _clamp_limit(limit)
    rows = list(
        db.chat_conversations.find(_id_filter("user_id", str(oid)))
        .sort("last_message_at", -1)
        .limit(limit)
    )
    return _ok(rows)


@mcp.tool(structured_output=False)
def get_conversation_messages(conversation_id: str, limit: int = 100) -> str:
    """Messages in a conversation, ordered by `seq` (the canonical ordering)."""
    try:
        oid = _require_oid(conversation_id, "conversation_id")
    except ValueError as e:
        return _err(str(e))
    limit = _clamp_limit(limit)
    rows = list(
        db.chat_messages.find(_id_filter("conversation_id", str(oid)))
        .sort("seq", 1)
        .limit(limit)
    )
    return _ok(rows)


# ─── Notifications ──────────────────────────────────────────────────────────


@mcp.tool(structured_output=False)
def list_user_notifications(
    user_id: str, unread_only: bool = False, limit: int = DEFAULT_LIMIT
) -> str:
    """Per-user notification inbox (newest first). `unread_only=True` filters."""
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    limit = _clamp_limit(limit)
    filt = _id_filter("user_id", str(oid))
    if unread_only:
        filt["read"] = False
    rows = list(db.notifications.find(filt).sort("created_at", -1).limit(limit))
    return _ok(rows)


@mcp.tool(structured_output=False)
def count_unread_notifications(user_id: str) -> str:
    """Unread-notification count for a user."""
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    count = db.notifications.count_documents({**_id_filter("user_id", str(oid)), "read": False})
    return _ok({"user_id": str(oid), "unread": count})


# ─── Agent insights ─────────────────────────────────────────────────────────


def _read_user_insight(collection_name: str, user_id: str) -> str:
    try:
        oid = _require_oid(user_id, "user_id")
    except ValueError as e:
        return _err(str(e))
    coll = db[collection_name]
    doc = coll.find_one(_id_filter("user_id", str(oid)))
    if not doc:
        return _err(f"no cached insight in {collection_name} for this user")
    return _ok(doc)


@mcp.tool(structured_output=False)
def get_assessment_agent_insight(user_id: str) -> str:
    """Cached Assessment Agent readiness output (`assessment_agent_insights`)."""
    return _read_user_insight("assessment_agent_insights", user_id)


@mcp.tool(structured_output=False)
def get_engagement_agent_insight(user_id: str) -> str:
    """Cached Engagement Agent output (`engagement_agent_insights`)."""
    return _read_user_insight("engagement_agent_insights", user_id)


@mcp.tool(structured_output=False)
def get_learning_curator_insight(user_id: str) -> str:
    """Cached Learning Path Curator recommendations (`learning_curator_insights`)."""
    return _read_user_insight("learning_curator_insights", user_id)


@mcp.tool(structured_output=False)
def get_study_plan(user_id: str) -> str:
    """Cached weekly study plan (`study_plan_generator_insights`)."""
    return _read_user_insight("study_plan_generator_insights", user_id)


@mcp.tool(structured_output=False)
def get_manager_insights(manager_id: str) -> str:
    """Cached Manager Insights output (`manager_insights_agent_insights`).

    Note: keyed by `manager_id`, not `user_id`.
    """
    try:
        oid = _require_oid(manager_id, "manager_id")
    except ValueError as e:
        return _err(str(e))
    doc = db.manager_insights_agent_insights.find_one(_id_filter("manager_id", str(oid)))
    if not doc:
        return _err("no cached manager insight for this manager")
    return _ok(doc)


# ─── Generic / analytics escape hatches ─────────────────────────────────────


@mcp.tool(structured_output=False)
def query_collection(
    collection: str,
    filter_json: str = "{}",
    projection_json: str = "{}",
    sort_json: str = "{}",
    limit: int = DEFAULT_LIMIT,
) -> str:
    """Read-only flexible query over an allow-listed collection.

    The filter is sanitised before execution — server-side JS operators
    (`$where`, `$function`, `$accumulator`) are rejected, and 24-hex strings
    on known reference fields are coerced to ObjectId so filters actually
    match. The credentials collection is never accessible.

    Args:
        collection: One of the readable collections (see error message for
            the full list if you pass an unknown one).
        filter_json: JSON string for the Mongo filter (e.g., `{"is_active":true}`).
        projection_json: JSON projection (e.g., `{"full_name":1,"email":1}`).
        sort_json: JSON sort spec (e.g., `{"created_at":-1}`).
        limit: max docs (≤200).
    """
    err = _check_collection(collection)
    if err:
        return err

    try:
        raw_filter = json.loads(filter_json or "{}")
        raw_proj = json.loads(projection_json or "{}")
        raw_sort = json.loads(sort_json or "{}")
    except json.JSONDecodeError as e:
        return _err(f"invalid JSON: {e}")

    try:
        clean_filter = _sanitize_filter(raw_filter)
    except ValueError as e:
        return _err(str(e))

    if not isinstance(raw_proj, dict):
        return _err("projection_json must be a JSON object")
    if not isinstance(raw_sort, dict):
        return _err("sort_json must be a JSON object")

    limit = _clamp_limit(limit)
    cursor = db[collection].find(clean_filter, raw_proj or None)
    if raw_sort:
        cursor = cursor.sort(list(raw_sort.items()))
    cursor = cursor.limit(limit)

    try:
        rows = list(cursor)
    except PyMongoError as e:
        return _err(f"database error: {e}")

    rows = _strip_sensitive_many(collection, rows)
    return _ok(rows)


@mcp.tool(structured_output=False)
def count_documents(collection: str, filter_json: str = "{}") -> str:
    """Count documents matching a sanitised filter on an allow-listed collection."""
    err = _check_collection(collection)
    if err:
        return err
    try:
        raw_filter = json.loads(filter_json or "{}")
    except json.JSONDecodeError as e:
        return _err(f"invalid JSON: {e}")
    try:
        clean_filter = _sanitize_filter(raw_filter)
    except ValueError as e:
        return _err(str(e))
    try:
        count = db[collection].count_documents(clean_filter)
    except PyMongoError as e:
        return _err(f"database error: {e}")
    return _ok({"collection": collection, "count": count})


@mcp.tool(structured_output=False)
def list_readable_collections() -> str:
    """Return the names of every collection these tools can read.

    `user_credentials` is intentionally excluded and cannot be accessed
    through any tool.
    """
    return _ok({
        "readable": sorted(READABLE_COLLECTIONS),
        "blocked": sorted(BLOCKED_COLLECTIONS),
        "max_limit": MAX_LIMIT,
    })


@mcp.tool(structured_output=False)
def db_health() -> str:
    """Sanity check: ping MongoDB and return per-collection document counts."""
    try:
        client.admin.command("ping")
    except PyMongoError as e:
        return _err(f"mongodb ping failed: {e}")
    counts = {name: db[name].estimated_document_count() for name in sorted(READABLE_COLLECTIONS)}
    return _ok({
        "status": "ok",
        "database": MONGODB_DB,
        "checked_at": _now_utc().isoformat(),
        "counts": counts,
    })


# ─── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
