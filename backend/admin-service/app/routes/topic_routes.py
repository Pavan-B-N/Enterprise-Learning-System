from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone

from app.db.mongo import get_db

router = APIRouter(prefix="/topics", tags=["topics"])


class TopicCreate(BaseModel):
    course_id: str
    module_id: str
    topic_name: str
    order: int = 0
    estimated_minutes: int = 15
    content_md: str = ""
    reference_links: list[dict] = []
    key_takeaways: list[str] = []


class TopicUpdate(BaseModel):
    course_id: str | None = None
    topic_name: str | None = None
    module_id: str | None = None
    order: int | None = None
    estimated_minutes: int | None = None
    content_md: str | None = None
    reference_links: list[dict] | None = None
    key_takeaways: list[str] | None = None


def _serialize(doc):
    doc["id"] = str(doc.pop("_id"))
    if "course_id" in doc and isinstance(doc["course_id"], ObjectId):
        doc["course_id"] = str(doc["course_id"])
    if "module_id" in doc and isinstance(doc["module_id"], ObjectId):
        doc["module_id"] = str(doc["module_id"])
    return doc


@router.get("/")
async def list_topics(course_id: str | None = None, module_id: str | None = None, fields: str | None = None):
    """List topics, optionally filtered by course_id and/or module_id.
    Use fields=summary to exclude content_md (lighter response for listings).
    """
    db = get_db()
    query = {}
    if course_id:
        query["course_id"] = ObjectId(course_id)
    if module_id:
        query["module_id"] = ObjectId(module_id)

    # Projection: exclude heavy fields when summary mode requested
    projection = None
    if fields == "summary":
        projection = {"content_md": 0, "reference_links": 0, "key_takeaways": 0}

    cursor = db.topics.find(query, projection).sort("order", 1)
    topics = []
    async for doc in cursor:
        topics.append(_serialize(doc))
    return topics


@router.get("/{topic_id}")
async def get_topic(topic_id: str):
    """Get a single topic by ID."""
    db = get_db()
    doc = await db.topics.find_one({"_id": ObjectId(topic_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Topic not found")
    return _serialize(doc)


@router.post("/", status_code=201)
async def create_topic(body: TopicCreate):
    """Create a new topic."""
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "course_id": ObjectId(body.course_id),
        "module_id": ObjectId(body.module_id),
        "topic_name": body.topic_name,
        "order": body.order,
        "estimated_minutes": body.estimated_minutes,
        "content_md": body.content_md,
        "reference_links": body.reference_links,
        "key_takeaways": body.key_takeaways,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.topics.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.put("/{topic_id}")
async def update_topic(topic_id: str, body: TopicUpdate):
    """Update a topic."""
    db = get_db()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Convert string IDs to ObjectId
    if "course_id" in updates:
        updates["course_id"] = ObjectId(updates["course_id"])
    if "module_id" in updates:
        updates["module_id"] = ObjectId(updates["module_id"])
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.topics.update_one(
        {"_id": ObjectId(topic_id)}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Topic not found")
    doc = await db.topics.find_one({"_id": ObjectId(topic_id)})
    return _serialize(doc)


@router.delete("/{topic_id}", status_code=204)
async def delete_topic(topic_id: str):
    """Delete a topic."""
    db = get_db()
    result = await db.topics.delete_one({"_id": ObjectId(topic_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Topic not found")
