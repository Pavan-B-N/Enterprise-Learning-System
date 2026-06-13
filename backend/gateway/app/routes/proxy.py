from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.clients.service_clients import core_client, orchestrator_client, admin_client

router = APIRouter()


# --- Helper to forward auth ---
async def _handle_auth(path: str, request: Request):
    body = await request.json() if request.method in ("POST", "PUT") else None
    response = await core_client.forward(request.method, f"/auth/{path}", request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


# --- Auth routes → Core Service ---
@router.api_route("/api/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_auth_api(path: str, request: Request):
    return await _handle_auth(path, request)


@router.api_route("/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_auth(path: str, request: Request):
    return await _handle_auth(path, request)


# --- Learner/Team data routes → Core Service ---
@router.api_route("/api/learners/{path:path}", methods=["GET", "POST", "PUT"])
async def proxy_learners(path: str, request: Request):
    body = await request.json() if request.method in ("POST", "PUT") else None
    response = await core_client.forward(request.method, f"/learners/{path}", request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.api_route("/api/teams/{path:path}", methods=["GET", "POST", "PUT"])
async def proxy_teams(path: str, request: Request):
    body = await request.json() if request.method in ("POST", "PUT") else None
    response = await core_client.forward(request.method, f"/teams/{path}", request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.api_route("/api/users/{path:path}", methods=["GET", "PUT", "POST"])
async def proxy_users(path: str, request: Request):
    body = await request.json() if request.method in ("PUT", "POST") else None
    qs = str(request.url.query)
    internal_path = f"/users/{path}" + (f"?{qs}" if qs else "")
    response = await core_client.forward(request.method, internal_path, request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


async def _safe_json_body(request: Request):
    if request.method in ("GET", "DELETE"):
        return None
    try:
        return await request.json()
    except Exception:
        return None


# --- Chat conversation history → Core Service ---
# IMPORTANT: must be registered BEFORE /api/chat (which is the orchestrator-bound
# AI message endpoint) so that nested /api/chat/conversations/* paths route here.
@router.api_route(
    "/api/chat/conversations/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def proxy_chat_conversations_path(path: str, request: Request):
    body = await _safe_json_body(request)
    qs = str(request.url.query)
    internal_path = f"/chat/conversations/{path}" + (f"?{qs}" if qs else "")
    response = await core_client.forward(request.method, internal_path, request, body)
    if response.status_code == 204:
        return Response(status_code=204)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route(
    "/api/chat/conversations",
    methods=["GET", "POST", "DELETE"],
)
async def proxy_chat_conversations_root(request: Request):
    body = await _safe_json_body(request)
    response = await core_client.forward(request.method, "/chat/conversations", request, body)
    if response.status_code == 204:
        return Response(status_code=204)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


# --- Assessment scheduling (async, queue-backed) → Core Service ---
@router.api_route(
    "/api/assessment-schedules/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE"],
)
async def proxy_assessment_schedules_path(path: str, request: Request):
    body = await _safe_json_body(request)
    qs = str(request.url.query)
    internal = f"/assessment-schedules/{path}" + (f"?{qs}" if qs else "")
    response = await core_client.forward(request.method, internal, request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route(
    "/api/assessment-schedules",
    methods=["GET", "POST"],
)
async def proxy_assessment_schedules_root(request: Request):
    body = await _safe_json_body(request)
    response = await core_client.forward(request.method, "/assessment-schedules", request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


# --- Notifications → Core Service ---
@router.api_route(
    "/api/notifications/{path:path}",
    methods=["GET", "POST"],
)
async def proxy_notifications_path(path: str, request: Request):
    body = await _safe_json_body(request)
    qs = str(request.url.query)
    internal = f"/notifications/{path}" + (f"?{qs}" if qs else "")
    response = await core_client.forward(request.method, internal, request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route("/api/notifications", methods=["GET"])
async def proxy_notifications_root(request: Request):
    qs = str(request.url.query)
    internal = "/notifications" + (f"?{qs}" if qs else "")
    response = await core_client.forward("GET", internal, request, None)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


# --- Chat routes → Orchestrator ---
async def _handle_chat(request: Request):
    body = await request.json()
    body["user_id"] = getattr(request.state, "user_id", None)
    body["role"] = getattr(request.state, "role", None)
    try:
        response = await orchestrator_client.forward("POST", "/chat", request, body)
        try:
            content = response.json()
        except Exception:
            content = {"response": response.text or "Agent is processing your request...", "agent": "system"}
        return JSONResponse(status_code=response.status_code, content=content)
    except Exception as e:
        return JSONResponse(status_code=500, content={"response": f"Service unavailable: {str(e)}", "agent": "system"})


@router.post("/api/chat")
async def proxy_chat(request: Request):
    return await _handle_chat(request)


@router.post("/api/orchestrator/chat")
async def proxy_chat_alt(request: Request):
    return await _handle_chat(request)


# --- Recommendations → Orchestrator ---
@router.get("/api/orchestrator/recommendations")
async def proxy_get_recommendations(request: Request):
    response = await orchestrator_client.forward("GET", "/recommendations", request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.post("/api/orchestrator/recommendations/refresh")
async def proxy_refresh_recommendations(request: Request):
    response = await orchestrator_client.forward("POST", "/recommendations/refresh", request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


# --- Study Plan → Orchestrator ---
@router.get("/api/orchestrator/plan")
async def proxy_get_plan(request: Request):
    response = await orchestrator_client.forward("GET", "/plan", request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.post("/api/orchestrator/plan/refresh")
async def proxy_refresh_plan(request: Request):
    body = await request.json() if request.method == "POST" else None
    response = await orchestrator_client.forward("POST", "/plan/refresh", request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


# --- Engagement → Orchestrator ---
@router.get("/api/orchestrator/engagement")
async def proxy_get_engagement(request: Request):
    response = await orchestrator_client.forward("GET", "/engagement", request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.post("/api/orchestrator/engagement/refresh")
async def proxy_refresh_engagement(request: Request):
    response = await orchestrator_client.forward("POST", "/engagement/refresh", request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


# --- Assessments (agent-driven) → Orchestrator ---
@router.get("/api/orchestrator/assessments/generated")
async def proxy_get_quiz(request: Request):
    qs = str(request.url.query)
    path = "/assessments/generated" + (f"?{qs}" if qs else "")
    response = await orchestrator_client.forward("GET", path, request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.post("/api/orchestrator/assessments/generate")
async def proxy_generate_quiz(request: Request):
    body = await request.json()
    response = await orchestrator_client.forward("POST", "/assessments/generate", request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.post("/api/orchestrator/assessments/evaluate")
async def proxy_evaluate_quiz(request: Request):
    body = await request.json()
    response = await orchestrator_client.forward("POST", "/assessments/evaluate", request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.get("/api/orchestrator/assessments/readiness")
async def proxy_get_readiness(request: Request):
    qs = str(request.url.query)
    path = "/assessments/readiness" + (f"?{qs}" if qs else "")
    response = await orchestrator_client.forward("GET", path, request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.post("/api/orchestrator/assessments/readiness/refresh")
async def proxy_refresh_readiness(request: Request):
    body = await request.json()
    response = await orchestrator_client.forward("POST", "/assessments/readiness/refresh", request, body)
    return JSONResponse(status_code=response.status_code, content=response.json())


# --- Insights (manager) → Orchestrator ---
@router.get("/api/orchestrator/insights")
async def proxy_get_insights(request: Request):
    response = await orchestrator_client.forward("GET", "/insights", request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


@router.post("/api/orchestrator/insights/refresh")
async def proxy_refresh_insights(request: Request):
    response = await orchestrator_client.forward("POST", "/insights/refresh", request, None)
    return JSONResponse(status_code=response.status_code, content=response.json())


# --- Resource routes → Admin Service (courses, skills, topics, modules, roles, users, teams) ---
ADMIN_SERVICE_RESOURCES = ("courses", "skills", "topics", "modules", "roles")


# --- Admin-only routes (users, teams management) → Admin Service ---
# These MUST be registered before the catch-all {resource} routes
@router.api_route("/api/admin/users/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_admin_users_path(path: str, request: Request):
    body = await request.json() if request.method in ("POST", "PUT", "DELETE") else None
    response = await admin_client.forward(request.method, f"/users/{path}", request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route("/api/admin/users", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_admin_users(request: Request):
    body = await request.json() if request.method in ("POST", "PUT", "DELETE") else None
    response = await admin_client.forward(request.method, "/users", request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route("/api/admin/teams/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_admin_teams_path(path: str, request: Request):
    body = await request.json() if request.method in ("POST", "PUT", "DELETE") else None
    response = await admin_client.forward(request.method, f"/teams/{path}", request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route("/api/admin/teams", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_admin_teams(request: Request):
    body = await request.json() if request.method in ("POST", "PUT", "DELETE") else None
    response = await admin_client.forward(request.method, "/teams", request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route("/api/admin/dashboard/{path:path}", methods=["GET"])
async def proxy_admin_dashboard(path: str, request: Request):
    response = await admin_client.forward("GET", f"/dashboard/{path}", request, None)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


# --- Telemetry / RAID observability → Admin Service ---
@router.api_route("/api/admin/telemetry/logs/stream", methods=["GET"])
async def proxy_telemetry_stream(request: Request):
    """SSE pass-through for the live log stream. Bypasses the JSON serializer."""
    import httpx
    from app.config import settings as gw_settings

    raid = getattr(request.state, "raid", "") or ""
    user_id = getattr(request.state, "user_id", "") or ""
    role = getattr(request.state, "role", "") or ""

    async def stream():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "GET",
                f"{gw_settings.ADMIN_SERVICE_URL}/telemetry/logs/stream",
                headers={"X-RAID": raid, "X-User-Id": user_id, "X-Role": role, "Accept": "text/event-stream"},
            ) as upstream:
                async for chunk in upstream.aiter_raw():
                    yield chunk

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.api_route("/api/admin/telemetry/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_admin_telemetry(path: str, request: Request):
    body = await request.json() if request.method in ("POST", "PUT", "DELETE") else None
    qs = str(request.url.query)
    internal_path = f"/telemetry/{path}" + (f"?{qs}" if qs else "")
    response = await admin_client.forward(request.method, internal_path, request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


# --- Catch-all resource routes (must be AFTER specific /api/admin/ routes) ---
@router.api_route("/api/{resource}/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_resource_with_path(resource: str, path: str, request: Request):
    if resource not in ADMIN_SERVICE_RESOURCES:
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    body = await request.json() if request.method in ("POST", "PUT", "DELETE") else None
    response = await admin_client.forward(request.method, f"/{resource}/{path}", request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)


@router.api_route("/api/{resource}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_resource_root(resource: str, request: Request):
    if resource not in ADMIN_SERVICE_RESOURCES:
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    # Forward query string for filtering (e.g., ?course_id=X)
    query_string = str(request.url.query)
    internal_path = f"/{resource}" + (f"?{query_string}" if query_string else "")
    body = await request.json() if request.method in ("POST", "PUT", "DELETE") else None
    response = await admin_client.forward(request.method, internal_path, request, body)
    try:
        content = response.json()
    except Exception:
        content = None
    return JSONResponse(status_code=response.status_code, content=content)
