"""Manager Insights routes — owns the JSON prompt; agent is transport-only.

Manager / admin only. The orchestrator system prompt also rejects insights
requests from non-managers (RBAC guard, §5 of els-orchestrator.md), but we
enforce here too so the endpoint itself returns 403 for the wrong role.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.agent_cache import cache_envelope, get_cached, set_cached
from app.agents.insights_agent import insights_agent
from app.agents.orchestrator_agent import AgentError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/insights", tags=["insights"])

# Dashboard insights panel renders typed fields. format_directive="json"
# (set by orchestrator.process_raw) tells the manager-insights agent to
# put a JSON string in `completion`; the schema below describes the shape.
TEAM_INSIGHTS_PROMPT = (
    "Produce a team readiness summary. Aggregate completion %, pass rates, "
    "identify at-risk learners (inactive >2 weeks OR last assessment <65 OR "
    "completion <40% with <4 weeks to target), highlight strengths and weak "
    "areas, and propose 2–3 specific actions.\n\n"
    "Your `completion` MUST be a JSON object (no surrounding prose) with "
    "EXACTLY these canonical field names \u2014 the dashboard renderer reads them "
    "as primary keys:\n"
    "{\n"
    '  "manager_id": "<string>",\n'
    '  "summary": {\n'
    '    "avg_pass_rate_pct": <number 0-100>,\n'
    '    "avg_completion_pct": <number 0-100>,\n'
    '    "total_members": <int>,\n'
    '    "completed_courses_count": <int>,\n'
    '    "in_progress_courses_count": <int>,\n'
    '    "trend_last_30d": "<short phrase or null>"\n'
    "  },\n"
    '  "at_risk": [{ "learner_id": "<id>", "name": "<name>", '
    '"reasons": ["<rule citation>"], "suggested_action": "<one action>" }],\n'
    '  "strengths":  [{ "course_name": "<name>", "avg_completion": <number> }],\n'
    '  "weak_areas": [{ "course_name": "<name>", "avg_completion": <number> }],\n'
    '  "capacity_flag": "normal" | "meeting_overloaded" | "motivation_gap",\n'
    '  "recommended_actions": ["<specific action citing a signal or cohort>"],\n'
    '  "sources": [{ "title": "<source name>", "kind": "signal" | "kb" }]\n'
    "}\n\n"
    "Quality bar (do NOT emit a rollup that fails any of these):\n"
    "- summary keys are EXACTLY avg_pass_rate_pct / avg_completion_pct \u2014 NOT "
    "overall_pass_rate / overall_completion_pct.\n"
    "- at_risk items use learner_id + name + reasons[] (array) + "
    "suggested_action \u2014 NOT full_name / user_id / reason (singular).\n"
    "- capacity_flag is the enum value (normal | meeting_overloaded | "
    "motivation_gap), NOT a free-form sentence.\n"
    "- strengths/weak_areas are non-empty when course-summary data shows "
    "courses with avg > 80% / < 50% respectively.\n"
    "- recommended_actions cite a signal or learner cohort (e.g. \"4 of 6 "
    "scored < 65% on VNet topology\"), not generic encouragement.\n"
    "- completion.sources mirrors every envelope source you consulted."
)


INSIGHTS_CACHE_KEY = "insights"


def _require_manager(role: str) -> None:
    if role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="manager or admin role required")


@router.get("")
async def get_insights(request: Request):
    role = request.headers.get("X-Role", "learner")
    _require_manager(role)
    user_id = request.headers.get("X-User-Id", "")
    cached = await get_cached(user_id, INSIGHTS_CACHE_KEY)
    return cache_envelope(cached, fresh=False)


@router.post("/refresh")
async def refresh_insights(request: Request):
    role = request.headers.get("X-Role", "learner")
    _require_manager(role)
    user_id = request.headers.get("X-User-Id", "")

    try:
        result = await insights_agent.run_raw_full(
            TEAM_INSIGHTS_PROMPT, user_id=user_id, role=role
        )
    except AgentError as exc:
        logger.warning("Insights agent error (status=%d): %s", exc.status_code, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Insights refresh failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"agent_unavailable: {exc}") from exc

    record = await set_cached(
        user_id, INSIGHTS_CACHE_KEY, result.get("response"), trace=result.get("trace"),
    )
    return cache_envelope(record, fresh=True)

