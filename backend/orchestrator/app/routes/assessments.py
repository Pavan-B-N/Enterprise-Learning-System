"""Assessment routes — thin cache wrappers around AssessmentAgent."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.agent_cache import cache_envelope, get_cached, set_cached
from app.agents.assessment_agent import assessment_agent
from app.agents.orchestrator_agent import AgentError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assessments", tags=["assessments"])


def _cache_key(cert_code: str, mode: str) -> str:
    cert = (cert_code or "default").upper().replace(" ", "")
    return f"assessment::{mode}::{cert}"


def _raise_agent_failure(agent_op: str, exc: Exception) -> None:
    """Convert any agent failure to an HTTPException with an accurate status."""
    if isinstance(exc, AgentError):
        logger.warning("%s agent error (status=%d): %s", agent_op, exc.status_code, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    logger.error("%s failed: %s", agent_op, exc, exc_info=True)
    raise HTTPException(status_code=502, detail=f"agent_unavailable: {exc}") from exc


@router.get("/generated")
async def get_generated_quiz(request: Request, cert_code: str = ""):
    user_id = request.headers.get("X-User-Id", "")
    cached = await get_cached(user_id, _cache_key(cert_code, "generate"))
    return cache_envelope(cached, fresh=False)


@router.post("/generate")
async def generate_quiz(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    role = request.headers.get("X-Role", "learner")
    if not user_id:
        raise HTTPException(status_code=400, detail="missing X-User-Id")

    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    cert_code = (body or {}).get("cert_code", "").strip()
    count = int((body or {}).get("count", 5))
    course_name = (body or {}).get("course_name", "").strip()
    topics = (body or {}).get("topics") or []
    if not isinstance(topics, list):
        topics = []
    topic_content = (body or {}).get("topic_content") or []
    if not isinstance(topic_content, list):
        topic_content = []

    try:
        result = await assessment_agent.generate_quiz(
            user_id=user_id,
            role=role,
            cert_code=cert_code,
            count=count,
            course_name=course_name,
            topics=topics,
            topic_content=topic_content,
        )
    except Exception as exc:  # noqa: BLE001
        _raise_agent_failure("Assessment generate", exc)

    record = await set_cached(
        user_id, _cache_key(cert_code, "generate"),
        result.get("response"), trace=result.get("trace"),
    )
    return cache_envelope(record, fresh=True)


@router.post("/evaluate")
async def evaluate_quiz(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    role = request.headers.get("X-Role", "learner")
    if not user_id:
        raise HTTPException(status_code=400, detail="missing X-User-Id")

    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    answers = (body or {}).get("answers", [])
    cert_code = (body or {}).get("cert_code", "").strip()

    try:
        result = await assessment_agent.evaluate_quiz(
            user_id=user_id, role=role, cert_code=cert_code, answers=answers
        )
    except Exception as exc:  # noqa: BLE001
        _raise_agent_failure("Assessment evaluate", exc)

    record = await set_cached(
        user_id, _cache_key(cert_code, "evaluate"),
        result.get("response"), trace=result.get("trace"),
    )
    return cache_envelope(record, fresh=True)


@router.get("/readiness")
async def get_readiness(request: Request, cert_code: str = ""):
    user_id = request.headers.get("X-User-Id", "")
    cached = await get_cached(user_id, _cache_key(cert_code, "readiness"))
    return cache_envelope(cached, fresh=False)


@router.post("/readiness/refresh")
async def refresh_readiness(request: Request):
    user_id = request.headers.get("X-User-Id", "")
    role = request.headers.get("X-Role", "learner")
    if not user_id:
        raise HTTPException(status_code=400, detail="missing X-User-Id")

    body = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass
    cert_code = (body or {}).get("cert_code", "").strip()

    try:
        result = await assessment_agent.get_readiness(
            user_id=user_id, role=role, cert_code=cert_code
        )
    except Exception as exc:  # noqa: BLE001
        _raise_agent_failure("Readiness refresh", exc)

    record = await set_cached(
        user_id, _cache_key(cert_code, "readiness"),
        result.get("response"), trace=result.get("trace"),
    )
    return cache_envelope(record, fresh=True)
