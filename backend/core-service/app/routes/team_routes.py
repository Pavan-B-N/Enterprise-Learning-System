from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

from app.db.helpers import primary_role
from app.db.mongo import get_db

router = APIRouter(prefix="/teams", tags=["teams"])


@router.get("/{manager_id}")
async def get_team(manager_id: str, request: Request):
    """Get team info for a manager (users who report to this manager)."""
    if not ObjectId.is_valid(manager_id):
        raise HTTPException(status_code=400, detail="Invalid manager_id")
    db = get_db()
    manager_oid = ObjectId(manager_id)
    manager = await db.users.find_one({"_id": manager_oid})
    if not manager:
        raise HTTPException(status_code=404, detail="Manager not found")

    members = await db.users.find(
        {"reports_to": {"$in": [manager_oid, manager_id]}},
        {"full_name": 1, "email": 1, "roles": 1, "role": 1},
    ).to_list(length=50)

    return {
        "manager": {
            "id": str(manager["_id"]),
            "full_name": manager.get("full_name"),
            "email": manager.get("email"),
            "role": primary_role(manager),
        },
        "members": [
            {
                "id": str(m["_id"]),
                "full_name": m.get("full_name"),
                "email": m.get("email"),
                "role": primary_role(m),
            }
            for m in members
        ],
    }
