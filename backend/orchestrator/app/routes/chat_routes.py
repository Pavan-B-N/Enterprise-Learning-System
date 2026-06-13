"""Chat route — single entry-point that runs the JSON-envelope orchestrator pipeline.

The new envelope protocol moves user-clarification handling into the
specialist's `completion`: when the specialist needs more info from the
user it just returns the question as a normal markdown completion, the UI
shows it, and the user's reply starts a fresh pipeline call (with prior
chat history acting as natural context). No server-side session resume is
needed, so the legacy ``session_id`` / ``[TURN:followup]`` machinery has
been removed from this surface.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.orchestrator import orchestrator
from app.protocol import FORMAT_MARKDOWN

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    user_id: str | None = None
    role: str | None = None
    history: list[dict] | None = None


@router.post("/chat")
async def chat(request: Request, body: ChatRequest):
    correlation_id = request.headers.get("X-Correlation-ID", "")
    user_id = body.user_id or request.headers.get("X-User-Id", "")
    role = body.role or request.headers.get("X-Role", "learner")

    return await orchestrator.process(
        message=body.message,
        user_id=user_id,
        role=role,
        correlation_id=correlation_id,
        format_directive=FORMAT_MARKDOWN,
    )
