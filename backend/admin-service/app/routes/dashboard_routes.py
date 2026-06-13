from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter

from app.db.mongo import get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _id_str(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


@router.get("/stats")
async def get_dashboard_stats():
    db = get_db()

    total_users = await db.users.count_documents({})
    total_learners = await db.users.count_documents({"roles": "learner"})
    total_courses = await db.courses.count_documents({})
    total_certs_issued = await db.certifications.count_documents({})

    progress_docs = await db.course_progress.find(
        {}, {"status": 1, "percent_complete": 1, "last_activity": 1, "user_id": 1, "course_id": 1}
    ).to_list(length=2000)

    # Normalize ObjectId / string ids so all downstream maps key off plain strings.
    all_progress: list[dict] = []
    for p in progress_docs:
        all_progress.append({
            "status": p.get("status"),
            "percent_complete": p.get("percent_complete", 0),
            "last_activity": p.get("last_activity"),
            "user_id": _id_str(p.get("user_id")),
            "course_id": _id_str(p.get("course_id")),
        })

    completed_count = sum(1 for p in all_progress if p["status"] == "completed")
    in_progress_count = sum(1 for p in all_progress if p["status"] == "in_progress")
    avg_completion = round(
        sum(p["percent_complete"] for p in all_progress) / len(all_progress)
    ) if all_progress else 0

    course_completion_counts: dict[str, int] = {}
    for p in all_progress:
        if p["status"] == "completed" and p["course_id"]:
            course_completion_counts[p["course_id"]] = course_completion_counts.get(p["course_id"], 0) + 1

    top_course_ids = sorted(
        course_completion_counts, key=lambda c: course_completion_counts[c], reverse=True
    )[:5]
    top_courses: list[dict] = []
    if top_course_ids:
        valid_oids = [ObjectId(c) for c in top_course_ids if ObjectId.is_valid(c)]
        courses_docs = await db.courses.find(
            {"_id": {"$in": valid_oids}}, {"course_name": 1}
        ).to_list(length=5)
        name_map = {str(c["_id"]): c["course_name"] for c in courses_docs}
        for cid in top_course_ids:
            top_courses.append({
                "course_id": cid,
                "course_name": name_map.get(cid, "Unknown"),
                "completions": course_completion_counts[cid],
            })

    user_completions: dict[str, int] = {}
    for p in all_progress:
        if p["status"] == "completed" and p["user_id"]:
            user_completions[p["user_id"]] = user_completions.get(p["user_id"], 0) + 1

    top_performer_ids = sorted(
        user_completions, key=lambda u: user_completions[u], reverse=True
    )[:5]
    top_performers: list[dict] = []
    if top_performer_ids:
        valid_oids = [ObjectId(u) for u in top_performer_ids if ObjectId.is_valid(u)]
        perf_users = await db.users.find(
            {"_id": {"$in": valid_oids}}, {"full_name": 1}
        ).to_list(length=5)
        perf_map = {str(u["_id"]): u.get("full_name") for u in perf_users}
        for uid in top_performer_ids:
            total_enrolled = sum(1 for p in all_progress if p["user_id"] == uid)
            top_performers.append({
                "user_name": perf_map.get(uid, "Unknown"),
                "courses_completed": user_completions[uid],
                "total_enrolled": total_enrolled,
            })

    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=14)
    cutoff_iso = cutoff_dt.isoformat()
    at_risk: list[dict] = []
    for p in all_progress:
        if p["status"] != "in_progress":
            continue
        la = p["last_activity"]
        la_str: str | None
        if isinstance(la, datetime):
            la_str = la.isoformat()
        elif isinstance(la, str):
            la_str = la
        else:
            la_str = None
        if la_str and la_str < cutoff_iso:
            at_risk.append({
                "user_id": p["user_id"],
                "course_id": p["course_id"],
                "percent_complete": p["percent_complete"],
                "last_activity": la_str,
            })

    ar_user_ids = list({a["user_id"] for a in at_risk if a["user_id"]})
    ar_course_ids = list({a["course_id"] for a in at_risk if a["course_id"]})

    ar_user_map: dict[str, str] = {}
    if ar_user_ids:
        valid_oids = [ObjectId(u) for u in ar_user_ids if ObjectId.is_valid(u)]
        ar_users = await db.users.find(
            {"_id": {"$in": valid_oids}}, {"full_name": 1}
        ).to_list(length=50)
        ar_user_map = {str(u["_id"]): u.get("full_name") for u in ar_users}

    ar_course_map: dict[str, str] = {}
    if ar_course_ids:
        valid_oids = [ObjectId(c) for c in ar_course_ids if ObjectId.is_valid(c)]
        ar_courses = await db.courses.find(
            {"_id": {"$in": valid_oids}}, {"course_name": 1}
        ).to_list(length=50)
        ar_course_map = {str(c["_id"]): c.get("course_name") for c in ar_courses}

    for a in at_risk:
        a["user_name"] = ar_user_map.get(a["user_id"], "Unknown")
        a["course_name"] = ar_course_map.get(a["course_id"], "Unknown")

    return {
        "total_users": total_users,
        "total_learners": total_learners,
        "total_courses": total_courses,
        "total_certs_issued": total_certs_issued,
        "completed_enrollments": completed_count,
        "in_progress_enrollments": in_progress_count,
        "avg_completion": avg_completion,
        "top_courses": top_courses,
        "top_performers": top_performers,
        "at_risk_learners": at_risk[:10],
    }
