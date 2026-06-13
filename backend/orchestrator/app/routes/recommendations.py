"""Curator (recommendations) routes — owns the JSON prompt; agent is transport-only."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.agent_cache import cache_envelope, get_cached, set_cached
from app.agents.curator_agent import curator_agent
from app.agents.orchestrator_agent import AgentError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/recommendations", tags=["recommendations"])

AGENT_KEY = "curator"

# Dashboard surface needs raw JSON so the React panel can render typed
# cards. format_directive="json" (set by orchestrator.process_raw) tells
# the curator to return its `completion` as a JSON string; the schema
# below describes what shape we expect inside that string.
LEARNING_PATH_PROMPT = (
    "Return the top 3 recommended learning focus areas for this learner. "
    "Your `completion` MUST be a JSON array (no surrounding prose) so the "
    "dashboard can `JSON.parse` it directly.\n\n"
    "Schema per item: title (string), cert_code (e.g. \"AZ-104\"), "
    'priority ("Highest" | "High" | "Medium"), '
    "reason (one sentence with an inline citation 【msg:src\u2020source.md】), "
    "sources (array of {title, kind, url?, kb?, snippet?} \u2014 "
    'kind is one of "kb" | "assessment" | "progress" | "role"; 1\u20134 entries).'
)


@router.get("")
async def get_recommendations(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    cached = await get_cached(user_id, AGENT_KEY)
    return cache_envelope(cached, fresh=False)


@router.post("/refresh")
async def refresh_recommendations(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    role = request.headers.get("X-Role", "learner")
    if not user_id:
        raise HTTPException(status_code=400, detail="missing X-User-Id")

    try:
        result = await curator_agent.run_raw_full(
            LEARNING_PATH_PROMPT, user_id=user_id, role=role
        )
    except AgentError as exc:
        logger.warning("Curator agent error (status=%d): %s", exc.status_code, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Curator refresh failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"agent_unavailable: {exc}") from exc

    record = await set_cached(
        user_id, AGENT_KEY, result.get("response"), trace=result.get("trace"),
    )
    return cache_envelope(record, fresh=True)

