"""Chat history persistence — conversations and messages.

Storage model
-------------
- chat_conversations: one document per conversation
    _id, user_id, title, created_at, updated_at, last_message_at, message_count
- chat_messages: one document per message
    _id, conversation_id, user_id, role, content, agent?, is_error?, created_at

The orchestrator's /chat endpoint stays stateless. The frontend appends
messages to a conversation here AFTER receiving the AI response, so that
persistence is independent of agent execution.
"""

from datetime import datetime, timedelta, timezone
from typing import Literal

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.db.mongo import get_db

router = APIRouter(prefix="/chat", tags=["chat"])


# ─── Helpers ─────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _require_user_id(request: Request) -> str:
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not provided")
    return user_id


def _require_user_oid(request: Request) -> ObjectId:
    raw = _require_user_id(request)
    if not ObjectId.is_valid(raw):
        raise HTTPException(status_code=400, detail="Invalid User ID")
    return ObjectId(raw)


def _to_object_id(value: str, label: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def _serialize_conv(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "title": doc.get("title") or "New Chat",
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
        "last_message_at": doc.get("last_message_at"),
        "message_count": int(doc.get("message_count", 0)),
    }


def _serialize_msg(doc: dict) -> dict:
    cid = doc.get("conversation_id")
    return {
        "id": str(doc["_id"]),
        "conversation_id": str(cid) if cid is not None else None,
        "role": doc.get("role"),
        "content": doc.get("content", ""),
        "agent": doc.get("agent"),
        "is_error": bool(doc.get("is_error", False)),
        "created_at": doc.get("created_at"),
    }


def _derive_title(content: str) -> str:
    cleaned = " ".join((content or "").split())
    if not cleaned:
        return "New Chat"
    return (cleaned[:60] + "…") if len(cleaned) > 60 else cleaned


async def _load_conversation(db, conv_id: str, user_oid: ObjectId) -> dict:
    oid = _to_object_id(conv_id, "conversation_id")
    conv = await db.chat_conversations.find_one({
        "_id": oid,
        "user_id": {"$in": [user_oid, str(user_oid)]},
    })
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


# ─── Pydantic models ─────────────────────────────────────

class CreateConversationBody(BaseModel):
    title: str | None = None


class UpdateConversationBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class MessageInput(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)
    agent: str | None = None
    is_error: bool | None = False

    @field_validator("content")
    @classmethod
    def _strip_content(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("content cannot be empty")
        return v


class AppendMessagesBody(BaseModel):
    messages: list[MessageInput] = Field(min_length=1, max_length=10)


# ─── GET /chat/conversations ─────────────────────────────

@router.get("/conversations")
async def list_conversations(request: Request):
    user_oid = _require_user_oid(request)
    db = get_db()
    cursor = (
        db.chat_conversations
        .find({"user_id": {"$in": [user_oid, str(user_oid)]}})
        .sort("last_message_at", -1)
        .limit(200)
    )
    docs = await cursor.to_list(length=200)
    return [_serialize_conv(d) for d in docs]


# ─── POST /chat/conversations ────────────────────────────

@router.post("/conversations", status_code=201)
async def create_conversation(request: Request, body: CreateConversationBody):
    user_oid = _require_user_oid(request)
    db = get_db()
    now = _now()
    title = (body.title or "").strip() or "New Chat"
    if len(title) > 200:
        title = title[:200]
    doc = {
        "user_id": user_oid,
        "title": title,
        "created_at": now,
        "updated_at": now,
        "last_message_at": now,
        "message_count": 0,
    }
    result = await db.chat_conversations.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_conv(doc)


# ─── GET /chat/conversations/{id} ────────────────────────

@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, request: Request):
    user_oid = _require_user_oid(request)
    db = get_db()
    conv = await _load_conversation(db, conv_id, user_oid)
    return _serialize_conv(conv)


# ─── PATCH /chat/conversations/{id} ──────────────────────

@router.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: str, request: Request, body: UpdateConversationBody):
    user_oid = _require_user_oid(request)
    db = get_db()
    await _load_conversation(db, conv_id, user_oid)
    title = body.title.strip()[:200] or "New Chat"
    now = _now()
    await db.chat_conversations.update_one(
        {"_id": _to_object_id(conv_id, "conversation_id")},
        {"$set": {"title": title, "updated_at": now}},
    )
    refreshed = await _load_conversation(db, conv_id, user_oid)
    return _serialize_conv(refreshed)


