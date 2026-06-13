from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import jwt

from app.config import settings


class AuthMiddleware(BaseHTTPMiddleware):
    """Validates JWT and injects user context into request state."""

    OPEN_PATHS = {"/auth/login", "/auth/refresh", "/health", "/ready",
                   "/api/auth/login", "/api/auth/refresh", "/ws"}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip auth for open paths
        if any(path.startswith(p) for p in self.OPEN_PATHS):
            return await call_next(request)

        # Extract token
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid token")

        token = auth_header.split(" ", 1)[1]

        try:
            payload = jwt.decode(
                token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM],
                options={"verify_exp": False}
            )
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")

        # Inject into request state for downstream use
        request.state.user_id = payload.get("sub")
        request.state.role = payload.get("role")

        # RBAC: Resource routes — GET is open to all authenticated users,
        # write operations (POST/PUT/DELETE) require admin role
        resource_paths = ("/api/courses", "/api/skills", "/api/topics", "/api/modules", "/api/roles")
        is_resource_route = any(path.startswith(rp) for rp in resource_paths)
        if is_resource_route and request.method != "GET" and request.state.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")

        # RBAC: admin user/team management routes require admin role
        if path.startswith("/api/admin/") and request.state.role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")

        # RBAC: manager routes require manager or admin
        if path.startswith("/api/teams") and request.state.role not in ("manager", "admin"):
            raise HTTPException(status_code=403, detail="Manager access required")

        response = await call_next(request)
        return response
