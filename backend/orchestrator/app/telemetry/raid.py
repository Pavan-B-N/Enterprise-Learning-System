"""RAID middleware — Request Activity ID generation and propagation.

Reads `X-RAID` from the inbound request (set by upstream gateway) or generates
a new UUID4. Stores it on `request.state.raid`. Mirrors it onto the response
header so clients can correlate.
"""

from __future__ import annotations

import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


class RAIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        raid = request.headers.get("X-RAID") or request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        request.state.raid = raid
        # Keep correlation_id alias for any legacy code that still reads it
        request.state.correlation_id = raid
        response = await call_next(request)
        response.headers["X-RAID"] = raid
        response.headers["X-Correlation-ID"] = raid
        return response
