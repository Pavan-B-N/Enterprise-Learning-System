"""Assessment scheduling routes (core-service).

Exposes:
  POST   /assessment-schedules          schedule a new assessment (publishes SB job)
  GET    /assessment-schedules/active   one or zero active schedules for current user
  GET    /assessment-schedules/{id}     full schedule (questions returned WITHOUT correct_index)
  POST   /assessment-schedules/{id}/start    mark started, freeze deadline
  POST   /assessment-schedules/{id}/submit   mark completed, score, store result

Single-active-schedule rule: a learner can only have one schedule that is in
status pending|generating|ready|in_progress at any time. Any new POST while an
active one exists returns 409.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import settings
from app.db.mongo import get_db
from app.services.servicebus import ServiceBusPublisher

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assessment-schedules", tags=["assessment-schedules"])

ACTIVE_STATUSES = ("pending", "generating", "ready", "in_progress")
PASS_THRESHOLD = 70


# Module-level singleton; lifespan in main.py closes it.
publisher = ServiceBusPublisher(
    settings.AZURE_SERVICE_BUS_CONNECTION_STRING,
    source="core-service",
)


# ---------- helpers ----------------------------------------------------------


def _user_id(request: Request) -> str:
    uid = request.headers.get("X-User-Id", "")
    if not uid:
        raise HTTPException(status_code=400, detail="missing X-User-Id")
    return uid


def _user_filter(uid: str) -> dict:
    if ObjectId.is_valid(uid):
        return {"user_id": ObjectId(uid)}
    return {"user_id": uid}


def _serialize(doc: dict, *, hide_correct: bool = True) -> dict:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    for key in ("user_id", "course_id"):
        if isinstance(out.get(key), ObjectId):
            out[key] = str(out[key])
    for key in ("scheduled_at", "ready_at", "started_at", "ends_at", "submitted_at", "updated_at"):
        v = out.get(key)
        if isinstance(v, datetime):
            out[key] = v.isoformat()
    if hide_correct and isinstance(out.get("questions"), list):
        out["questions"] = [
            {k: v for k, v in q.items() if k != "correct_index"} for q in out["questions"]
        ]
    return out


async def _load_active(uid: str) -> dict | None:
    db = get_db()
    return await db.assessment_schedules.find_one(
        {**_user_filter(uid), "status": {"$in": list(ACTIVE_STATUSES)}}
    )


async def _attach_questions(schedule: dict, *, hide_correct: bool) -> dict:
    db = get_db()
    qdoc = await db.assessment_questions.find_one({"schedule_id": schedule["_id"]})
    questions = (qdoc or {}).get("questions") or []
    schedule = dict(schedule)
    schedule["questions"] = questions
    return _serialize(schedule, hide_correct=hide_correct)


# ---------- request/response models -----------------------------------------


class ScheduleCreate(BaseModel):
    course_id: str = Field(..., min_length=1)


class StartResponse(BaseModel):
    id: str
    status: str
    started_at: str
    ends_at: str
    duration_minutes: int


class AnswerItem(BaseModel):
    index: int
    selected_index: int


class SubmitRequest(BaseModel):
    answers: list[AnswerItem] = []
    proctor_violations: list[dict] = []


# ---------- routes ----------------------------------------------------------


@router.post("")
async def create_schedule(payload: ScheduleCreate, request: Request):
    uid = _user_id(request)
    db = get_db()

    if await _load_active(uid):
        raise HTTPException(status_code=409, detail="active_schedule_exists")

    if not ObjectId.is_valid(payload.course_id):
        raise HTTPException(status_code=400, detail="invalid course_id")

    course = await db.courses.find_one({"_id": ObjectId(payload.course_id)})
    if not course:
        raise HTTPException(status_code=404, detail="course_not_found")

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": ObjectId(uid) if ObjectId.is_valid(uid) else uid,
        "course_id": ObjectId(payload.course_id),
        "course_name": course.get("course_name") or "",
        "cert_code": ((course.get("certification") or {}).get("cert_code") or "").strip(),
        "status": "pending",
        "question_count": 0,
        "duration_minutes": 0,
        "scheduled_at": now,
        "ready_at": None,
        "started_at": None,
        "ends_at": None,
        "submitted_at": None,
        "score_percentage": None,
        "passed": None,
        "proctor_violations": [],
        "updated_at": now,
    }
    res = await db.assessment_schedules.insert_one(doc)
    schedule_id = str(res.inserted_id)

    # Publish job to assessment-service.
    if settings.AZURE_SERVICE_BUS_CONNECTION_STRING:
        try:
            await publisher.publish(
                settings.SB_QUEUE_ASSESSMENT_JOBS,
                subject="assessment.scheduled",
                data={
                    "schedule_id": schedule_id,
                    "user_id": uid,
                    "course_id": payload.course_id,
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("SB publish failed: %s", exc, exc_info=True)
            # Roll status forward so UI can show 'failed' state.
            await db.assessment_schedules.update_one(
                {"_id": res.inserted_id},
                {"$set": {"status": "failed", "error": "queue_unavailable"}},
            )
            raise HTTPException(status_code=502, detail="queue_unavailable")
    else:
        logger.warning("SB connection missing; schedule %s left in pending", schedule_id)

    doc["_id"] = res.inserted_id
    return {"schedule": _serialize(doc)}


@router.get("/active")
async def get_active(request: Request):
    uid = _user_id(request)
    schedule = await _load_active(uid)
    if not schedule:
        return {"schedule": None}
    return {"schedule": _serialize(schedule, hide_correct=True)}


@router.get("/{schedule_id}")
async def get_schedule(schedule_id: str, request: Request):
    uid = _user_id(request)
    if not ObjectId.is_valid(schedule_id):
        raise HTTPException(status_code=400, detail="invalid schedule_id")

    db = get_db()
    schedule = await db.assessment_schedules.find_one(
        {"_id": ObjectId(schedule_id), **_user_filter(uid)}
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="not_found")

    # Hide correct answers unless completed (so review can show explanations).
    hide = schedule.get("status") not in ("completed", "expired")
    return {"schedule": await _attach_questions(schedule, hide_correct=hide)}


@router.post("/{schedule_id}/start")
async def start_schedule(schedule_id: str, request: Request):
    uid = _user_id(request)
    if not ObjectId.is_valid(schedule_id):
        raise HTTPException(status_code=400, detail="invalid schedule_id")

    db = get_db()
    now = datetime.now(timezone.utc)
    schedule = await db.assessment_schedules.find_one(
        {"_id": ObjectId(schedule_id), **_user_filter(uid)}
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="not_found")
    if schedule["status"] not in ("ready", "in_progress"):
        raise HTTPException(status_code=409, detail=f"not_startable: {schedule['status']}")

    duration = int(schedule.get("duration_minutes") or schedule.get("question_count") or 0)
    if duration <= 0:
        raise HTTPException(status_code=409, detail="no_duration")

    if schedule["status"] == "ready":
        ends = now + timedelta(minutes=duration)
        await db.assessment_schedules.update_one(
            {"_id": schedule["_id"]},
            {"$set": {
                "status": "in_progress",
                "started_at": now,
                "ends_at": ends,
                "updated_at": now,
            }},
        )
        schedule["started_at"] = now
        schedule["ends_at"] = ends
        schedule["status"] = "in_progress"

    return StartResponse(
        id=str(schedule["_id"]),
        status="in_progress",
        started_at=schedule["started_at"].isoformat(),
        ends_at=schedule["ends_at"].isoformat(),
        duration_minutes=duration,
    )


@router.post("/{schedule_id}/submit")
async def submit_schedule(schedule_id: str, payload: SubmitRequest, request: Request):
    uid = _user_id(request)
    if not ObjectId.is_valid(schedule_id):
        raise HTTPException(status_code=400, detail="invalid schedule_id")

    db = get_db()
    schedule = await db.assessment_schedules.find_one(
        {"_id": ObjectId(schedule_id), **_user_filter(uid)}
    )
    if not schedule:
        raise HTTPException(status_code=404, detail="not_found")
    if schedule["status"] not in ("in_progress", "ready"):
        raise HTTPException(status_code=409, detail=f"not_submittable: {schedule['status']}")

    qdoc = await db.assessment_questions.find_one({"schedule_id": schedule["_id"]})
    questions = (qdoc or {}).get("questions") or []
    answers_by_index = {a.index: a.selected_index for a in payload.answers}

    correct = 0
    per_topic: dict[str, dict] = {}
    for q in questions:
        idx = q.get("index")
        topic = q.get("topic") or ""
        bucket = per_topic.setdefault(topic, {"total": 0, "correct": 0})
        bucket["total"] += 1
        sel = answers_by_index.get(idx)
        if sel is not None and sel == q.get("correct_index"):
            correct += 1
            bucket["correct"] += 1

    total = max(len(questions), 1)
    score = round(correct * 100 / total, 2)
    passed = score >= PASS_THRESHOLD

    weak = [t for t, v in per_topic.items() if v["total"] and v["correct"] / v["total"] < 0.5]
    strong = [t for t, v in per_topic.items() if v["total"] and v["correct"] / v["total"] >= 0.8]

    now = datetime.now(timezone.utc)
    await db.assessment_schedules.update_one(
        {"_id": schedule["_id"]},
        {"$set": {
            "status": "completed",
            "submitted_at": now,
            "answers": [a.model_dump() for a in payload.answers],
            "proctor_violations": [
                v if isinstance(v, dict) else {"value": v}
                for v in payload.proctor_violations
            ],
            "score_percentage": score,
            "passed": passed,
            "correct_count": correct,
            "total_questions": total,
            "per_topic_breakdown": per_topic,
            "weak_areas": weak,
            "strong_areas": strong,
            "updated_at": now,
        }},
    )

    # Persist the canonical result into `assessment_results` per schema v5.0.0.
    # Resolve topic names → topic_ids against the course's topics collection so
    # downstream agents can index by topic_id.
    topic_docs = await db.topics.find(
        {"course_id": schedule["course_id"]}, {"topic_name": 1}
    ).to_list(length=200)
    topic_id_by_name = {(t.get("topic_name") or "").strip().lower(): t["_id"] for t in topic_docs}

    per_topic_breakdown: list[dict] = []
    weak_topic_ids: list[ObjectId] = []
    strong_topic_ids: list[ObjectId] = []
    for tname, v in per_topic.items():
        tid = topic_id_by_name.get((tname or "").strip().lower())
        per_topic_breakdown.append({
            "topic_id": tid,
            "topic_name": tname,
            "total": v["total"],
            "correct": v["correct"],
        })
        if tid is None:
            continue
        ratio = (v["correct"] / v["total"]) if v["total"] else 0
        if ratio < 0.5:
            weak_topic_ids.append(tid)
        elif ratio >= 0.8:
            strong_topic_ids.append(tid)

    readiness_level = "Ready" if score >= 80 else ("Almost Ready" if score >= 60 else "Not Ready")
    await db.assessment_results.insert_one({
        "schedule_id": schedule["_id"],
        "user_id": schedule["user_id"],
        "course_id": schedule["course_id"],
        "score_percentage": score,
        "pass_threshold": PASS_THRESHOLD,
        "passed": passed,
        "readiness_level": readiness_level,
        "correct_count": correct,
        "total_questions": total,
        "per_topic_breakdown": per_topic_breakdown,
        "weak_topic_ids": weak_topic_ids,
        "strong_topic_ids": strong_topic_ids,
        "proctor": {
            "blocked": bool(payload.proctor_violations),
            "violations": [
                v if isinstance(v, dict) else {"value": v}
                for v in payload.proctor_violations
            ],
            "summary": {},
        },
        "time_spent_minutes": int(schedule.get("duration_minutes") or 0),
        "submitted_at": now,
        "schema_version": 1,
    })

    return {
        "id": schedule_id,
        "status": "completed",
        "score_percentage": score,
        "passed": passed,
        "correct_count": correct,
        "total_questions": total,
        "per_topic_breakdown": per_topic,
        "weak_areas": weak,
        "strong_areas": strong,
    }
