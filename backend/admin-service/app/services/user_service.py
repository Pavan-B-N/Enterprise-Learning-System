"""Admin user-management service.

Per schema v5.0.0 the `users` collection holds profile data and the
`user_credentials` collection stores the password hash keyed by user_id
(ObjectId). The role list lives on `users.roles` (array of string).
"""
from datetime import datetime, timezone

import bcrypt
from bson import ObjectId

from app.db.mongo import get_db


def _to_oid(value) -> ObjectId | None:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str) and ObjectId.is_valid(value):
        return ObjectId(value)
    return None


def _primary_role(roles) -> str:
    if not roles:
        return "learner"
    if isinstance(roles, str):
        return roles
    for priority in ("admin", "manager", "learner"):
        if priority in roles:
            return priority
    return roles[0]


class UserService:
    def __init__(self):
        self._collection = "users"

    def _get_collection(self):
        return get_db()[self._collection]

    async def _populate_doc(self, doc) -> dict:
        """Populate ObjectId references with human-readable data."""
        db = get_db()
        doc["id"] = str(doc.pop("_id"))

        roles = doc.get("roles") or ([doc["role"]] if doc.get("role") else [])
        doc["roles"] = roles
        doc["role"] = _primary_role(roles)

        reports_to_oid = _to_oid(doc.get("reports_to"))
        if reports_to_oid:
            manager = await db.users.find_one({"_id": reports_to_oid}, {"full_name": 1})
            if manager:
                doc["reports_to_name"] = manager.get("full_name")
            doc["reports_to"] = str(reports_to_oid)

        job_role_oid = _to_oid(doc.get("job_role"))
        if job_role_oid:
            role_doc = await db.job_roles.find_one(
                {"_id": job_role_oid}, {"role_name": 1}
            )
            if role_doc:
                doc["job_role_name"] = role_doc.get("role_name")
            doc["job_role"] = str(job_role_oid)

        return doc

    async def list_users(self, skip: int = 0, limit: int = 50) -> list:
        cursor = self._get_collection().find(
            {}, {"password_hash": 0}
        ).skip(skip).limit(limit)
        users = []
        async for doc in cursor:
            users.append(await self._populate_doc(doc))
        return users

    async def get_user(self, user_id: str) -> dict | None:
        oid = _to_oid(user_id)
        if not oid:
            return None
        doc = await self._get_collection().find_one(
            {"_id": oid}, {"password_hash": 0}
        )
        if doc:
            return await self._populate_doc(doc)
        return doc

    async def create_user(self, data: dict) -> dict:
        db = get_db()
        password = data.pop("password")
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        role = (data.get("role") or "learner").strip().lower()
        roles = [role] if role else ["learner"]

        reports_to_oid = _to_oid(data.get("reports_to"))
        job_role_oid = _to_oid(data.get("job_role"))

        now = datetime.now(timezone.utc)
        user_doc = {
            "email": data["email"],
            "full_name": data["full_name"],
            "roles": roles,
            "job_title": data.get("job_title"),
            "reports_to": reports_to_oid,
            "job_role": job_role_oid,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "schema_version": 1,
        }
        result = await self._get_collection().insert_one(user_doc)
        user_oid = result.inserted_id

        # Credentials live in their own collection per schema.
        await db.user_credentials.update_one(
            {"user_id": user_oid},
            {
                "$set": {
                    "user_id": user_oid,
                    "password_hash": password_hash,
                    "must_change_password": False,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now, "schema_version": 1},
            },
            upsert=True,
        )

        return {
            "id": str(user_oid),
            "email": user_doc["email"],
            "role": _primary_role(roles),
            "roles": roles,
        }

    async def update_user(self, user_id: str, data: dict) -> dict | None:
        oid = _to_oid(user_id)
        if not oid:
            return None
        allowed = {"full_name", "email", "job_title", "reports_to", "job_role"}
        updates: dict = {}
        for key in allowed:
            if key in data and data[key] is not None:
                if key in ("reports_to", "job_role"):
                    updates[key] = _to_oid(data[key])
                else:
                    updates[key] = data[key]
        # Single-role update is converted to a roles list to stay schema-aligned.
        if data.get("role"):
            updates["roles"] = [str(data["role"]).strip().lower()]
        if not updates:
            return await self.get_user(user_id)
        updates["updated_at"] = datetime.now(timezone.utc)
        await self._get_collection().update_one({"_id": oid}, {"$set": updates})
        return await self.get_user(user_id)

    async def update_role(self, user_id: str, role: str) -> bool:
        oid = _to_oid(user_id)
        if not oid:
            return False
        result = await self._get_collection().update_one(
            {"_id": oid},
            {"$set": {
                "roles": [role.strip().lower()],
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        return result.modified_count > 0

    async def delete_user(self, user_id: str) -> bool:
        oid = _to_oid(user_id)
        if not oid:
            return False
        db = get_db()
        await db.user_credentials.delete_many({"user_id": oid})
        result = await self._get_collection().delete_one({"_id": oid})
        return result.deleted_count > 0
