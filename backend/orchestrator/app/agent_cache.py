"""
Generic agent-output cache + JSON-extraction helpers.

Pattern (used by every specialist endpoint)
-------------------------------------------
GET  /<resource>            → return cached output (if any), no agent call.
POST /<resource>/refresh    → call the orchestrator → specialist pipeline,
                              parse JSON if possible, cache, return.

We keep ONE collection (`agent_cache`) keyed by (user_id, agent), so we don't
spawn N caches per agent type. Output can be a JSON object/array (preferred)
or a raw string fallback.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from app.db import get_db

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------- cache

CACHE_COLLECTION = "agent_cache"


async def get_cached(user_id: str, agent: str) -> dict | None:
    """Return cached entry for (user_id, agent), or None."""
    if not user_id:
        return None
    db = get_db()
    doc = await db[CACHE_COLLECTION].find_one(
        {"user_id": user_id, "agent": agent}, {"_id": 0}
    )
    return doc


async def set_cached(
    user_id: str,
    agent: str,
    output: Any,
    *,
    trace: dict | None = None,
) -> dict:
    """Upsert cache entry. Returns the stored document.

    When ``trace`` is provided (full envelope journey from
    ``orchestrator.process_raw``), it's stored alongside ``output`` so the
    GET endpoint can surface it for diagnostics.
    """
    db = get_db()
    record: dict = {
        "user_id": user_id,
        "agent": agent,
        "output": output,
        "cached_at": datetime.now(timezone.utc).isoformat() + "Z",
    }
    if trace is not None:
        record["trace"] = trace
    await db[CACHE_COLLECTION].update_one(
        {"user_id": user_id, "agent": agent},
        {"$set": record},
        upsert=True,
    )
    return record


async def clear_cached(user_id: str, agent: str | None = None) -> int:
    db = get_db()
    q = {"user_id": user_id}
    if agent:
        q["agent"] = agent
    res = await db[CACHE_COLLECTION].delete_many(q)
    return res.deleted_count


# --------------------------------------------------------------- JSON parsing

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
_CITATION_RE = re.compile(r"【[^】]*†[^】]*】")


def strip_citations(text: str) -> str:
    """Remove Foundry IQ citation tokens — useful when comparing or trimming."""
    return _CITATION_RE.sub("", text or "")


def extract_json(text: str) -> Any | None:
    """Best-effort: pull a JSON object or array out of a model response.

    Tries (in order):
    1. Strict json.loads on the trimmed body.
    2. Strip ```json fences and retry.
    3. Slice from the first '{' / '[' to the matching last '}' / ']'.
    Returns None if nothing parses.
    """
    if not text:
        return None
    body = text.strip()

    # 1) direct
    try:
        return json.loads(body)
    except (json.JSONDecodeError, ValueError):
        pass

    # 2) strip code fences
    if body.startswith("```"):
        cleaned = _FENCE_RE.sub("", body).strip()
        try:
            return json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            body = cleaned

    # 3) slice the outermost JSON token
    for opener, closer in (("[", "]"), ("{", "}")):
        s = body.find(opener)
        e = body.rfind(closer)
        if s != -1 and e > s:
            try:
                return json.loads(body[s : e + 1])
            except (json.JSONDecodeError, ValueError):
                continue

    return None


# ---------------------------------------------------------- response shaping

def _final_envelope_from_trace(trace: dict | None) -> dict | None:
    """Locate the last envelope produced in a pipeline trace.

    Prefers the most recent specialist response, falling back to the last
    Foundry call (covers the route=\"none\" path where no specialist ran).
    """
    if not isinstance(trace, dict):
        return None
    turns = trace.get("specialist_turns") or []
    if isinstance(turns, list) and turns:
        last = turns[-1]
        if isinstance(last, dict):
            env = last.get("response_envelope")
            if isinstance(env, dict):
                return env
    calls = trace.get("foundry_calls") or []
    if isinstance(calls, list) and calls:
        last = calls[-1]
        if isinstance(last, dict):
            resp = last.get("response")
            if isinstance(resp, dict):
                return resp
    return None


def _project_sources(envelope_sources: list) -> list[dict]:
    """Convert envelope ``sources`` items ({type, name, chunk_id?}) into the
    display shape SourcesPopover expects ({title, kind?}).
    """
    out: list[dict] = []
    for src in envelope_sources or []:
        if not isinstance(src, dict):
            continue
        name = src.get("name") or ""
        if not name:
            continue
        out.append({
            "title": name,
            "kind": "kb" if src.get("type") == "kb" else "signal",
        })
    return out


def cache_envelope(record: dict | None, fresh: bool = False) -> dict:
    """Standard envelope returned by every cached endpoint.

    Surfaces the full pipeline ``trace`` (initial / foundry / specialist
    envelopes) when present so dashboards can inspect the agent's full
    journey, not just the final ``completion`` payload.

    When the cached output is a dict-shaped specialist payload that lacks a
    ``sources`` field, we project the envelope's grounding sources into the
    output so the dashboard's info popover has something to render.
    """
    if not record:
        return {"cached": False, "output": None, "cached_at": None, "fresh": False}

    output = record.get("output")
    trace = record.get("trace")

    if isinstance(output, dict) and not output.get("sources"):
        env = _final_envelope_from_trace(trace)
        if env is not None:
            projected = _project_sources(env.get("sources") or [])
            if projected:
                output = {**output, "sources": projected}

    payload: dict = {
        "cached": True,
        "output": output,
        "cached_at": record.get("cached_at"),
        "agent": record.get("agent"),
        "fresh": fresh,
    }
    if trace is not None:
        payload["trace"] = trace
    return payload
