from datetime import datetime, timezone

from bson import ObjectId

from app.db.mongo import get_db


class RoleService:
    def __init__(self):
        self.collection_name = "job_roles"

    def _get_collection(self):
        return get_db()[self.collection_name]

    async def _populate_doc(self, doc) -> dict:
        """Populate ObjectId references with human-readable data."""
        db = get_db()
        doc["id"] = str(doc.pop("_id"))

        # Populate level (ObjectId string → level_id + level_name)
        level_val = doc.get("level")
        if level_val:
            try:
                level_doc = await db.job_levels.find_one({"_id": ObjectId(level_val)})
                if level_doc:
                    doc["level"] = level_doc.get("level_id", "").replace("L", "")
                    doc["level_name"] = level_doc.get("level_name", "")
            except Exception:
                pass

        # Populate required_courses (list of ObjectId strings → course names)
        raw_courses = doc.get("required_courses", [])
        if raw_courses:
            populated_courses = []
            for cid in raw_courses:
                try:
                    c = await db.courses.find_one({"_id": ObjectId(cid)}, {"course_name": 1})
                    if c:
                        populated_courses.append(c["course_name"])
                    else:
                        populated_courses.append(cid)
                except Exception:
                    populated_courses.append(cid)
            doc["required_courses"] = populated_courses

        # Populate required_skills (list of ObjectId strings → skill names)
        raw_skills = doc.get("required_skills", [])
        if raw_skills:
            populated_skills = []
            for sid in raw_skills:
                try:
                    s = await db.skills.find_one({"_id": ObjectId(sid)}, {"name": 1})
                    if s:
                        populated_skills.append(s["name"])
                    else:
                        populated_skills.append(sid)
                except Exception:
                    populated_skills.append(sid)
            doc["required_skills"] = populated_skills

        if "created_at" in doc and doc["created_at"]:
            doc["created_at"] = doc["created_at"].isoformat()
        if "updated_at" in doc and doc["updated_at"]:
            doc["updated_at"] = doc["updated_at"].isoformat()
        return doc

    async def create_role(self, data: dict) -> dict:
        col = self._get_collection()
        doc = {
            **data,
            "created_at": datetime.now(timezone.utc),
            "updated_at": None,
        }
        result = await col.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        doc.pop("_id", None)
        doc["created_at"] = doc["created_at"].isoformat()
        return doc

    async def list_roles(self, skip: int = 0, limit: int = 50) -> list[dict]:
        col = self._get_collection()
        cursor = col.find().skip(skip).limit(limit).sort("created_at", -1)
        roles = []
        async for doc in cursor:
            roles.append(await self._populate_doc(doc))
        return roles

    async def get_role(self, role_id: str) -> dict | None:
        col = self._get_collection()
        doc = await col.find_one({"_id": ObjectId(role_id)})
        if not doc:
            return None
        return await self._populate_doc(doc)

    async def update_role(self, role_id: str, data: dict) -> dict | None:
        col = self._get_collection()
        doc = await col.find_one({"_id": ObjectId(role_id)})
        if not doc:
            return None

        update_fields = {k: v for k, v in data.items() if v is not None}
        update_fields["updated_at"] = datetime.now(timezone.utc)

        await col.update_one({"_id": ObjectId(role_id)}, {"$set": update_fields})

        updated = await col.find_one({"_id": ObjectId(role_id)})
        return await self._populate_doc(updated)

    async def delete_role(self, role_id: str) -> bool:
        col = self._get_collection()
        result = await col.delete_one({"_id": ObjectId(role_id)})
        return result.deleted_count > 0
