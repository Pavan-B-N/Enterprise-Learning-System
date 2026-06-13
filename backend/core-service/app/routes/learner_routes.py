from fastapi import APIRouter, Request, HTTPException
from bson import ObjectId

from app.db.mongo import get_db
from app.db.helpers import oid_filter, primary_role

router = APIRouter(prefix="/learners", tags=["learners"])


def _required_uid(request: Request) -> ObjectId:
    user_id = request.headers.get("X-User-Id")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="User ID not provided")
    return ObjectId(user_id)


@router.get("/me")
async def get_my_profile(request: Request):
    """Returns the current user's learner profile."""
    db = get_db()
    user = await db.users.find_one({"_id": _required_uid(request)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

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
            profile["job_role"] = role_doc.get("role_name")

    return profile


@router.get("/me/dashboard")
async def get_my_dashboard(request: Request):
    """Returns all dashboard data in a single call."""
    db = get_db()
    user_oid = _required_uid(request)
    user = await db.users.find_one({"_id": user_oid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role_info = None
    required_course_oids: list[ObjectId] = []
    if user.get("job_role"):
        role_doc = await db.job_roles.find_one({"_id": user["job_role"]})
        if role_doc:
            role_info = {
                "role_name": role_doc.get("role_name"),
                "description": role_doc.get("description", ""),
            }
            for c in role_doc.get("required_courses") or []:
                if isinstance(c, ObjectId):
                    required_course_oids.append(c)
                elif isinstance(c, str) and ObjectId.is_valid(c):
                    required_course_oids.append(ObjectId(c))

    progress_records = await db.course_progress.find(
        oid_filter("user_id", user_oid)
    ).to_list(length=50)
    earned_certs = await db.certifications.find(
        oid_filter("user_id", user_oid)
    ).to_list(length=50)
    recent_results = (
        await db.assessment_results.find(oid_filter("user_id", user_oid))
        .sort("submitted_at", -1)
        .to_list(length=20)
    )

    cert_status = []
    if required_course_oids:
        courses = await db.courses.find(
            {"_id": {"$in": required_course_oids}}
        ).to_list(length=20)

        def _cid(doc: dict, field: str = "course_id") -> str:
            v = doc.get(field)
            return str(v) if v is not None else ""

        earned_by_course = {_cid(c): c for c in earned_certs}
        progress_by_course = {_cid(p): p for p in progress_records}
        results_by_course: dict[str, list[dict]] = {}
        for r in recent_results:
            results_by_course.setdefault(_cid(r), []).append(r)

        for course in courses:
            cid = str(course["_id"])
            cert_info = course.get("certification") or {}
            progress = progress_by_course.get(cid)
            earned = earned_by_course.get(cid)

            if earned:
                status = "completed"
            elif progress:
                status = progress.get("status", "in_progress")
            else:
                status = "not_started"

            latest_score = None
            for r in results_by_course.get(cid, []):
                latest_score = r.get("score_percentage")
                break

            cert_status.append({
                "course_id": cid,
                "course_name": course.get("course_name", ""),
                "cert_code": cert_info.get("cert_code", ""),
                "cert_name": cert_info.get("cert_name", ""),
                "status": status,
                "latest_score": latest_score,
            })

    def _iso(v):
        return v.isoformat() if hasattr(v, "isoformat") else v

    return {
        "user": {
            "full_name": user.get("full_name"),
            "email": user.get("email"),
            "role": primary_role(user),
        },
        "role_info": role_info,
        "certifications": cert_status,
        "assessments": [
            {
                "course_id": str(a.get("course_id")) if a.get("course_id") else "",
                "score_percentage": a.get("score_percentage"),
                "passed": a.get("passed"),
                "submitted_at": _iso(a.get("submitted_at")),
                "readiness_level": a.get("readiness_level"),
            }
            for a in recent_results[:10]
        ],
    }
