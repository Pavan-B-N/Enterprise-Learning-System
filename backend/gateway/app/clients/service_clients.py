import httpx
from fastapi import Request

from app.config import settings


def _build_headers(request: Request) -> dict:
    raid = getattr(request.state, "raid", None) or getattr(request.state, "correlation_id", "")
    return {
        "X-RAID": raid,
        "X-Correlation-ID": raid,  # legacy alias
        "X-User-Id": getattr(request.state, "user_id", "") or "",
        "X-Role": getattr(request.state, "role", "") or "",
    }


class CoreClient:
    """HTTP client to forward requests to Core Service."""

    def __init__(self):
        self._base_url = settings.CORE_SERVICE_URL

    async def forward(self, method: str, path: str, request: Request, json_body: dict | None = None) -> httpx.Response:
        async with httpx.AsyncClient(base_url=self._base_url, timeout=30.0, follow_redirects=True) as client:
            response = await client.request(method, path, json=json_body, headers=_build_headers(request))
        return response


class OrchestratorClient:
    """HTTP client to forward requests to Orchestrator."""

    def __init__(self):
        self._base_url = settings.ORCHESTRATOR_URL

    async def forward(self, method: str, path: str, request: Request, json_body: dict | None = None) -> httpx.Response:
        async with httpx.AsyncClient(base_url=self._base_url, timeout=120.0, follow_redirects=True) as client:
            response = await client.request(method, path, json=json_body, headers=_build_headers(request))
        return response


class AdminClient:
    """HTTP client to forward requests to Admin Service."""

    def __init__(self):
        self._base_url = settings.ADMIN_SERVICE_URL

    async def forward(self, method: str, path: str, request: Request, json_body: dict | None = None) -> httpx.Response:
        async with httpx.AsyncClient(base_url=self._base_url, timeout=30.0, follow_redirects=True) as client:
            response = await client.request(method, path, json=json_body, headers=_build_headers(request))
        return response


core_client = CoreClient()
orchestrator_client = OrchestratorClient()
admin_client = AdminClient()
