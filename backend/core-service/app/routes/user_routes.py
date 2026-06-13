"""User-facing read/write endpoints (profile, courses, progress, prefs, etc.).

All routes use the X-User-Id header for the caller. The header value is a
24-char hex ObjectId; we convert to ObjectId once at the top of each
handler and use it for filters against collections that store ObjectIds
(`course_progress`, `certifications`, `work_signals`,
`assessment_results`, `assessment_schedules`).
"""
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

from app.db.helpers import oid_filter, primary_role
from app.db.mongo import get_db

router = APIRouter(prefix="/users", tags=["users"])


# ─── Helpers ─────────────────────────────────────────────


async def _get_user(request: Request):
    user_id = request.headers.get("X-User-Id")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="User ID not provided")
    db = get_db()
    user_oid = ObjectId(user_id)
    user = await db.users.find_one({"_id": user_oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return db, user, user_oid


def _ensure_admin(user: dict) -> None:
    if "admin" not in (user.get("roles") or []):
        raise HTTPException(status_code=403, detail="Admin access required")


def _serialize(doc):
    if doc is None:
        return None
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── GET /users/profile ──────────────────────────────


@router.get("/profile")
async def get_user_profile(request: Request):
    db, user, _ = await _get_user(request)

    profile = {
        "id": str(user["_id"]),
        "full_name": user.get("full_name"),
        "email": user.get("email"),
        "role": primary_role(user),
        "roles": user.get("roles") or [],
        "is_active": user.get("is_active", True),
    }

    if user.get("job_role"):
        role_doc = await db.job_roles.find_one({"_id": user["job_role"]})
        if role_doc:
            profile["job_role"] = {
                "id": str(role_doc["_id"]),
                "role_name": role_doc.get("role_name"),
                "description": role_doc.get("description", ""),
            }
            level_ref = role_doc.get("level")
            level_doc = None
            if isinstance(level_ref, ObjectId):
                level_doc = await db.job_levels.find_one({"_id": level_ref})
            elif isinstance(level_ref, str):
                if ObjectId.is_valid(level_ref):
                    level_doc = await db.job_levels.find_one({"_id": ObjectId(level_ref)})
                else:
                    level_doc = await db.job_levels.find_one({"level_id": level_ref})
            if level_doc:
                profile["job_role"]["level"] = {
                    "level_id": level_doc.get("level_id"),
                    "level_name": level_doc.get("level_name"),
                }

    if user.get("reports_to"):
        manager = await db.users.find_one(
            {"_id": user["reports_to"]},
            {"full_name": 1, "email": 1},
        )
        if manager:
            profile["manager"] = {
                "full_name": manager.get("full_name"),
                "email": manager.get("email"),
            }

    return profile


# ─── GET /users/courses ───────────────────────────────


@router.get("/courses")
@router.get("/certifications")  # backward compat
async def get_user_certifications(request: Request):
    db, user, user_oid = await _get_user(request)

    cert_codes_param = request.query_params.get("cert_codes")
    cert_code_filter: set[str] | None = None
    if cert_codes_param:
        cert_code_filter = {c.strip() for c in cert_codes_param.split(",") if c.strip()}
        if not cert_code_filter:
            return []

    status_param = (request.query_params.get("status") or "").strip().lower()
    enrolled_only = status_param == "enrolled"

    progress_records = await db.course_progress.find(
        oid_filter("user_id", user_oid)
    ).to_list(length=50)
    progress_map = {str(p["course_id"]): p for p in progress_records if p.get("course_id")}
    enrolled_course_ids = list(progress_map.keys())

    required_course_ids: list[str] = []
    if not cert_code_filter and not enrolled_only and user.get("job_role"):
        role_doc = await db.job_roles.find_one({"_id": user["job_role"]})
        if role_doc:
            for c in role_doc.get("required_courses") or []:
                required_course_ids.append(str(c) if isinstance(c, ObjectId) else c)

    seen: set[str] = set()
    all_course_ids: list[str] = []
    for cid in required_course_ids + enrolled_course_ids:
        if cid and cid not in seen:
            seen.add(cid)
            all_course_ids.append(cid)

    if not all_course_ids:
        return []

    course_oids = [ObjectId(c) for c in all_course_ids if ObjectId.is_valid(c)]
    course_query: dict = {"_id": {"$in": course_oids}}
    if cert_code_filter:
        course_query["certification.cert_code"] = {"$in": list(cert_code_filter)}
    courses = await db.courses.find(course_query).to_list(length=50)
    course_map = {str(c["_id"]): c for c in courses}

    assessment_records: list[dict] = []
    if enrolled_course_ids:
        assessment_records = (
            await db.assessment_results.find(oid_filter("user_id", user_oid))
            .sort("submitted_at", -1)
            .to_list(length=100)
        )

    result = []
    for cid in all_course_ids:
        course = course_map.get(cid)
        if not course:
            continue
        cert_info = course.get("certification") or {}
        progress = progress_map.get(cid)

        status = "not_started"
        if progress:
            status = progress.get("status", "not_started")

        if enrolled_only and status not in ("in_progress", "completed"):
            continue

        course_assessments = [a for a in assessment_records if str(a.get("course_id")) == cid]
        latest_score = course_assessments[0].get("score_percentage") if course_assessments else None

        result.append({
            "course_id": cid,
            "course_name": course.get("course_name", ""),
            "cert_code": cert_info.get("cert_code", ""),
            "cert_name": cert_info.get("cert_name", course.get("course_name", "")),
            "vendor": cert_info.get("vendor", "Microsoft"),
            "level": cert_info.get("level", course.get("difficulty", "")),
            "recommended_hours": course.get("duration_hours", 40),
            "pass_threshold": 70,
            "status": status,
            "latest_score": latest_score,
        })

    return result


# ─── GET /users/earned-certifications ────────────────


@router.get("/earned-certifications")
async def get_user_earned_certifications(request: Request):
    db, _user, user_oid = await _get_user(request)

    earned = await db.certifications.find(
        oid_filter("user_id", user_oid)
    ).to_list(length=50)

    result = []
    for cert in earned:
        skills = []
        for s in cert.get("skills", []) or []:
            skill_id = s if isinstance(s, ObjectId) else (
                s if isinstance(s, str) else (s.get("skill") if isinstance(s, dict) else None)
            )
            if skill_id is None:
                continue
            try:
                skill_oid = skill_id if isinstance(skill_id, ObjectId) else ObjectId(skill_id)
            except Exception:
                skills.append({"name": str(skill_id)})
                continue
            skill_doc = await db.skills.find_one({"_id": skill_oid})
            skills.append({"name": skill_doc["name"] if skill_doc else "Unknown"})

        result.append({
            "cert_id": str(cert["_id"]),
            "user_id": str(cert.get("user_id")) if cert.get("user_id") else None,
            "course_id": str(cert.get("course_id")) if cert.get("course_id") else None,
            "vendor": cert.get("vendor", "Microsoft"),
            "cert_code": cert.get("cert_code", ""),
            "cert_name": cert.get("cert_name", ""),
            "cert_page": cert.get("cert_page", ""),
            "level": cert.get("level", ""),
            "skills": skills,
            "score": cert.get("score"),
            "issued_at": cert.get("issued_at").isoformat() if isinstance(cert.get("issued_at"), datetime) else cert.get("issued_at"),
        })

    return result


# ─── GET /users/stats ────────────────────────────────


@router.get("/stats")
async def get_user_stats(request: Request):
    db, user, user_oid = await _get_user(request)

    role_info = None
    if user.get("job_role"):
        role_doc = await db.job_roles.find_one({"_id": user["job_role"]})
        if role_doc:
            role_info = {
                "role_name": role_doc.get("role_name"),
                "description": role_doc.get("description", ""),
            }

    user_filter = oid_filter("user_id", user_oid)
    courses_in_progress = await db.course_progress.count_documents({**user_filter, "status": "in_progress"})
    courses_completed = await db.course_progress.count_documents({**user_filter, "status": "completed"})
    certs_earned = await db.certifications.count_documents(user_filter)

    return {
        "role_info": role_info,
        "courses_in_progress": courses_in_progress,
        "courses_completed": courses_completed,
        "certs_earned": certs_earned,
    }


# ─── GET / PUT /users/preferences ─────────────────────
# Schema collection is `work_signals`; we map the editable subset to the
# learning_preferences sub-document.

_PREF_DEFAULTS = {
    "meeting_hours": 10,
    "focus_hours": 10,
    "collaboration_hours": 5,
    "preferred_learning_slot": "Morning",
    "peak_focus_window": "09:00-11:00",
    "interruption_density": "Medium",
    "total_work_hours": 40,
    "study_hours_per_week": 5,
}


def _flatten_work_signals(doc: dict | None, user_id: str) -> dict:
    if not doc:
        return {"user_id": user_id, **_PREF_DEFAULTS}
    prefs = (doc.get("learning_preferences") or {}).copy()
    out = {"user_id": user_id, **_PREF_DEFAULTS}
    out.update({k: v for k, v in prefs.items() if k in _PREF_DEFAULTS})
    # Top-level Work IQ values can also override defaults if present.
    for k in _PREF_DEFAULTS:
        if k in doc and doc[k] is not None:
            out[k] = doc[k]
    return out


@router.get("/preferences")
async def get_preferences(request: Request):
    db, _user, user_oid = await _get_user(request)
    doc = await db.work_signals.find_one(oid_filter("user_id", user_oid))
    return _flatten_work_signals(doc, str(user_oid))


@router.put("/preferences")
async def update_preferences(request: Request):
    db, _user, user_oid = await _get_user(request)
    body = await request.json()

    update_fields = {f"learning_preferences.{k}": v for k, v in body.items() if k in _PREF_DEFAULTS}
    if not update_fields:
        raise HTTPException(status_code=400, detail="no editable fields supplied")
    update_fields["updated_at"] = datetime.now(timezone.utc)

    await db.work_signals.update_one(
        oid_filter("user_id", user_oid),
        {
            "$set": update_fields,
            "$setOnInsert": {"user_id": user_oid, "created_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )
    doc = await db.work_signals.find_one(oid_filter("user_id", user_oid))
    return _flatten_work_signals(doc, str(user_oid))


# ─── POST /users/courses/enroll ──────────────────────


@router.post("/courses/enroll")
async def enroll_in_course(request: Request):
    body = await request.json() if request.headers.get("content-length") else {}
    cert_code = (body.get("cert_code") or "").strip()
    course_id = (body.get("course_id") or "").strip()
    if not cert_code and not course_id:
        raise HTTPException(status_code=400, detail="cert_code or course_id required")

    db, _user, user_oid = await _get_user(request)

    if course_id:
        if not ObjectId.is_valid(course_id):
            raise HTTPException(status_code=400, detail="Invalid course_id")
        course = await db.courses.find_one({"_id": ObjectId(course_id)})
    else:
        course = await db.courses.find_one({"certification.cert_code": cert_code})
    if not course:
        raise HTTPException(status_code=404, detail="Course not found for given identifier")

    course_oid = course["_id"]
    course_id_str = str(course_oid)
    cert_info = course.get("certification") or {}

    existing = await db.course_progress.find_one(
        {**oid_filter("user_id", user_oid), **oid_filter("course_id", course_oid)},
        {"_id": 0},
    )
    now = datetime.now(timezone.utc)
    if not existing:
        all_topics = await db.topics.find({"_id": {"$in": []}}).to_list(length=1)
        # Topics aren't directly linked to a course in the schema; use the
        # course's modules → topics traversal instead.
        module_oids = [m if isinstance(m, ObjectId) else ObjectId(m) for m in course.get("modules", []) if m]
        topic_oids: list[ObjectId] = []
        if module_oids:
            modules = await db.modules.find({"_id": {"$in": module_oids}}, {"topics": 1}).to_list(length=200)
            for m in modules:
                for t in m.get("topics") or []:
                    topic_oids.append(t if isinstance(t, ObjectId) else ObjectId(t))
        all_topics = [{"_id": t} for t in topic_oids]
        topics_completed = [{"topic_id": str(t["_id"]), "is_completed": False} for t in all_topics]
        progress = {
            "user_id": user_oid,
            "course_id": course_oid,
            "status": "in_progress",
            "percent_complete": 0,
            "modules_completed": [],
            "total_modules": len(course.get("modules", [])),
            "topics_completed": topics_completed,
            "enrolled_at": now,
            "last_activity": now,
            "time_spent_minutes": 0,
        }
        await db.course_progress.insert_one(progress)
        status = progress["status"]
    else:
        status = existing.get("status", "not_started")
        if status == "not_started":
            await db.course_progress.update_one(
                {**oid_filter("user_id", user_oid), **oid_filter("course_id", course_oid)},
                {"$set": {"status": "in_progress", "last_activity": now}},
            )
            status = "in_progress"

    return {
        "course_id": course_id_str,
        "course_name": course.get("course_name", ""),
        "cert_code": cert_info.get("cert_code", ""),
        "cert_name": cert_info.get("cert_name", course.get("course_name", "")),
        "vendor": cert_info.get("vendor", "Microsoft"),
        "level": cert_info.get("level", course.get("difficulty", "")),
        "recommended_hours": course.get("duration_hours", 40),
        "pass_threshold": 70,
        "status": status,
        "latest_score": None,
        "already_enrolled": existing is not None,
    }


# ─── GET /users/progress ─────────────────────────────


@router.get("/progress")
async def get_user_progress(request: Request):
    db, _user, user_oid = await _get_user(request)
    records = (
        await db.course_progress.find(oid_filter("user_id", user_oid))
        .sort("last_activity", -1)
        .to_list(length=50)
    )

    course_oids = [r["course_id"] for r in records if isinstance(r.get("course_id"), ObjectId)]
    name_map: dict[str, str] = {}
    if course_oids:
        courses = await db.courses.find(
            {"_id": {"$in": course_oids}}, {"course_name": 1}
        ).to_list(length=50)
        name_map = {str(c["_id"]): c["course_name"] for c in courses}

    out = []
    for r in records:
        rec = _serialize(r)
        rec["course_name"] = name_map.get(str(r.get("course_id")), "")
        out.append(rec)
    return out


@router.get("/progress/{course_id}")
async def get_course_progress(request: Request, course_id: str):
    db, _user, user_oid = await _get_user(request)
    if not ObjectId.is_valid(course_id):
        raise HTTPException(status_code=400, detail="Invalid course_id")
    course_oid = ObjectId(course_id)

    progress = await db.course_progress.find_one(
        {**oid_filter("user_id", user_oid), **oid_filter("course_id", course_oid)}
    )
    if progress:
        return _serialize(progress)

    course = await db.courses.find_one({"_id": course_oid})
    total_modules = len(course.get("modules", [])) if course else 0
    progress = {
        "user_id": user_oid,
        "course_id": course_oid,
        "status": "not_started",
        "percent_complete": 0,
        "modules_completed": [],
        "total_modules": total_modules,
        "topics_completed": [],
        "enrolled_at": datetime.now(timezone.utc),
        "last_activity": None,
        "time_spent_minutes": 0,
    }
    await db.course_progress.insert_one(progress)
    return _serialize(progress)


@router.put("/progress/{course_id}/complete-module")
async def complete_module(request: Request, course_id: str):
    db, _user, user_oid = await _get_user(request)
    if not ObjectId.is_valid(course_id):
        raise HTTPException(status_code=400, detail="Invalid course_id")
    course_oid = ObjectId(course_id)
    body = await request.json()
    module_title = body.get("module_title")
    if not module_title:
        raise HTTPException(status_code=400, detail="module_title is required")

    filt = {**oid_filter("user_id", user_oid), **oid_filter("course_id", course_oid)}
    progress = await db.course_progress.find_one(filt)
    now = datetime.now(timezone.utc)
    if not progress:
        course = await db.courses.find_one({"_id": course_oid})
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        progress = {
            "user_id": user_oid,
            "course_id": course_oid,
            "status": "in_progress",
            "percent_complete": 0,
            "modules_completed": [],
            "total_modules": len(course.get("modules", [])),
            "enrolled_at": now,
            "last_activity": now,
            "time_spent_minutes": 0,
        }
        await db.course_progress.insert_one(progress)

    modules_completed = progress.get("modules_completed", []) or []
    if module_title not in modules_completed:
        modules_completed.append(module_title)
    total = progress.get("total_modules", 1) or 1
    percent = round((len(modules_completed) / total) * 100)
    status = "completed" if percent == 100 else "in_progress"

    await db.course_progress.update_one(
        filt,
        {"$set": {
            "modules_completed": modules_completed,
            "percent_complete": percent,
            "status": status,
            "last_activity": now,
        }},
    )

    updated = await db.course_progress.find_one(filt)
    return _serialize(updated)


@router.put("/progress/{course_id}/complete-topic")
async def complete_topic(request: Request, course_id: str):
    db, _user, user_oid = await _get_user(request)
    if not ObjectId.is_valid(course_id):
        raise HTTPException(status_code=400, detail="Invalid course_id")
    course_oid = ObjectId(course_id)
    body = await request.json()
    topic_id = body.get("topic_id")
    if not topic_id:
        raise HTTPException(status_code=400, detail="topic_id is required")

    filt = {**oid_filter("user_id", user_oid), **oid_filter("course_id", course_oid)}
    progress = await db.course_progress.find_one(filt)
    now = datetime.now(timezone.utc)

    if not progress:
        course = await db.courses.find_one({"_id": course_oid})
        progress = {
            "user_id": user_oid,
            "course_id": course_oid,
            "status": "in_progress",
            "percent_complete": 0,
            "modules_completed": [],
            "total_modules": len(course.get("modules", [])) if course else 0,
            "topics_completed": [{"topic_id": topic_id, "is_completed": True}],
            "enrolled_at": now,
            "last_activity": now,
            "time_spent_minutes": 0,
        }
        await db.course_progress.insert_one(progress)
    else:
        await db.course_progress.update_one(
            {**filt, "topics_completed.topic_id": topic_id},
            {"$set": {"topics_completed.$.is_completed": True, "last_activity": now}},
        )
        result = await db.course_progress.find_one(
            {**filt, "topics_completed.topic_id": topic_id}
        )
        if not result:
            await db.course_progress.update_one(
                filt,
                {
                    "$push": {"topics_completed": {"topic_id": topic_id, "is_completed": True}},
                    "$set": {"last_activity": now},
                },
            )

    updated_progress = await db.course_progress.find_one(filt)
    tc = updated_progress.get("topics_completed", []) or []
    completed_topics = sum(1 for t in tc if t.get("is_completed"))
    total_topics = len(tc)
    percent = round((completed_topics / total_topics) * 100) if total_topics > 0 else 0
    status = "completed" if percent == 100 else "in_progress"
    await db.course_progress.update_one(
        filt, {"$set": {"percent_complete": percent, "status": status}}
    )

    final = await db.course_progress.find_one(filt)
    return _serialize(final)


# ─── Assessment endpoints ────────────────────────────────


@router.get("/assessment-history")
async def get_assessment_history(request: Request):
    """All assessment results (and any active schedules) for the current user."""
    db, _user, user_oid = await _get_user(request)

    results = (
        await db.assessment_results.find(oid_filter("user_id", user_oid))
        .sort("submitted_at", -1)
        .to_list(length=50)
    )
    schedules = (
        await db.assessment_schedules.find(oid_filter("user_id", user_oid))
        .sort("scheduled_at", -1)
        .to_list(length=100)
    )
    sched_by_id = {s["_id"]: s for s in schedules}

    course_oids = list({s["course_id"] for s in schedules if isinstance(s.get("course_id"), ObjectId)})
    course_info: dict[str, dict] = {}
    if course_oids:
        courses = await db.courses.find(
            {"_id": {"$in": course_oids}}, {"course_name": 1, "certification.cert_code": 1}
        ).to_list(length=50)
        course_info = {str(c["_id"]): c for c in courses}

    records: list[dict] = []
    consumed_schedules: set[ObjectId] = set()
    for r in results:
        sched = sched_by_id.get(r.get("schedule_id"))
        if sched:
            consumed_schedules.add(sched["_id"])
        cid = str(r.get("course_id")) if r.get("course_id") else ""
        c = course_info.get(cid, {})
        proctor = r.get("proctor") or {}
        proctor_blocked = bool(proctor.get("blocked"))
        records.append({
            "schedule_id": str(r.get("schedule_id")) if r.get("schedule_id") else None,
            "course_id": cid,
            "course_name": c.get("course_name", ""),
            "cert_code": (c.get("certification") or {}).get("cert_code", ""),
            "score_percentage": r.get("score_percentage"),
            "passed": r.get("passed"),
            "readiness_level": r.get("readiness_level"),
            "submitted_at": r.get("submitted_at").isoformat() if isinstance(r.get("submitted_at"), datetime) else r.get("submitted_at"),
            "status": "blocked" if proctor_blocked else "completed",
            "proctor": {
                "blocked": proctor_blocked,
                "blocked_reason": (proctor.get("summary") or {}).get("blocked_reason"),
                "violation_count": len(proctor.get("violations") or []),
            },
        })

    for s in schedules:
        if s["_id"] in consumed_schedules:
            continue
        cid = str(s.get("course_id")) if s.get("course_id") else ""
        c = course_info.get(cid, {})
        status = s.get("status")
        records.append({
            "schedule_id": str(s["_id"]),
            "course_id": cid,
            "course_name": c.get("course_name", "") or s.get("course_name", ""),
            "cert_code": (c.get("certification") or {}).get("cert_code", "") or s.get("cert_code", ""),
            "score_percentage": s.get("score_percentage"),
            "passed": s.get("passed"),
            "readiness_level": None,
            "submitted_at": s.get("submitted_at").isoformat() if isinstance(s.get("submitted_at"), datetime) else s.get("submitted_at"),
            "status": status,
            "proctor": {
                "blocked": status == "blocked",
                "blocked_reason": s.get("error") if status == "blocked" else None,
                "violation_count": 0,
            },
        })

    return records


@router.get("/assessment-history/{course_id}")
async def get_course_assessments(request: Request, course_id: str):
    db, _user, user_oid = await _get_user(request)
    if not ObjectId.is_valid(course_id):
        raise HTTPException(status_code=400, detail="Invalid course_id")
    cursor = db.assessment_results.find(
        {**oid_filter("user_id", user_oid), **oid_filter("course_id", ObjectId(course_id))}
    ).sort("submitted_at", -1)
    rows = await cursor.to_list(length=20)
    return [_serialize(r) for r in rows]


# ─── GET /users/team ─────────────────────────────────


@router.get("/team")
async def get_user_team(request: Request):
    """Manager endpoint: get team members with progress + recent results."""
    db, _user, user_oid = await _get_user(request)

    members = await db.users.find({"reports_to": user_oid, "roles": "learner"}).to_list(length=50)
    # Backward compat: support older string-stored reports_to/role formats too.
    if not members:
        members = await db.users.find(
            {"$or": [
                {"reports_to": user_oid, "role": "learner"},
                {"reports_to": str(user_oid), "roles": "learner"},
                {"reports_to": str(user_oid), "role": "learner"},
            ]}
        ).to_list(length=50)

    if not members:
        return {"team_members": [], "team_stats": {}, "recent_assessments": []}

    member_oids = [m["_id"] for m in members]
    member_oid_str = [str(o) for o in member_oids]
    in_filter = {"$in": member_oids + member_oid_str}  # tolerate either form

    all_progress = await db.course_progress.find({"user_id": in_filter}).to_list(length=200)
    all_certs = await db.certifications.find({"user_id": in_filter}).to_list(length=200)
    recent_results = (
        await db.assessment_results.find({"user_id": in_filter})
        .sort("submitted_at", -1)
        .limit(20)
        .to_list(length=20)
    )

    # Resolve course names + cert codes so the dashboard renders human-readable
    # labels instead of raw ObjectIds. Pull every course referenced by progress,
    # cert, or assessment records on the team.
    course_id_strs: set[str] = set()
    for r in recent_results:
        if r.get("course_id"):
            course_id_strs.add(str(r["course_id"]))
    for p in all_progress:
        if p.get("course_id"):
            course_id_strs.add(str(p["course_id"]))
    for c in all_certs:
        if c.get("course_id"):
            course_id_strs.add(str(c["course_id"]))
    course_oids = [ObjectId(cid) for cid in course_id_strs if ObjectId.is_valid(cid)]
    course_meta_by_id: dict[str, dict] = {}
    if course_oids:
        async for c in db.courses.find(
            {"_id": {"$in": course_oids}},
            {"course_name": 1, "certification.cert_code": 1},
        ):
            course_meta_by_id[str(c["_id"])] = {
                "course_name": c.get("course_name") or "",
                "cert_code": (c.get("certification") or {}).get("cert_code") or "",
            }

    certs_by_user: dict[str, list] = {}
    for c in all_certs:
        certs_by_user.setdefault(str(c["user_id"]), []).append(c)
    progress_by_user: dict[str, list] = {}
    for p in all_progress:
        progress_by_user.setdefault(str(p["user_id"]), []).append(p)

    def _course_name(course_id) -> str:
        meta = course_meta_by_id.get(str(course_id), {})
        return meta.get("course_name", "")

    def _cert_code(course_id) -> str:
        meta = course_meta_by_id.get(str(course_id), {})
        return meta.get("cert_code", "")

    member_details = []
    total_certs = 0
    in_progress_count = 0
    for m in members:
        mid = str(m["_id"])
        user_certs = certs_by_user.get(mid, [])
        user_progress = progress_by_user.get(mid, [])
        in_progress = [p for p in user_progress if p.get("status") == "in_progress"]
        total_certs += len(user_certs)
        if in_progress:
            in_progress_count += 1
        member_details.append({
            "id": mid,
            "full_name": m.get("full_name"),
            "email": m.get("email"),
            "certs_completed": len(user_certs),
            "courses_in_progress": len(in_progress),
            "certifications": [
                {
                    "course_id": str(c.get("course_id", "")),
                    "course_name": _course_name(c.get("course_id")),
                    "cert_code": _cert_code(c.get("course_id")),
                    "earned_at": (
                        c["earned_at"].isoformat()
                        if hasattr(c.get("earned_at"), "isoformat") else c.get("earned_at")
                    ),
                }
                for c in user_certs
            ],
            "in_progress_courses": [
                {
                    "course_id": str(p.get("course_id", "")),
                    "course_name": _course_name(p.get("course_id")),
                    "cert_code": _cert_code(p.get("course_id")),
                    "progress_pct": p.get("progress_pct") or p.get("completion_pct") or 0,
                    "status": p.get("status"),
                }
                for p in in_progress
            ],
        })

    return {
        "team_members": member_details,
        "team_stats": {
            "total_members": len(members),
            "certs_completed": total_certs,
            "in_progress": in_progress_count,
        },
        "recent_assessments": [
            {
                **_serialize(a),
                "course_title": _course_name(a.get("course_id")),
                "cert_code": _cert_code(a.get("course_id")),
            }
            for a in recent_results[:10]
        ],
    }


# ─── Admin endpoints ────────────────────────────────────


@router.get("/admin/stats")
async def get_admin_stats(request: Request):
    db, user, _ = await _get_user(request)
    _ensure_admin(user)

    total_users = await db.users.count_documents({})
    total_learners = await db.users.count_documents({"roles": "learner"})
    total_managers = await db.users.count_documents({"roles": "manager"})
    total_certs = await db.certifications.count_documents({})
    total_roles = await db.job_roles.count_documents({})
    total_courses = await db.courses.count_documents({})

    return {
        "total_users": total_users,
        "total_learners": total_learners,
        "total_managers": total_managers,
        "total_certifications": total_certs,
        "total_roles": total_roles,
        "total_courses": total_courses,
    }


@router.get("/admin/users")
async def get_admin_users(request: Request):
    db, user, _ = await _get_user(request)
    _ensure_admin(user)

    cursor = db.users.find(
        {}, {"full_name": 1, "email": 1, "roles": 1}
    ).sort("_id", -1).limit(50)
    users = await cursor.to_list(length=50)
    return [
        {
            "id": str(u["_id"]),
            "full_name": u.get("full_name"),
            "email": u.get("email"),
            "role": primary_role(u),
        }
        for u in users
    ]
