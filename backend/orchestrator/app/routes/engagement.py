"""Engagement routes — owns the JSON prompt; agent is transport-only."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.agent_cache import cache_envelope, get_cached, set_cached
from app.agents.engagement_agent import engagement_agent
from app.agents.orchestrator_agent import AgentError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/engagement", tags=["engagement"])

AGENT_KEY = "engagement"

# Dashboard nudge panel renders typed fields (state, headline, body,
# suggested_action). format_directive="json" (set by
# orchestrator.process_raw) tells the engagement agent to put a JSON
# string in `completion`; the schema below describes the shape we expect.
NUDGE_PROMPT = (
    "Give me a work-context-aware nudge for this learner. Consider: streak, "
    "last active date, recent assessment scores, completion delta over the "
    "last 7 days, and meeting / focus hour ratios. Pick the right state from "
    "the engagement system prompt's state table.\n\n"
    "Your `completion` MUST be a JSON object (no surrounding prose) with: "
    "state (string), headline (string), body (string), "
    "suggested_action {label, type, target}, best_nudge_window (string), "
    "tone (string)."
)


@router.get("")
async def get_engagement(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    cached = await get_cached(user_id, AGENT_KEY)
    return cache_envelope(cached, fresh=False)


@router.post("/refresh")
async def refresh_engagement(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    role = request.headers.get("X-Role", "learner")
    if not user_id:
        raise HTTPException(status_code=400, detail="missing X-User-Id")

    try:
        result = await engagement_agent.run_raw_full(
            NUDGE_PROMPT, user_id=user_id, role=role
        )
    except AgentError as exc:
        logger.warning("Engagement agent error (status=%d): %s", exc.status_code, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Engagement refresh failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"agent_unavailable: {exc}") from exc

    record = await set_cached(
        user_id, AGENT_KEY, result.get("response"), trace=result.get("trace"),
    )
    return cache_envelope(record, fresh=True)

