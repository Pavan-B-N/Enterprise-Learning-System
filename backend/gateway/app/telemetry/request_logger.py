"""Request logger middleware — auto-logs every HTTP request on completion
with RAID + user + timing context. Skips health/ingest paths to avoid loops.
"""

from __future__ import annotations

import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.telemetry.internal_logger import logger

SKIP_PATHS = ("/health", "/ready", "/telemetry/logs", "/docs", "/openapi.json")


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if any(path.startswith(p) for p in SKIP_PATHS):
            return await call_next(request)

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        status = response.status_code
        raid = getattr(request.state, "raid", None)
        user_id = getattr(request.state, "user_id", None) or request.headers.get("X-User-Id")
        msg = f"{request.method} {path} {status} {duration_ms}ms"
        ctx = dict(
            raid=raid,
            user_id=user_id,
            status_code=status,
            response_time=duration_ms,
            path=path,
            method=request.method,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        if status >= 500:
            logger.error(msg, **ctx)
        elif status >= 400:
            logger.warn(msg, **ctx)
        else:
            logger.info(msg, **ctx)
        return response
