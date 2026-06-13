from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db.mongo import get_db
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])
user_service = UserService()


class CreateUserRequest(BaseModel):
    email: str
    password: str = "Pass123!"
    full_name: str
    role: str  # learner, manager, admin
    job_title: str | None = None
    job_role: str | None = None  # ObjectId string of a job_roles doc
    reports_to: str | None = None  # ObjectId string of the manager user


class UpdateRoleRequest(BaseModel):
    role: str


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    email: str | None = None
    role: str | None = None
    job_title: str | None = None
    job_role: str | None = None
    reports_to: str | None = None


@router.get("/")
async def list_users(skip: int = 0, limit: int = 50):
    return await user_service.list_users(skip, limit)


@router.get("/{user_id}")
async def get_user(user_id: str):
    user = await user_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/{user_id}/progress")
async def get_user_progress(user_id: str):
    """Get course progress for a specific user (admin view)."""
    from bson import ObjectId

    db = get_db()
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user_id")
    user_oid = ObjectId(user_id)
    records = await db.course_progress.find(
        {"user_id": {"$in": [user_oid, user_id]}}, {"_id": 0}
    ).sort("last_activity", -1).to_list(length=50)

    course_oids = [r["course_id"] for r in records if isinstance(r.get("course_id"), ObjectId)]
    course_oids += [
        ObjectId(r["course_id"]) for r in records
        if isinstance(r.get("course_id"), str) and ObjectId.is_valid(r["course_id"])
    ]
    if course_oids:
        courses = await db.courses.find(
            {"_id": {"$in": course_oids}}, {"course_name": 1}
        ).to_list(length=50)
        name_map = {str(c["_id"]): c["course_name"] for c in courses}
        for r in records:
            cid = r.get("course_id")
            r["course_id"] = str(cid) if cid is not None else None
            r["course_name"] = name_map.get(r.get("course_id"), "")
    return records


@router.post("/", status_code=201)
async def create_user(body: CreateUserRequest):
    return await user_service.create_user(body.model_dump())


@router.put("/{user_id}/role")
async def update_user_role(user_id: str, body: UpdateRoleRequest):
    updated = await user_service.update_role(user_id, body.role)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Role updated"}


@router.put("/{user_id}")
async def update_user(user_id: str, body: UpdateUserRequest):
    updated = await user_service.update_user(user_id, body.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return updated


@router.delete("/{user_id}")
async def delete_user(user_id: str):
    deleted = await user_service.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}
