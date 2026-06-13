from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone

from app.db.mongo import get_db

router = APIRouter(prefix="/modules", tags=["modules"])


class ModuleCreate(BaseModel):
    course_id: str
    title: str
    order: int = 0


class ModuleUpdate(BaseModel):
    title: str | None = None
    order: int | None = None


def _serialize(doc):
    doc["id"] = str(doc.pop("_id"))
    if "course_id" in doc and isinstance(doc["course_id"], ObjectId):
        doc["course_id"] = str(doc["course_id"])
    return doc


@router.get("/")
async def list_modules(course_id: str | None = None):
    """List modules, optionally filtered by course_id."""
    db = get_db()
    query = {}
    if course_id:
        query["course_id"] = ObjectId(course_id)
    cursor = db.modules.find(query).sort("order", 1)
    modules = []
    async for doc in cursor:
        modules.append(_serialize(doc))
    return modules


@router.get("/{module_id}")
async def get_module(module_id: str):
    """Get a single module by ID."""
    db = get_db()
    doc = await db.modules.find_one({"_id": ObjectId(module_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Module not found")
    return _serialize(doc)


@router.post("/", status_code=201)
async def create_module(body: ModuleCreate):
    """Create a new module for a course."""
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "course_id": ObjectId(body.course_id),
        "title": body.title,
        "order": body.order,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.modules.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.put("/{module_id}")
async def update_module(module_id: str, body: ModuleUpdate):
    """Update a module."""
    db = get_db()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.modules.update_one(
        {"_id": ObjectId(module_id)}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Module not found")
    doc = await db.modules.find_one({"_id": ObjectId(module_id)})
    return _serialize(doc)


@router.delete("/{module_id}")
async def delete_module(module_id: str):
    """Delete a module and its associated topics."""
    db = get_db()
    result = await db.modules.delete_one({"_id": ObjectId(module_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Module not found")
    # Also delete all topics belonging to this module
    await db.topics.delete_many({"module_id": ObjectId(module_id)})
    return {"deleted": True}