# ─── DELETE /chat/conversations/{id} ─────────────────────

@router.delete("/conversations/{conv_id}", status_code=204)
async def delete_conversation(conv_id: str, request: Request):
    user_oid = _require_user_oid(request)
    db = get_db()
    await _load_conversation(db, conv_id, user_oid)
    oid = _to_object_id(conv_id, "conversation_id")
    await db.chat_messages.delete_many({"conversation_id": {"$in": [oid, conv_id]}})
    await db.chat_conversations.delete_one({"_id": oid})
    return


# ─── DELETE /chat/conversations  (clear all for user) ────

@router.delete("/conversations", status_code=204)
async def delete_all_conversations(request: Request):
    user_oid = _require_user_oid(request)
    db = get_db()
    user_filter = {"user_id": {"$in": [user_oid, str(user_oid)]}}
    await db.chat_messages.delete_many(user_filter)
    await db.chat_conversations.delete_many(user_filter)
    return


# ─── GET /chat/conversations/{id}/messages ───────────────

@router.get("/conversations/{conv_id}/messages")
async def list_messages(conv_id: str, request: Request):
    user_oid = _require_user_oid(request)
    db = get_db()
    await _load_conversation(db, conv_id, user_oid)
    conv_oid = _to_object_id(conv_id, "conversation_id")
    cursor = (
        db.chat_messages
        .find({
            "conversation_id": {"$in": [conv_oid, conv_id]},
            "user_id": {"$in": [user_oid, str(user_oid)]},
        })
        .sort([("created_at", 1), ("seq", 1)])
    )
    docs = await cursor.to_list(length=2000)
    return [_serialize_msg(d) for d in docs]


# ─── POST /chat/conversations/{id}/messages ──────────────

@router.post("/conversations/{conv_id}/messages", status_code=201)
async def append_messages(conv_id: str, request: Request, body: AppendMessagesBody):
    user_oid = _require_user_oid(request)
    db = get_db()
    conv = await _load_conversation(db, conv_id, user_oid)
    conv_oid = _to_object_id(conv_id, "conversation_id")
    now = _now()

    starting_seq = int(conv.get("message_count", 0)) + 1
    docs_to_insert: list[dict] = []
    for idx, msg in enumerate(body.messages):
        # Strictly increasing timestamps keep insertion order stable across batches
        ts = datetime.now(timezone.utc) + timedelta(microseconds=idx)
        ts_iso = ts.isoformat(timespec="microseconds").replace("+00:00", "Z")
        docs_to_insert.append({
            "conversation_id": conv_oid,
            "user_id": user_oid,
            "seq": starting_seq + idx,
            "role": msg.role,
            "content": msg.content,
            "agent": msg.agent,
            "is_error": bool(msg.is_error),
            "created_at": ts_iso,
        })

    insert_result = await db.chat_messages.insert_many(docs_to_insert)
    for doc, oid in zip(docs_to_insert, insert_result.inserted_ids):
        doc["_id"] = oid

    # If the conversation still has the default title and a user message was
    # provided, derive a title from the first user message.
    update_set: dict = {
        "updated_at": now,
        "last_message_at": now,
    }
    inc_count = len(docs_to_insert)
    needs_title = (conv.get("title") or "New Chat") == "New Chat" and (conv.get("message_count", 0) == 0)
    if needs_title:
        first_user = next((m for m in body.messages if m.role == "user"), None)
        if first_user:
            update_set["title"] = _derive_title(first_user.content)

    await db.chat_conversations.update_one(
        {"_id": conv_oid},
        {"$set": update_set, "$inc": {"message_count": inc_count}},
    )

    refreshed_conv = await _load_conversation(db, conv_id, user_oid)
    return {
        "conversation": _serialize_conv(refreshed_conv),
        "messages": [_serialize_msg(d) for d in docs_to_insert],
    }
