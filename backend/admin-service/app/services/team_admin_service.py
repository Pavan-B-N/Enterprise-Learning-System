from bson import ObjectId

from app.db.mongo import get_db


def _primary_role(user: dict) -> str:
    roles = user.get("roles") or ([user["role"]] if user.get("role") else [])
    for priority in ("admin", "manager", "learner"):
        if priority in roles:
            return priority
    return roles[0] if roles else "learner"


class TeamAdminService:
    """Team management using the reports_to hierarchy in `users`."""

    async def list_teams(self) -> list:
        """List all managers and their direct report counts."""
        db = get_db()
        managers = await db.users.find({"roles": "manager"}).to_list(length=100)

        teams = []
        for m in managers:
            mid = m["_id"]
            count = await db.users.count_documents(
                {"reports_to": {"$in": [mid, str(mid)]}}
            )
            teams.append({
                "id": str(mid),
                "manager_name": m.get("full_name"),
                "manager_email": m.get("email"),
                "member_count": count,
            })
        return teams

    async def get_team(self, manager_id: str) -> dict | None:
        if not ObjectId.is_valid(manager_id):
            return None
        db = get_db()
        manager = await db.users.find_one({"_id": ObjectId(manager_id)})
        if not manager:
            return None
        return {
            "id": str(manager["_id"]),
            "manager_name": manager.get("full_name"),
            "manager_email": manager.get("email"),
        }

    async def create_team(self, data: dict) -> dict:
        return {"message": "Teams are managed via user reports_to field"}

    async def update_team(self, manager_id: str, data: dict) -> dict | None:
        return {"message": "Teams are managed via user reports_to field"}

    async def delete_team(self, manager_id: str) -> bool:
        return False

    async def get_team_report(self, manager_id: str) -> dict | None:
        if not ObjectId.is_valid(manager_id):
            return None
        db = get_db()
        manager_oid = ObjectId(manager_id)
        manager = await db.users.find_one({"_id": manager_oid})
        if not manager:
            return None

        members = await db.users.find(
            {"reports_to": {"$in": [manager_oid, manager_id]}}
        ).to_list(length=50)

        member_oids = [m["_id"] for m in members]
        member_id_strs = [str(o) for o in member_oids]

        certs = await db.certifications.find(
            {"user_id": {"$in": member_oids + member_id_strs}}
        ).to_list(length=200)

        certs_by_user: dict[str, list] = {}
        for c in certs:
            certs_by_user.setdefault(str(c["user_id"]), []).append(c)

        member_list = []
        for m in members:
            mid = str(m["_id"])
            member_list.append({
                "id": mid,
                "full_name": m.get("full_name"),
                "email": m.get("email"),
                "role": _primary_role(m),
                "certs_earned": len(certs_by_user.get(mid, [])),
            })

        return {
            "manager": {
                "id": str(manager["_id"]),
                "full_name": manager.get("full_name"),
                "email": manager.get("email"),
            },
            "members": member_list,
            "total_members": len(members),
        }
