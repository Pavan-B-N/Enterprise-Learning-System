"""InternalLogger — buffers log entries and flushes them to the centralized
telemetry endpoint (admin-service) via HTTP. Ported from Synapse_AI's
TS InternalLogger pattern.

Strategy: flush-on-size-or-time
  - Size trigger: buffer hits MAX_BUFFER (20)
  - Time trigger: every FLUSH_INTERVAL_SECONDS (5s)

Failure handling: fire-and-forget; never crashes the host service.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import httpx


class InternalLogger:
    def __init__(
        self,
        service_name: str,
        sink_url: str,
        max_buffer: int = 20,
        flush_interval_seconds: float = 5.0,
    ):
        self._service = service_name
        self._sink = sink_url.rstrip("/") + "/telemetry/logs"
        self._max = max_buffer
        self._interval = flush_interval_seconds
        self._buffer: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()
        self._task: asyncio.Task | None = None
        self._client = httpx.AsyncClient(timeout=5.0)

    def _ensure_task(self):
        if self._task is None or self._task.done():
            try:
                loop = asyncio.get_running_loop()
                self._task = loop.create_task(self._periodic_flush())
            except RuntimeError:
                # No loop yet (during import) — skip; will start on first log call
                pass

    async def _periodic_flush(self):
        while True:
            await asyncio.sleep(self._interval)
            await self.flush()

    def _enqueue(self, level: str, message: str, **ctx: Any):
        entry = {
            "service": self._service,
            "level": level,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        for k in ("raid", "user_id", "status_code", "response_time", "path", "method", "ip", "user_agent"):
            if k in ctx and ctx[k] is not None:
                entry[k] = ctx[k]
        if "meta" in ctx and ctx["meta"]:
            entry["meta"] = ctx["meta"]
        self._buffer.append(entry)
        self._ensure_task()
        if len(self._buffer) >= self._max:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.flush())
            except RuntimeError:
                pass

    def info(self, message: str, **ctx: Any) -> None: self._enqueue("info", message, **ctx)
    def warn(self, message: str, **ctx: Any) -> None: self._enqueue("warn", message, **ctx)
    def error(self, message: str, **ctx: Any) -> None: self._enqueue("error", message, **ctx)
    def debug(self, message: str, **ctx: Any) -> None: self._enqueue("debug", message, **ctx)

    async def flush(self) -> None:
        if not self._buffer:
            return
        async with self._lock:
            if not self._buffer:
                return
            batch, self._buffer = self._buffer, []
        try:
            await self._client.post(self._sink, json=batch)
        except Exception as exc:  # noqa: BLE001 — fire-and-forget
            print(f"[telemetry/{self._service}] flush failed ({len(batch)} entries lost): {exc}")


SERVICE_NAME = os.getenv("TELEMETRY_SERVICE_NAME", "assessment")
ADMIN_SERVICE_URL = os.getenv("ADMIN_SERVICE_URL", "http://localhost:8003")

logger = InternalLogger(service_name=SERVICE_NAME, sink_url=ADMIN_SERVICE_URL)
