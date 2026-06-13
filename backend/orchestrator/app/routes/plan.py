"""Study Plan routes — owns the JSON prompt; agent is transport-only."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.agent_cache import cache_envelope, get_cached, set_cached
from app.agents.orchestrator_agent import AgentError
from app.agents.planner_agent import planner_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/plan", tags=["plan"])

AGENT_KEY = "planner"

# Dashboard surface expects raw JSON for typed rendering. The route_hint
# (ROUTE_KEY="planner" on PlannerAgent) is what actually pins the route via
# `targeted_agent` in the envelope; the prose here just spells out the
# scheduling intent and the JSON shape we want back inside `completion`.
BUILD_PLAN_PROMPT = (
    "Generate my personalized weekly study SCHEDULE (a calendar plan, "
    "NOT a course recommendation list). I need time-blocked sessions "
    "across Monday\u2013Sunday with per-day topics, durations, and rationale, "
    "respecting my work-context capacity (meeting hours, focus hours, "
    "preferred learning slot). Sequence topics by module weight and prior "
    "assessment performance.\n\n"
    "Return your `completion` as a JSON object matching the planner schema: "
    "cert_code, weekly_hours, weeks_to_exam_ready, estimated_ready_date, "
    "capacity_flag, weekly_plan[] (each entry has day, start, duration_min, "
    "topic, module_weight_pct, session_type, rationale), milestones[], "
    "notes, sources[].\n\n"
    "Quality bar (do NOT return a plan that fails any of these):\n"
    "- weekly_plan[].topic must resolve to REAL module/topic names from the "
    "active course. If module/topic data is not in your grounding, request "
    "it via subagent_requests rather than copying topic_name from a cached "
    "study_plan payload (those are seed data and often repeat 'Reading' "
    "verbatim across the week).\n"
    "- weekly_plan[].topic must vary across the week. Five identical entries "
    "is a fabrication tell, not a plan.\n"
    "- weekly_plan[].module_weight_pct must reflect REAL module weights and "
    "must vary across modules. A uniform value (e.g., 50 for every block) "
    "means you fabricated it \u2014 request module data instead.\n"
    "- weekly_plan[].rationale must reference a concrete user signal "
    "(peak_focus_window, weak topic score, module weight, interruption "
    "density) or a topic-specific reason. Generic encouragement like "
    "'reinforces learning' is not acceptable.\n"
    "- session_type must mix at least two values across the week "
    "(reading + review, reading + practice, etc.).\n"
    "- milestones[] must be non-empty when module structure is in your "
    "grounding \u2014 derive at least one per ~25% of remaining hours.\n"
    "- completion.sources[] must mirror every envelope source you actually "
    "consulted, projected as {title, kind} where kind is 'kb' or 'signal'. "
    "Empty completion.sources while the envelope lists sources is a "
    "protocol violation.\n"
    "- notes must reconcile any conflict between peak_focus_window and "
    "preferred_learning_slot, and surface any capacity_flag triggers."
)


@router.get("")
async def get_plan(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    cached = await get_cached(user_id, AGENT_KEY)
    return cache_envelope(cached, fresh=False)


@router.post("/refresh")
async def refresh_plan(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    role = request.headers.get("X-Role", "learner")
    if not user_id:
        raise HTTPException(status_code=400, detail="missing X-User-Id")

    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    target_cert = (body or {}).get("target_cert", "").strip()
    exam_by = (body or {}).get("exam_by", "").strip()

    prompt = BUILD_PLAN_PROMPT
    if target_cert:
        prompt += f"\n\nTarget certification: {target_cert}."
    if exam_by:
        prompt += f"\nExam by date: {exam_by}."

    try:
        result = await planner_agent.run_raw_full(prompt, user_id=user_id, role=role)
    except AgentError as exc:
        logger.warning("Planner agent error (status=%d): %s", exc.status_code, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("Planner refresh failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=f"agent_unavailable: {exc}") from exc

    record = await set_cached(
        user_id, AGENT_KEY, result.get("response"), trace=result.get("trace"),
    )
    return cache_envelope(record, fresh=True)

