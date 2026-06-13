"""
Enterprise Learning System — Orchestrator Agent.

Drives the JSON envelope multi-turn protocol end-to-end:

    1. Build an initial envelope from the route handler's user_query
       (+ format_directive, + optional targeted_agent).
    2. Send it to the els-orchestrator Foundry agent. It returns a routed
       envelope with grounding `data` populated.
    3. If route == "none" → orchestrator answered directly; return its
       `completion` (capability statement / RBAC rejection / unauthorized).
    4. Otherwise forward the envelope to the chosen specialist via A2A.
       Specialist responds with another envelope.
    5. Loop:
         - state == "completed" → return `completion`.
         - state == "in_progress" with pending subagent_requests → send the
           envelope back to the Foundry orchestrator for reground (it
           fulfils pending items and flips them processed → in-place data
           append). Send the updated envelope back to the specialist.
       Cap at MAX_SPECIALIST_TURNS to avoid runaway loops.

Auth: Entra (DefaultAzureCredential) via the Azure AI Projects SDK.

Foundry agent setup notes
-------------------------
- The Foundry orchestrator agent is configured with the `els-mcp` tool server
  (require_approval = "never" — set in the Foundry portal). When Foundry runs
  the agent, it executes MCP tool calls server-side and returns the final
  envelope text.
- Safety fallback: if Foundry returns approval requests (require_approval
  still on "always"), we run the MCP tool ourselves once and re-call the
  agent with the results so it can finish its routing decision.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

import requests
from azure.ai.projects import AIProjectClient
from azure.identity import DefaultAzureCredential

from app.agent_cache import extract_json
from app.agents.assessment_agent import assessment_agent
from app.agents.base_a2a_agent import BaseA2AAgent
from app.agents.curator_agent import curator_agent
from app.agents.engagement_agent import engagement_agent
from app.agents.insights_agent import insights_agent
from app.agents.planner_agent import planner_agent
from app.config import settings
from app.protocol import (
    FORMAT_JSON,
    FORMAT_MARKDOWN,
    ROUTE_NONE,
    STATE_COMPLETED,
    build_initial_envelope,
    get_pending_subagent_requests,
    is_completed,
    parse_envelope,
    serialize_envelope,
    specialist_route,
    to_specialist_name,
    validate_envelope,
)

logger = logging.getLogger(__name__)


class AgentError(RuntimeError):
    """Raised when the orchestrator pipeline (Foundry, A2A) fails.

    Carries an HTTP-status hint so route handlers can surface accurate codes
    (429 rate limit, 401 unauth, 504 timeout, 502 generic upstream).
    """

    def __init__(self, message: str, status_code: int = 502, original: Exception | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.original = original


def _classify_status(exc: Exception) -> int:
    """Best-effort: map an upstream exception to an HTTP status hint."""
    msg = str(exc).lower()
    code = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
    if code in (401, 403, 404, 408, 429, 500, 502, 503, 504):
        return code
    if "429" in msg or "rate limit" in msg or "too many requests" in msg or "throttl" in msg:
        return 429
    if "401" in msg or "unauthor" in msg or "invalid token" in msg:
        return 401
    if "403" in msg or "forbidden" in msg:
        return 403
    if "timeout" in msg or "timed out" in msg:
        return 504
    if "connect" in msg or "refused" in msg or "dns" in msg:
        return 503
    return 502


class OrchestratorAgent:
    """Drives the JSON-envelope multi-turn protocol against Foundry + A2A specialists."""

    def __init__(self) -> None:
        self._endpoint = settings.FOUNDRY_PROJECT_ENDPOINT
        self._agent_name = settings.AGENT_ORCHESTRATOR
        self._mcp_url = settings.MCP_SERVER_URL

        try:
            self._credential = DefaultAzureCredential()
            self._project_client = AIProjectClient(
                endpoint=self._endpoint, credential=self._credential
            )
            logger.info("✓ OrchestratorAgent: AIProjectClient ready")
        except Exception as exc:  # noqa: BLE001
            logger.error("Foundry init failed: %s", exc)
            self._credential = None
            self._project_client = None

        self._routes: dict[str, BaseA2AAgent] = {
            "curator": curator_agent,
            "assessment": assessment_agent,
            "planner": planner_agent,
            "engagement": engagement_agent,
            "insights": insights_agent,
        }

    # ------------------------------------------------------------------ public

    async def process(
        self,
        message: str,
        user_id: str,
        role: str,
        correlation_id: str = "",
        route_hint: str = "",
        format_directive: str = FORMAT_MARKDOWN,
    ) -> dict:
        """Chat-facing entrypoint.

        Defaults `format_directive` to "markdown" so specialists return chat-
        ready prose (no JSON envelope rendering required by the UI).

        ``route_hint`` lets callers that already know the target specialist
        (dashboard refresh endpoints) force routing — passed as
        `targeted_agent` on the initial envelope (see orchestrator §6:
        "If targeted_agent is non-null and passes RBAC, copy it directly
        into route and skip intent inference").
        """
        return await self._process(
            message,
            user_id=user_id,
            role=role,
            correlation_id=correlation_id,
            route_hint=route_hint,
            format_directive=format_directive,
            raw=False,
        )

    async def process_raw(
        self,
        message: str,
        user_id: str,
        role: str,
        correlation_id: str = "",
        route_hint: str = "",
        format_directive: str = FORMAT_JSON,
    ) -> dict:
        """Structured-data entrypoint for cached / dashboard endpoints.

        Defaults `format_directive` to "json" so the specialist's `completion`
        is a JSON string. The caller's `BaseA2AAgent.run_raw` runs
        `extract_json` over it and falls back to raw text on parse failure.
        """
        return await self._process(
            message,
            user_id=user_id,
            role=role,
            correlation_id=correlation_id,
            route_hint=route_hint,
            format_directive=format_directive,
            raw=True,
        )

    async def _process(
        self,
        message: str,
        *,
        user_id: str,
        role: str,
        correlation_id: str,
        route_hint: str,
        format_directive: str,
        raw: bool,
    ) -> dict:
        """Shared pipeline used by both process() and process_raw().

        Always returns a ``trace`` dict in the result so callers (chat UI,
        dashboard cache) can inspect the full envelope journey:
            - the initial envelope sent to Foundry
            - every Foundry call (initial route + each reground turn)
            - every specialist turn (response envelope only)
        The trace is deduplicated: a specialist turn's request envelope is
        always the preceding ``foundry_calls`` response, and the final
        envelope is the last entry of ``specialist_turns`` (or the last
        ``foundry_calls`` response when the orchestrator answered directly).
        Trace is included on success AND on error (so partial failures are
        debuggable).
        """
        targeted = to_specialist_name(route_hint) if route_hint else None
        envelope = build_initial_envelope(
            user_id=user_id,
            role=role,
            user_query=message,
            format_directive=format_directive or None,
            targeted_agent=targeted,
        )
        trace: dict[str, Any] = {
            "initial_envelope": envelope,
            "foundry_calls": [],     # one entry per orchestrator call
            "specialist_turns": [],  # one entry per specialist response
            "turn_count": 0,
        }

        try:
            routed = await self._call_orchestrator(envelope, raw=raw)
            trace["foundry_calls"].append({"kind": "route", "response": routed})
            issues = validate_envelope(routed)
            if issues:
                raise AgentError(
                    "Foundry orchestrator returned malformed envelope: "
                    + "; ".join(issues),
                    status_code=502,
                )

            # Direct-answer escape hatch — orchestrator handled it itself
            # (greeting / capability question / unauthorized / RBAC reject).
            if routed.get("route") == ROUTE_NONE:
                completion = routed.get("completion") or self._fallback_message()
                return {
                    "response": completion,
                    "agent": "orchestrator",
                    "correlation_id": correlation_id,
                    "trace": trace,
                }

            route_key = specialist_route(routed)
            if not route_key:
                raise AgentError(
                    f"Foundry orchestrator returned unknown route: "
                    f"{routed.get('route')!r}",
                    status_code=502,
                )

            # RBAC second-line defence (orchestrator should already enforce
            # this, but we double-check so a misbehaving prompt can't leak).
            if route_key == "insights" and role not in ("manager", "admin"):
                logger.info(
                    "Insights blocked at gateway for role=%s — rejecting", role
                )
                return {
                    "response": (
                        "That request needs manager permissions, so I can't "
                        "run it for your role."
                    ),
                    "agent": "orchestrator",
                    "correlation_id": correlation_id,
                    "trace": trace,
                }

            agent = self._routes[route_key]
            final = await self._drive_specialist(agent, routed, trace=trace)

            return {
                "response": self._extract_completion(final, raw=raw),
                "agent": agent.AGENT_NAME,
                "correlation_id": correlation_id,
                "trace": trace,
            }

        except AgentError as exc:
            logger.error(
                "Orchestrator pipeline failed (status=%d): %s",
                exc.status_code, exc, exc_info=True,
            )
            return {
                "response": self._fallback_message(),
                "agent": "system",
                "correlation_id": correlation_id,
                "trace": trace,
                "error": {"message": str(exc), "status_code": exc.status_code},
            }
        except Exception as exc:  # noqa: BLE001
            status = _classify_status(exc)
            logger.error(
                "Orchestrator pipeline failed (status=%d): %s",
                status, exc, exc_info=True,
            )
            return {
                "response": self._fallback_message(),
                "agent": "system",
                "correlation_id": correlation_id,
                "trace": trace,
                "error": {"message": str(exc) or type(exc).__name__, "status_code": status},
            }

    # --------------------------------------------------------------- specialist loop

    async def _drive_specialist(
        self,
        agent: BaseA2AAgent,
        routed_envelope: dict[str, Any],
        *,
        trace: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Multi-turn loop: forward envelope to specialist, reground via Foundry
        on any pending subagent_requests, until specialist signals completed.

        If a ``trace`` dict is supplied, every specialist turn (request +
        response envelope) and every reground call is appended to it for
        diagnostics.
        """
        envelope = routed_envelope
        max_turns = settings.MAX_SPECIALIST_TURNS

        async with agent.session() as a2a_sess:
            for turn in range(1, max_turns + 1):
                response_text = await a2a_sess.send(serialize_envelope(envelope))
                try:
                    envelope = parse_envelope(response_text)
                except ValueError as exc:
                    logger.error(
                        "%s turn %d: failed to parse envelope (%s). Full response:\n%s",
                        agent.AGENT_NAME, turn, exc, response_text,
                    )
                    if trace is not None:
                        trace["specialist_turns"].append({
                            "turn": turn,
                            "response_text": response_text,
                            "parse_error": str(exc),
                        })
                        trace["turn_count"] = turn
                    raise AgentError(
                        f"specialist {agent.AGENT_NAME} returned non-JSON envelope: "
                        f"{exc}",
                        status_code=502,
                    ) from exc

                if trace is not None:
                    trace["specialist_turns"].append({
                        "turn": turn,
                        "response_envelope": envelope,
                    })
                    trace["turn_count"] = turn

                if is_completed(envelope):
                    return envelope

                pending = get_pending_subagent_requests(envelope)
                if not pending:
                    # in_progress with no pending requests — nothing actionable.
                    # Treat as a soft-completed turn so we don't spin.
                    logger.warning(
                        "%s: in_progress with no pending subagent_requests on "
                        "turn %d — treating as completed",
                        agent.AGENT_NAME, turn,
                    )
                    return envelope

                if turn >= max_turns:
                    logger.warning(
                        "%s: reached MAX_SPECIALIST_TURNS=%d with %d pending request(s) "
                        "— surfacing best-effort answer",
                        agent.AGENT_NAME, max_turns, len(pending),
                    )
                    return self._cap_envelope(envelope, agent.AGENT_NAME, pending)

                # Reground via Foundry — orchestrator processes pending items
                # and returns the same envelope with data appended.
                envelope = await self._call_orchestrator(envelope)
                if trace is not None:
                    trace["foundry_calls"].append({
                        "kind": "reground",
                        "after_turn": turn,
                        "response": envelope,
                    })
                issues = validate_envelope(envelope)
                if issues:
                    raise AgentError(
                        "Foundry reground produced malformed envelope: "
                        + "; ".join(issues),
                        status_code=502,
                    )

        # Defensive — loop should always exit via return above.
        return envelope

    @staticmethod
    def _cap_envelope(
        envelope: dict[str, Any],
        agent_name: str,
        pending: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Synthesize a completed envelope when we hit the turn cap."""
        gaps = "; ".join(
            (p.get("subagent_query") or "").strip()
            for p in pending if (p.get("subagent_query") or "").strip()
        )
        gap_clause = f" Still needed: {gaps}." if gaps else ""
        envelope["state"] = STATE_COMPLETED
        envelope["completion"] = (
            f"I gathered as much as I could from {agent_name} but ran out of "
            f"steps before finalising the answer.{gap_clause} "
            "Please try rephrasing or narrowing the question."
        )
        return envelope

    # --------------------------------------------------------------- foundry

    async def _call_orchestrator(
        self,
        envelope: dict[str, Any],
        *,
        raw: bool = True,
    ) -> dict[str, Any]:
        """Send a JSON envelope to the Foundry orchestrator and parse the
        envelope it returns. Handles MCP approval-loop fallback transparently.

        ``raw=True`` (dashboard / structured callers) demands a strict
        envelope and raises 502 on parse failure — those callers need typed
        fields.

        ``raw=False`` (chat / markdown callers) only needs a user-facing
        string. If the wrapper envelope is malformed but the agent emitted
        sensible markdown text, we synthesise a completed `route: "none"`
        envelope around that text rather than 502'ing the user. This is
        the chat-resilience the protocol was designed for.
        """
        raw_response = await self._call_foundry(serialize_envelope(envelope))
        text = await self._resolve_text(raw_response)
        try:
            return parse_envelope(text)
        except ValueError as exc:
            snippet = text[:300].replace("\n", " ") if text else "<empty>"
            if raw:
                raise AgentError(
                    f"Foundry orchestrator returned non-JSON envelope: {exc}. "
                    f"First 300 chars: {snippet}",
                    status_code=502,
                ) from exc
            # Chat fallback: ship the agent's text as a route="none" answer.
            logger.warning(
                "Orchestrator wrapper envelope unparseable; treating raw text "
                "as markdown completion (chat). %s. First 300 chars: %s",
                exc, snippet,
            )
            return {
                "state": STATE_COMPLETED,
                "user_id": envelope.get("user_id", ""),
                "role": envelope.get("role", ""),
                "targeted_agent": envelope.get("targeted_agent"),
                "format_directive": envelope.get("format_directive"),
                "user_query": envelope.get("user_query", ""),
                "route": ROUTE_NONE,
                "data": envelope.get("data", []) or [],
                "sources": envelope.get("sources", []) or [],
                "subagent_requests": [],
                "completion": (text or "").strip() or self._fallback_message(),
            }

    async def _call_foundry(self, input_text: str) -> dict:
        if self._project_client is None:
            raise AgentError(
                "Foundry client not initialised — check Azure credentials.",
                status_code=503,
            )
        return await asyncio.to_thread(self._call_foundry_sync, input_text)

    def _call_foundry_sync(self, input_text: str) -> dict:
        client = self._project_client.get_openai_client()
        response = client.responses.create(
            input=[{"role": "user", "content": input_text}],
            extra_body={
                "agent_reference": {
                    "name": self._agent_name,
                    "type": "agent_reference",
                }
            },
        )
        return response.to_dict()

    async def _resolve_text(self, raw: dict | str) -> str:
        """Extract text from a Foundry response. Re-runs MCP tools locally if
        Foundry returned approval requests instead of a final envelope.
        """
        if isinstance(raw, str):
            return raw

        text = self._extract_text(raw)
        if text:
            return text

        approvals = self._collect_approvals(raw)
        if not approvals:
            status = raw.get("status") if isinstance(raw, dict) else None
            err = (raw.get("error") or {}) if isinstance(raw, dict) else {}
            err_msg = err.get("message") if isinstance(err, dict) else None
            raise AgentError(
                f"Foundry agent returned empty output (status={status}, err={err_msg})",
                status_code=502,
            )

        logger.warning(
            "Foundry returned %d MCP approval request(s); executing locally as "
            "fallback. Set require_approval='never' on the els-mcp tool in "
            "Foundry to skip this.",
            len(approvals),
        )
        results = [
            {
                "tool": apr["name"],
                "args": apr["args"],
                "result": await asyncio.to_thread(
                    self._invoke_mcp_tool, apr["name"], apr["args"]
                ),
            }
            for apr in approvals
        ]
        followup = self._build_mcp_followup_prompt(results)
        raw2 = await self._call_foundry(followup)
        text2 = self._extract_text(raw2)
        if not text2:
            raise AgentError(
                "Foundry agent returned empty output after MCP follow-up",
                status_code=502,
            )
        return text2

    @staticmethod
    def _extract_text(data: dict) -> str:
        if not isinstance(data, dict):
            return ""
        if txt := data.get("output_text"):
            return txt
        chunks: list[str] = []
        for item in data.get("output", []) or []:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "message":
                for c in item.get("content", []) or []:
                    if isinstance(c, dict) and c.get("type") == "output_text":
                        chunks.append(c.get("text", ""))
            elif "text" in item and isinstance(item["text"], str):
                chunks.append(item["text"])
        if chunks:
            return "\n".join(chunks)
        choices = data.get("choices", [])
        if isinstance(choices, list) and choices:
            return choices[0].get("message", {}).get("content", "") or ""
        return ""

    @staticmethod
    def _collect_approvals(data: dict) -> list[dict]:
        out: list[dict] = []
        for item in data.get("output", []) or []:
            if not isinstance(item, dict):
                continue
            if item.get("type") in ("mcp_approval_request", "mcp_call"):
                args = item.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                if isinstance(args, dict):
                    args.pop("name", None)
                if name := item.get("name"):
                    out.append({"name": name, "args": args})
        return out

    @staticmethod
    def _build_mcp_followup_prompt(results: list[dict]) -> str:
        """Compose a follow-up message after locally fulfilling Foundry-emitted
        MCP approval requests. The agent's system prompt instructs it to
        produce a JSON envelope; we just supply the tool results so it can.
        """
        parts = [
            "Here are the MCP tool results you requested. Produce your envelope "
            "now per the system prompt (single JSON object, no surrounding "
            "prose, no code fence).\n"
        ]
        for r in results:
            parts.append(f"## Tool: {r['tool']}")
            if r.get("args"):
                parts.append(f"Arguments: {json.dumps(r['args'])}")
            parts.append(f"Result:\n{r['result']}\n")
        return "\n".join(parts)

    # --------------------------------------------------------------- output

    @staticmethod
    def _looks_like_grounding_item(item: Any) -> bool:
        """True when ``item`` matches the <data item> schema from protocol.py:
        ``{id, source, entity, payload}``. Used to decide whether the agent
        respected the protocol or stuffed its answer into ``data``.
        """
        if not isinstance(item, dict):
            return False
        return "id" in item and "source" in item and "payload" in item

    @classmethod
    def _recover_from_data(cls, envelope: dict[str, Any]) -> Any:
        """Defensive fallback for specialists that put their answer in ``data``
        instead of ``completion`` (protocol violation — see system prompt
        guardrail §2). If every ``data`` item lacks the grounding shape, we
        treat the list itself as the answer.

        Returns the recovered value or ``None`` when ``data`` looks like
        legitimate grounding (or is empty).
        """
        data = envelope.get("data") or []
        if not isinstance(data, list) or not data:
            return None
        if any(cls._looks_like_grounding_item(it) for it in data):
            return None
        logger.warning(
            "%s returned state=completed with completion=null; recovering "
            "answer from `data` (protocol violation — answer belongs in "
            "`completion`). Items=%d",
            envelope.get("targeted_agent") or envelope.get("route") or "specialist",
            len(data),
        )
        return data

    @classmethod
    def _extract_completion(cls, envelope: dict[str, Any], *, raw: bool) -> Any:
        """Pull `completion` out of a final envelope.

        For ``raw=True`` callers we attempt JSON extraction so cached
        endpoints get a structured object; we return a string fallback if
        the specialist disobeyed format_directive=json. For ``raw=False``
        (chat) we hand back the markdown string directly.

        Defensive fallback: when the specialist left ``completion`` null but
        stuffed its answer into ``data`` (a known prompt-following failure),
        recover the answer from ``data`` so the dashboard still renders.
        """
        completion = envelope.get("completion")
        if completion is None:
            recovered = cls._recover_from_data(envelope)
            if recovered is not None:
                if raw:
                    return recovered
                return json.dumps(recovered, ensure_ascii=False)
            return ""
        if not isinstance(completion, str):
            return completion

        if raw:
            parsed = extract_json(completion)
            return parsed if parsed is not None else completion
        return completion

    # --------------------------------------------------------------- fallback

    @staticmethod
    def _fallback_message() -> str:
        return (
            "I'm your Enterprise Learning assistant. I can help with learning paths, "
            "practice assessments, study plans, motivation nudges, and team insights. "
            "The agent is reconnecting — please try again in a moment."
        )

    # ---------------------- local MCP invocation (rare fallback path) --------

    def _invoke_mcp_tool(self, tool_name: str, arguments: dict) -> str:
        url = self._mcp_url
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        session_id: str | None = None
        try:
            init = requests.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": str(uuid.uuid4()),
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "els-orchestrator", "version": "1.0.0"},
                    },
                },
                headers=headers,
                timeout=30,
            )
            if init.status_code == 200:
                session_id = init.headers.get("Mcp-Session-Id")
                notif_headers = dict(headers)
                if session_id:
                    notif_headers["Mcp-Session-Id"] = session_id
                requests.post(
                    url,
                    json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                    headers=notif_headers,
                    timeout=10,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("MCP init failed (non-fatal): %s", exc)

        call_headers = dict(headers)
        if session_id:
            call_headers["Mcp-Session-Id"] = session_id
        try:
            resp = requests.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": str(uuid.uuid4()),
                    "method": "tools/call",
                    "params": {"name": tool_name, "arguments": arguments},
                },
                headers=call_headers,
                timeout=60,
            )
            if resp.status_code != 200:
                return f"MCP {tool_name} failed: HTTP {resp.status_code}"
            data = self._parse_mcp_response(resp)
            result = data.get("result", data) if isinstance(data, dict) else {}
            if isinstance(result, dict) and "content" in result:
                pieces = [
                    p.get("text", "")
                    for p in result.get("content", [])
                    if isinstance(p, dict) and p.get("type") == "text"
                ]
                if pieces:
                    return "\n".join(pieces)
            return json.dumps(result, indent=2) if result else resp.text
        except Exception as exc:  # noqa: BLE001
            return f"MCP {tool_name} error: {exc}"

    @staticmethod
    def _parse_mcp_response(resp: requests.Response) -> dict:
        ctype = resp.headers.get("Content-Type", "")
        if "application/json" in ctype:
            try:
                return resp.json()
            except Exception:  # noqa: BLE001
                return {}
        if "text/event-stream" in ctype:
            last: dict | None = None
            for line in resp.text.split("\n"):
                line = line.strip()
                if line.startswith("data:"):
                    raw = line[len("data:") :].strip()
                    if raw:
                        try:
                            last = json.loads(raw)
                        except json.JSONDecodeError:
                            pass
            return last or {}
        try:
            return resp.json()
        except Exception:  # noqa: BLE001
            return {}
