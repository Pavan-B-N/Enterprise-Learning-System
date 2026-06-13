"""
Multi-turn agent wire protocol — JSON envelope.

The orchestrator and every specialist exchange a single JSON object per turn.
This module owns the schema, builders, parsers, and small mutation helpers
the orchestrator needs to drive the multi-turn loop.

Envelope shape (single source of truth — system prompts mirror this):

    {
      "state":            "in_progress" | "completed",
      "user_id":          "<string>",
      "role":             "learner" | "manager" | "admin",
      "targeted_agent":   "<specialist enum>" | null,
      "format_directive": "json" | "markdown" | "html" | "yaml" | "csv" | "text" | null,
      "user_query":       "<string>",
      "route":            "<specialist enum>" | "none" | null,
      "data":             [ <data item>, ... ],
      "sources":          [ <source ref>, ... ],
      "subagent_requests": [ <subagent request>, ... ],
      "completion":       "<string>" | null
    }

Element shapes:

    <data item>  = { "id": "<str>", "source": <source ref>, "entity": "<str>", "payload": <obj|array> }
    <source ref> = { "type": "mcp" | "kb", "name": "<str>", "chunk_id": "<str>?" }
    <subagent request> = { "id": "<str>", "subagent_query": "<str>", "state": "pending" | "processed" }

Recognising the turn type at parse time (orchestrator-side):
    - Initial turn:  route absent/null AND no pending subagent_requests
    - Reground turn: route is a specialist AND ≥ 1 pending subagent_requests
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Iterable, Literal

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------- constants

STATE_IN_PROGRESS = "in_progress"
STATE_COMPLETED = "completed"
VALID_STATES = (STATE_IN_PROGRESS, STATE_COMPLETED)

# Mirrors §6 of the orchestrator system prompt. The "specialist enum" here is
# the Foundry agent name (== AGENT_NAME on each Python wrapper) so the
# `route` field round-trips between Python and Foundry without translation.
ROUTE_NONE = "none"
ROUTE_CURATOR = "learning-path-curator-agent"
ROUTE_ASSESSMENT = "assessment-agent"
ROUTE_PLANNER = "study-plan-generator-agent"
ROUTE_ENGAGEMENT = "engagement-agent"
ROUTE_INSIGHTS = "manager-insights-agent"

KNOWN_SPECIALISTS = (
    ROUTE_CURATOR,
    ROUTE_ASSESSMENT,
    ROUTE_PLANNER,
    ROUTE_ENGAGEMENT,
    ROUTE_INSIGHTS,
)
KNOWN_ROUTES = KNOWN_SPECIALISTS + (ROUTE_NONE,)

# Caller-friendly route keys → canonical specialist names. Routes/agents in
# the rest of the codebase use the short keys ("curator", "planner", ...);
# this map is the only place that knows the long Foundry agent names.
ROUTE_KEY_TO_SPECIALIST: dict[str, str] = {
    "curator": ROUTE_CURATOR,
    "assessment": ROUTE_ASSESSMENT,
    "planner": ROUTE_PLANNER,
    "engagement": ROUTE_ENGAGEMENT,
    "insights": ROUTE_INSIGHTS,
}
SPECIALIST_TO_ROUTE_KEY: dict[str, str] = {
    v: k for k, v in ROUTE_KEY_TO_SPECIALIST.items()
}

FORMAT_JSON = "json"
FORMAT_MARKDOWN = "markdown"
FORMAT_HTML = "html"
FORMAT_YAML = "yaml"
FORMAT_CSV = "csv"
FORMAT_TEXT = "text"
VALID_FORMATS = (FORMAT_JSON, FORMAT_MARKDOWN, FORMAT_HTML, FORMAT_YAML, FORMAT_CSV, FORMAT_TEXT)

FormatDirective = Literal["json", "markdown", "html", "yaml", "csv", "text"]
Role = Literal["learner", "manager", "admin"]

# Required fields that must appear on every envelope (even as null/[]).
ENVELOPE_FIELDS = (
    "state",
    "user_id",
    "role",
    "targeted_agent",
    "format_directive",
    "user_query",
    "route",
    "data",
    "sources",
    "subagent_requests",
    "completion",
)

# Strip outer ```json ... ``` fences. Anchored to the start/end of the
# *entire* body so we don't accidentally chew up code fences that the agent
# embedded inside the `completion` markdown string.
_FENCE_RE = re.compile(r"\A```(?:json)?\s*|\s*```\Z", re.IGNORECASE)


# ----------------------------------------------------------------- helpers

def normalize_route_key(value: str) -> str:
    """Accept either a short route key ("curator") or a Foundry agent name
    ("learning-path-curator-agent") and return the short key, or "" if unknown.
    """
    if not value:
        return ""
    if value in ROUTE_KEY_TO_SPECIALIST:
        return value
    if value in SPECIALIST_TO_ROUTE_KEY:
        return SPECIALIST_TO_ROUTE_KEY[value]
    return ""


def to_specialist_name(route_key_or_name: str) -> str:
    """Inverse of normalize_route_key — returns the canonical Foundry agent name
    for the route, or "" if unknown.
    """
    if not route_key_or_name:
        return ""
    if route_key_or_name in ROUTE_KEY_TO_SPECIALIST:
        return ROUTE_KEY_TO_SPECIALIST[route_key_or_name]
    if route_key_or_name in SPECIALIST_TO_ROUTE_KEY:
        return route_key_or_name
    return ""


# ----------------------------------------------------------------- builders

def build_initial_envelope(
    *,
    user_id: str,
    role: str,
    user_query: str,
    format_directive: str | None,
    targeted_agent: str | None = None,
) -> dict[str, Any]:
    """Construct an initial-turn envelope (orchestrator-bound).

    `targeted_agent` may be either a short route key ("curator") or a full
    Foundry specialist name; it's normalised to the canonical specialist
    name expected by the orchestrator system prompt §3.1.
    """
    if format_directive and format_directive not in VALID_FORMATS:
        logger.warning(
            "build_initial_envelope: unknown format_directive=%r — passing through",
            format_directive,
        )

    targeted_canonical: str | None = None
    if targeted_agent:
        targeted_canonical = to_specialist_name(targeted_agent) or targeted_agent

    return {
        "state": STATE_IN_PROGRESS,
        "user_id": user_id or "",
        "role": role or "learner",
        "targeted_agent": targeted_canonical,
        "format_directive": format_directive,
        "user_query": user_query or "",
        # Initial-turn fields the orchestrator system prompt expects ABSENT;
        # we serialize them as null/[] so the receiving JSON parser doesn't
        # need to special-case missing keys. The §3.1 detector ("route
        # absent/null") still works because we send null, not a specialist.
        "route": None,
        "data": [],
        "sources": [],
        "subagent_requests": [],
        "completion": None,
    }


def serialize_envelope(envelope: dict[str, Any]) -> str:
    """Serialise an envelope to compact JSON suitable for sending over the wire."""
    return json.dumps(envelope, ensure_ascii=False)


def parse_envelope(text: str) -> dict[str, Any]:
    """Parse a JSON envelope returned by an orchestrator or specialist.

    Raises ValueError if the text doesn't contain a parseable JSON object.
    Tolerates ```json fences and surrounding whitespace.
    """
    if not text or not text.strip():
        raise ValueError("empty envelope")

    body = text.strip()
    # Direct parse first (the prompt mandates raw JSON, so this should always work).
    try:
        env = json.loads(body)
    except json.JSONDecodeError:
        # Strip outer code fences if the agent wrapped its output (off-spec but observed).
        cleaned = _FENCE_RE.sub("", body).strip()
        env = None
        if cleaned and cleaned != body:
            try:
                env = json.loads(cleaned)
            except json.JSONDecodeError:
                env = None

        # Last resort: slice the outermost { ... } and try again.
        if env is None:
            s = body.find("{")
            e = body.rfind("}")
            if s != -1 and e > s:
                try:
                    env = json.loads(body[s : e + 1])
                except json.JSONDecodeError as exc:
                    raise ValueError(f"envelope not valid JSON: {exc}") from exc
            else:
                raise ValueError("envelope not valid JSON: no top-level object found")

    if not isinstance(env, dict):
        raise ValueError(f"envelope must be a JSON object, got {type(env).__name__}")

    # Backfill any missing required fields with safe defaults so downstream
    # code can read every key without KeyError. This is forgiveness, not
    # validation — see validate_envelope() for strict checks.
    for key in ENVELOPE_FIELDS:
        env.setdefault(key, _default_for(key))

    return env


def _default_for(field: str) -> Any:
    if field in ("data", "sources", "subagent_requests"):
        return []
    return None


def validate_envelope(env: dict[str, Any]) -> list[str]:
    """Lightweight schema check — returns a list of human-readable issues,
    empty if the envelope is well-formed enough to drive the loop.
    Strictness intentionally limited to fields the loop actually consumes.
    """
    issues: list[str] = []
    state = env.get("state")
    if state not in VALID_STATES:
        issues.append(f"state must be one of {VALID_STATES}, got {state!r}")

    route = env.get("route")
    if route is not None and route not in KNOWN_ROUTES:
        issues.append(f"route must be one of {KNOWN_ROUTES} or null, got {route!r}")

    for list_field in ("data", "sources", "subagent_requests"):
        if not isinstance(env.get(list_field), list):
            issues.append(f"{list_field} must be a list")

    return issues


# ----------------------------------------------------------------- inspectors

def get_pending_subagent_requests(env: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the list of subagent requests currently in `state: "pending"`."""
    requests = env.get("subagent_requests") or []
    if not isinstance(requests, list):
        return []
    return [
        r for r in requests
        if isinstance(r, dict) and r.get("state") == "pending"
    ]


def has_pending_subagent_requests(env: dict[str, Any]) -> bool:
    return bool(get_pending_subagent_requests(env))


def is_completed(env: dict[str, Any]) -> bool:
    return env.get("state") == STATE_COMPLETED


def specialist_route(env: dict[str, Any]) -> str:
    """Return the specialist route key (short form) if env is routed to one,
    or "" if route is "none"/null/unknown.
    """
    route = env.get("route")
    if not route or route == ROUTE_NONE:
        return ""
    return SPECIALIST_TO_ROUTE_KEY.get(route, "")


# ----------------------------------------------------------------- mutators

def mark_request_processed(env: dict[str, Any], request_id: str) -> bool:
    """Flip a single subagent_request from "pending" to "processed". Returns
    True if the flip happened, False if no matching pending entry was found.
    """
    for req in env.get("subagent_requests") or []:
        if isinstance(req, dict) and req.get("id") == request_id and req.get("state") == "pending":
            req["state"] = "processed"
            return True
    return False


def append_data(
    env: dict[str, Any],
    *,
    item_id: str,
    source: dict[str, Any],
    entity: str,
    payload: Any,
) -> None:
    """Append one data item to env["data"] (no dedupe — caller's responsibility)."""
    env.setdefault("data", []).append({
        "id": item_id,
        "source": source,
        "entity": entity,
        "payload": payload,
    })


def append_sources(env: dict[str, Any], new_sources: Iterable[dict[str, Any]]) -> None:
    """Append source refs to env["sources"], deduped by (type, name, chunk_id)."""
    existing = env.setdefault("sources", [])
    seen = {
        (s.get("type"), s.get("name"), s.get("chunk_id"))
        for s in existing if isinstance(s, dict)
    }
    for src in new_sources:
        if not isinstance(src, dict):
            continue
        key = (src.get("type"), src.get("name"), src.get("chunk_id"))
        if key in seen:
            continue
        seen.add(key)
        existing.append(src)
