import os
import re
from datetime import datetime, timezone

from bson import ObjectId

from app.db.mongo import get_db

# Local storage path for .md files (will move to Azure Blob later)
LOCAL_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "local-storage")
os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)


class CourseService:
    def __init__(self):
        self.collection_name = "courses"

    def _get_collection(self):
        return get_db()[self.collection_name]

    def _sanitize_filename(self, name: str) -> str:
        return re.sub(r'[^a-zA-Z0-9_-]', '_', name.strip().lower())

    async def create_course(self, data: dict) -> dict:
        col = self._get_collection()

        guidance_md = data.pop("guidance_markdown")

        # Save .md to local-storage
        filename = f"DOC-{self._sanitize_filename(data['course_name'])}.md"
        filepath = os.path.join(LOCAL_STORAGE_DIR, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(guidance_md)

        # Store in MongoDB
        doc = {
            **data,
            "guidance_doc_location": f"local-storage/{filename}",
            "created_at": datetime.now(timezone.utc),
            "updated_at": None,
        }
        result = await col.insert_one(doc)
        doc["id"] = str(result.inserted_id)
        doc.pop("_id", None)
        doc["created_at"] = doc["created_at"].isoformat()
        return doc

    async def _populate_doc(self, doc, skills_map: dict | None = None) -> dict:
        """Populate ObjectId references in a course document.

        Pass `skills_map` (skill_id → name) to avoid per-course N+1 skill lookups
        in list endpoints.
        """
        db = get_db()
        doc["id"] = str(doc.pop("_id"))
        if "created_at" in doc and doc["created_at"]:
            doc["created_at"] = doc["created_at"].isoformat()
        if "updated_at" in doc and doc["updated_at"]:
            doc["updated_at"] = doc["updated_at"].isoformat()

        # Populate certification.skills (flat list of ObjectId strings → names)
        cert = doc.get("certification")
        if cert and "skills" in cert:
            resolved = []
            for skill_id in cert["skills"]:
                if not isinstance(skill_id, str):
                    continue
                if skills_map is not None:
                    name = skills_map.get(skill_id, skill_id)
                    resolved.append({"name": name})
                    continue
                try:
                    skill_doc = await db.skills.find_one({"_id": ObjectId(skill_id)}, {"name": 1})
                    resolved.append({"name": skill_doc["name"] if skill_doc else skill_id})
                except Exception:
                    resolved.append({"name": skill_id})
            cert["skills"] = resolved
        return doc

    async def list_courses(self, skip: int = 0, limit: int = 50, fields: str | None = None) -> list[dict]:
        col = self._get_collection()
        db = get_db()

        # Slim "summary" projection — used by pickers (e.g. assessment
        # scheduling) that only need id + display fields. Skips skill
        # resolution and avoids shipping guidance_doc_location, modules,
        # prerequisites, full skills arrays, etc.
        if fields == "summary":
            projection = {
                "course_name": 1,
                "duration_hours": 1,
                "difficulty": 1,
                "certification.cert_code": 1,
                "certification.cert_name": 1,
                "certification.level": 1,
                "certification.vendor": 1,
            }
            cursor = col.find({}, projection).skip(skip).limit(limit).sort("created_at", -1)
            docs = await cursor.to_list(length=limit)
            out = []
            for d in docs:
                d["id"] = str(d.pop("_id"))
                out.append(d)
            return out

        cursor = col.find().skip(skip).limit(limit).sort("created_at", -1)
        docs = await cursor.to_list(length=limit)

        # Collect every skill_id referenced across all courses so we can
        # resolve names in a single batch query (avoid N+1).
        skill_ids: set[str] = set()
        for doc in docs:
            cert = doc.get("certification") or {}
            for sid in cert.get("skills", []) or []:
                if isinstance(sid, str):
                    skill_ids.add(sid)

        skills_map: dict[str, str] = {}
        if skill_ids:
            try:
                obj_ids = [ObjectId(s) for s in skill_ids]
                async for s in db.skills.find({"_id": {"$in": obj_ids}}, {"name": 1}):
                    skills_map[str(s["_id"])] = s.get("name", "")
            except Exception:
                pass

        return [await self._populate_doc(doc, skills_map=skills_map) for doc in docs]

    async def get_course(self, course_id: str) -> dict | None:
        col = self._get_collection()
        doc = await col.find_one({"_id": ObjectId(course_id)})
        if not doc:
            return None
        return await self._populate_doc(doc)

    async def delete_course(self, course_id: str) -> bool:
        col = self._get_collection()
        doc = await col.find_one({"_id": ObjectId(course_id)})
        if not doc:
            return False

        # Remove local .md file
        if "guidance_doc_location" in doc:
            path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), doc["guidance_doc_location"])
            if os.path.exists(path):
                os.remove(path)

        await col.delete_one({"_id": ObjectId(course_id)})
        return True

    async def get_guidance_markdown(self, course_id: str) -> str | None:
        col = self._get_collection()
        doc = await col.find_one({"_id": ObjectId(course_id)})
        if not doc or "guidance_doc_location" not in doc:
            return None
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), doc["guidance_doc_location"])
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    async def update_course(self, course_id: str, data: dict) -> dict | None:
        col = self._get_collection()
        doc = await col.find_one({"_id": ObjectId(course_id)})
        if not doc:
            return None

        # If guidance_markdown provided, overwrite the .md file
        guidance_md = data.pop("guidance_markdown", None)
        if guidance_md is not None and "guidance_doc_location" in doc:
            path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), doc["guidance_doc_location"])
            with open(path, "w", encoding="utf-8") as f:
                f.write(guidance_md)

        # Update MongoDB fields
        update_fields = {k: v for k, v in data.items() if v is not None}
        update_fields["updated_at"] = datetime.now(timezone.utc)

        await col.update_one({"_id": ObjectId(course_id)}, {"$set": update_fields})

        updated = await col.find_one({"_id": ObjectId(course_id)})
        return await self._populate_doc(updated)
