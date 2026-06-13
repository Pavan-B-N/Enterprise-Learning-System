import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import StreamingResponse

from app.services import log_handler
from app.services.telemetry_service import TelemetryService

router = APIRouter(prefix="/telemetry", tags=["telemetry"])
telemetry_service = TelemetryService()


# In-process subscriber set for the SSE live stream.
# Each subscriber owns an asyncio.Queue that the ingest endpoint pushes to.
_sse_subscribers: set[asyncio.Queue] = set()


@router.get("/stats")
async def get_system_stats():
    return await telemetry_service.get_stats()


@router.get("/usage")
async def get_usage_metrics():
    return await telemetry_service.get_usage()


# ───────────────────────── RAID / log telemetry ─────────────────────────

@router.post("/logs")
async def ingest_logs(payload=Body(...)):
    """Ingest one or many log entries. Internal — called by InternalLogger."""
    entries = payload if isinstance(payload, list) else [payload]
    ingested = await log_handler.ingest(entries)

    # Fan out to live SSE subscribers (best-effort)
    if _sse_subscribers and entries:
        for entry in entries:
            for q in list(_sse_subscribers):
                try:
                    q.put_nowait(entry)
                except asyncio.QueueFull:
                    pass

    return {"success": True, "ingested": ingested}


@router.get("/logs")
async def query_logs(
    service: Optional[str] = None,
    level: Optional[str] = None,
    raid: Optional[str] = None,
    user_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
):
    return await log_handler.query({
        "service": service, "level": level, "raid": raid, "user_id": user_id,
        "search": search, "page": page, "limit": limit,
    })


@router.get("/logs/raid/{raid}")
async def trace_raid(raid: str):
    return await log_handler.trace_by_raid(raid)


@router.get("/logs/log-stats")
async def log_stats(hours: int = Query(24, ge=1, le=720)):
    stats = await log_handler.get_stats(hours)
    stats["sse_clients"] = len(_sse_subscribers)
    return stats


@router.get("/logs/stream")
async def stream_logs(request: Request):
    """SSE live stream of newly ingested logs."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    _sse_subscribers.add(queue)

    async def event_gen():
        try:
            yield ":connected\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    entry = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(entry, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ":heartbeat\n\n"
        finally:
            _sse_subscribers.discard(queue)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.delete("/logs")
async def purge_logs(older_than_days: int = Query(30, ge=1)):
    deleted = await log_handler.purge(older_than_days)
    return {"deleted": deleted}
