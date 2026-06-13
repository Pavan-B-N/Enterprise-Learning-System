"""
Base class for all A2A specialist agents — multi-turn capable.

Every specialist (curator, assessment, planner, engagement, insights) is hosted
in Azure AI Foundry and exposed via the A2A protocol. They share:
  - Entra ID Bearer auth
  - agentCard/v0.3 discovery
  - a one-shot ``send()`` for legacy single-turn callers
  - a context-managed ``session()`` for multi-turn flows that need to keep
    the same A2A ``task_id`` across multiple ``send_message`` calls
  - the orchestrator-mediated pipeline (``run`` / ``run_raw``) that returns
    parsed JSON

Subclasses add domain methods (e.g. ``CuratorAgent.get_learning_path()``) that
build a prompt, call ``self.run_raw(...)`` for structured-data callers (or
``self.run(...)`` for chat-formatted output), and return data.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import httpx
from azure.identity import DefaultAzureCredential
from a2a.client import A2ACardResolver, ClientConfig, create_client
from a2a.helpers import new_text_message
from a2a.types.a2a_pb2 import Role, SendMessageRequest

from app.config import settings

logger = logging.getLogger(__name__)

_AZURE_AI_SCOPE = "https://ai.azure.com/.default"


class A2ASession:
    """A long-lived A2A connection bound to one specialist task.

    Use via ``async with agent.session() as s: ...``. The first ``send`` call
    starts a new A2A task on the server; subsequent ``send`` calls re-use the
    same ``task_id`` so the specialist sees a coherent conversation thread.
    """

    def __init__(self, agent: "BaseA2AAgent") -> None:
        self._agent = agent
        self._httpx: httpx.AsyncClient | None = None
        self._client = None
        self._task_id: str = ""
        self._context_id: str = ""

    async def _ensure_open(self) -> None:
        if self._client is not None:
            return
        self._httpx = httpx.AsyncClient(
            headers=self._agent._auth_headers(),
            timeout=httpx.Timeout(self._agent.TIMEOUT_SECONDS),
        )
        resolver = A2ACardResolver(
            httpx_client=self._httpx,
            base_url=self._agent._base_url,
            agent_card_path=self._agent.AGENT_CARD_PATH,
        )
        agent_card = await resolver.get_agent_card()
        self._client = await create_client(
            agent=agent_card,
            client_config=ClientConfig(streaming=True, httpx_client=self._httpx),
        )

    @property
    def task_id(self) -> str:
        return self._task_id

    @property
    def context_id(self) -> str:
        return self._context_id

    async def send(self, message: str, *, task_id: str = "") -> str:
        """Send a message on this session and return the concatenated text response.

        If ``task_id`` is provided (e.g. resuming a session from Redis after a
        user clarification), the message is attached to that task; otherwise
        the first send creates a new task and remembers its id, and follow-up
        sends reuse it.
        """
        await self._ensure_open()
        msg = new_text_message(message, role=Role.ROLE_USER)

        target_task = task_id or self._task_id
        if target_task:
            try:
                msg.task_id = target_task
            except (AttributeError, TypeError):
                # Older a2a-sdk builds may use a different field name.
                logger.debug("could not assign task_id on Message; relying on context")

        if self._context_id:
            try:
                msg.context_id = self._context_id
            except (AttributeError, TypeError):
                pass

        request = SendMessageRequest(message=msg)
        parts: list[str] = []
        async for response in self._client.send_message(request):
            task = getattr(response, "task", None)
            if task:
                if getattr(task, "id", None) and not self._task_id:
                    self._task_id = task.id
                if getattr(task, "context_id", None) and not self._context_id:
                    self._context_id = task.context_id
                for art in task.artifacts:
                    for part in art.parts:
                        if hasattr(part, "text") and part.text:
                            parts.append(part.text)
            elif not parts:
                parts.append(str(response))

        if not parts:
            return f"No response from {self._agent.AGENT_NAME}."
        logger.info(
            "%s: turn returned %d part(s) (task=%s)",
            self._agent.AGENT_NAME,
            len(parts),
            self._task_id or "<new>",
        )
        return "\n".join(parts)

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.close()
            except Exception:  # noqa: BLE001
                pass
            self._client = None
        if self._httpx is not None:
            await self._httpx.aclose()
            self._httpx = None


class BaseA2AAgent:
    """Reusable A2A client for a Foundry-hosted specialist agent."""

    AGENT_NAME: str = ""  # subclasses must set
    ROUTE_KEY: str = ""   # subclasses set to force orchestrator routing (e.g. "planner")
    AGENT_CARD_PATH: str = "agentCard/v0.3"
    TIMEOUT_SECONDS: float = 120.0

    def __init__(self) -> None:
        if not self.AGENT_NAME:
            raise ValueError(f"{type(self).__name__} must set AGENT_NAME")
        self._endpoint = settings.FOUNDRY_PROJECT_ENDPOINT
        self._base_url = (
            f"{self._endpoint}/agents/{self.AGENT_NAME}/endpoint/protocols/a2a"
        )
        self._credential = DefaultAzureCredential()
        logger.info("✓ %s: initialized (target=%s)", type(self).__name__, self.AGENT_NAME)

    def _auth_headers(self) -> dict:
        token = self._credential.get_token(_AZURE_AI_SCOPE)
        return {"Authorization": f"Bearer {token.token}"}

    @asynccontextmanager
    async def session(self) -> AsyncIterator[A2ASession]:
        """Open a multi-turn A2A session bound to one task.

        Usage:
            async with agent.session() as s:
                first = await s.send(initial_payload)
                second = await s.send(followup_payload)
        """
        sess = A2ASession(self)
        try:
            yield sess
        finally:
            await sess.close()

    async def send(self, message: str) -> str:
        """One-shot send: opens a session, sends a single message, closes.

        Backwards-compat shim for callers that don't need multi-turn.
        """
        async with self.session() as s:
            return await s.send(message)

    # ----------------------------------------------------------------- run

    async def run(
        self,
        prompt: str,
        user_id: str,
        role: str = "learner",
    ) -> Any:
        """Run a prompt through the orchestrator pipeline (chat-formatted)."""
        return await self._invoke_pipeline(
            prompt, user_id=user_id, role=role, raw=False,
        )

    async def run_raw(
        self,
        prompt: str,
        user_id: str,
        role: str = "learner",
    ) -> Any:
        """Run a prompt through the orchestrator pipeline WITHOUT chat formatting.

        Falls back to raw text if the response is not valid JSON. Use this
        for structured-data callers (e.g. dashboard cached endpoints).

        Routes that target this specialist directly (dashboard refresh
        endpoints) force their target via ``self.ROUTE_KEY`` so a Foundry
        misroute can't silently send the request to the wrong agent.
        """
        return await self._invoke_pipeline(
            prompt, user_id=user_id, role=role, raw=True,
        )

    async def run_raw_full(
        self,
        prompt: str,
        user_id: str,
        role: str = "learner",
    ) -> dict:
        """Like :meth:`run_raw` but returns the full pipeline result dict
        instead of just the parsed completion.

        Result shape::

            {
              "response": <parsed JSON or raw string from `completion`>,
              "agent": "<specialist agent name>",
              "correlation_id": "...",
              "trace": {
                "initial_envelope":   <envelope sent to Foundry>,
                "foundry_calls":      [ {"kind": "route"|"reground", "response": <env>}, ... ],
                "specialist_turns":   [ {"turn": N, "request_envelope": <env>,
                                         "response_envelope": <env>}, ... ],
                "final_envelope":     <last envelope received>,
                "turn_count":         <int>
              }
            }

        Used by dashboard routes that want to surface the full envelope
        journey (for diagnostics, debugging, or UI inspection) alongside
        the parsed payload.
        """
        from app.agents.orchestrator_agent import AgentError
        from app.orchestrator import orchestrator

        result = await orchestrator.process_raw(
            message=prompt, user_id=user_id, role=role, route_hint=self.ROUTE_KEY,
        )
        if err := result.get("error"):
            raise AgentError(
                err.get("message", "agent pipeline failed"),
                status_code=err.get("status_code", 502),
            )
        return result

    async def _invoke_pipeline(
        self,
        prompt: str,
        user_id: str,
        role: str,
        raw: bool,
    ) -> Any:
        # Lazy import to avoid circular import (orchestrator imports agents).
        from app.agents.orchestrator_agent import AgentError
        from app.orchestrator import orchestrator

        runner = orchestrator.process_raw if raw else orchestrator.process
        result = await runner(
            message=prompt, user_id=user_id, role=role, route_hint=self.ROUTE_KEY,
        )
        if err := result.get("error"):
            raise AgentError(
                err.get("message", "agent pipeline failed"),
                status_code=err.get("status_code", 502),
            )
        # process_raw() already runs extract_json on the specialist's
        # completion when raw=True, so the response field is either the
        # parsed object/array or the raw string fallback.
        return result.get("response", "")
