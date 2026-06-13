import time
from collections import defaultdict

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Token bucket rate limiter per client IP."""

    def __init__(self, app):
        super().__init__(app)
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._window = 60.0  # seconds
        self._max_requests = settings.RATE_LIMIT_PER_MINUTE

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        now = time.time()

        # Clean old entries
        self._requests[client_ip] = [
            t for t in self._requests[client_ip] if now - t < self._window
        ]

        if len(self._requests[client_ip]) >= self._max_requests:
            raise HTTPException(status_code=429, detail="Rate limit exceeded")

        self._requests[client_ip].append(now)
        response = await call_next(request)
        return response
