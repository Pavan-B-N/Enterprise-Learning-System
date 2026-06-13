from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.db.mongo import get_db

router = APIRouter(prefix="/skills", tags=["skills"])


class CreateSkillRequest(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = ""


@router.get("/")
async def list_skills():
    db = get_db()
    cursor = db.skills.find().sort("name", 1)
    skills = []
    async for doc in cursor:
        skills.append({"id": str(doc["_id"]), "name": doc["name"], "category": doc.get("category", "")})
    return skills


@router.post("/", status_code=201)
async def create_skill(body: CreateSkillRequest):
    db = get_db()
    # Check if skill already exists
    existing = await db.skills.find_one({"name": body.name})
    if existing:
        return {"id": str(existing["_id"]), "name": existing["name"], "category": existing.get("category", "")}
    doc = {"name": body.name, "category": body.category}
    result = await db.skills.insert_one(doc)
    return {"id": str(result.inserted_id), "name": body.name, "category": body.category}
