"""Question generation pipeline.

Strategy:
1. Load the course (with modules/topics) from MongoDB.
2. Decide question count: clamp `topics_count * QUESTIONS_PER_TOPIC` to [MIN, MAX].
3. Call the assessment_agent via the orchestrator HTTP API to produce MCQs.
4. If the agent returns less than the floor, top up with simple deterministic
   stem questions so the user is never blocked. (The agent path is preferred;
   the deterministic fallback exists so a Foundry outage doesn't break the
   scheduling flow.)
5. Persist questions into `assessment_questions` collection, keyed by
   schedule_id, with the correct answer index hidden from the take-exam API.
"""

from __future__ import annotations

import logging
import random
import re
from typing import Any

import httpx
from bson import ObjectId

from app.config import settings
from app.db import get_db

logger = logging.getLogger(__name__)

# Caps for the grounding payload sent to the agent. content_md can be large;
# trim per-topic so the prompt stays within Foundry token limits.
_MAX_CHARS_PER_TOPIC = 1500
_MAX_TOTAL_GROUNDING_CHARS = 30_000


def _clamp(n: int, low: int, high: int) -> int:
    return max(low, min(n, high))


async def _load_course(course_id: str) -> dict | None:
    db = get_db()
    try:
        oid = ObjectId(course_id)
    except Exception:  # noqa: BLE001
        return None
    return await db.courses.find_one({"_id": oid})


async def _load_grounded_topics(course_id: str, course: dict) -> list[dict]:
    """Load real topics (with content_md / key_takeaways) for a course.

    Joins the `topics` collection with `modules` to get the module title for
    each topic. Falls back to the legacy embedded `course.modules[].topics[]`
    (string list) if the topics collection has nothing for this course — that
    way old seeded data still works.

    Returned shape:
        [{
            "module_title": str,
            "topic_name": str,
            "content": str,            # trimmed content_md
            "key_takeaways": [str],
            "order": int,
        }, ...]
    """
    db = get_db()
    try:
        cid = ObjectId(course_id)
    except Exception:  # noqa: BLE001
        return []

    # Build module_id -> title map
    modules_cursor = db.modules.find({"course_id": cid})
    module_titles: dict[Any, str] = {}
    module_orders: dict[Any, int] = {}
    async for m in modules_cursor:
        module_titles[m["_id"]] = (m.get("title") or "").strip()
        module_orders[m["_id"]] = int(m.get("order") or 0)

    out: list[dict] = []
    if module_titles:
        cursor = db.topics.find({"course_id": cid})
        async for t in cursor:
            content = (t.get("content_md") or "").strip()
            if len(content) > _MAX_CHARS_PER_TOPIC:
                content = content[:_MAX_CHARS_PER_TOPIC].rsplit(" ", 1)[0] + "…"
            out.append({
                "module_title": module_titles.get(t.get("module_id"), ""),
                "topic_name": (t.get("topic_name") or "").strip(),
                "content": content,
                "key_takeaways": [
                    str(k).strip() for k in (t.get("key_takeaways") or []) if str(k).strip()
                ],
                "order": int(t.get("order") or 0),
                "_module_order": module_orders.get(t.get("module_id"), 0),
            })

    if out:
        out.sort(key=lambda r: (r["_module_order"], r["order"]))
        for r in out:
            r.pop("_module_order", None)
        return out

    # Legacy fallback: only topic names exist on the course doc.
    legacy: list[dict] = []
    for mod in course.get("modules") or []:
        m_title = (mod.get("title") or "").strip()
        for tname in (mod.get("topics") or []):
            tname = (tname or "").strip()
            if not tname:
                continue
            legacy.append({
                "module_title": m_title,
                "topic_name": tname,
                "content": "",
                "key_takeaways": [],
                "order": 0,
            })
    return legacy


def _decide_count(topics: list[dict]) -> int:
    n = len(topics) * settings.QUESTIONS_PER_TOPIC
    return _clamp(n or settings.MIN_QUESTIONS, settings.MIN_QUESTIONS, settings.MAX_QUESTIONS)


def _shrink_grounding(topics: list[dict]) -> list[dict]:
    """Trim per-topic content so the total grounding stays under the cap."""
    total = 0
    out: list[dict] = []
    for t in topics:
        c = t.get("content") or ""
        budget_left = _MAX_TOTAL_GROUNDING_CHARS - total
        if budget_left <= 0:
            c = ""
        elif len(c) > budget_left:
            c = c[:budget_left].rsplit(" ", 1)[0] + "…"
        total += len(c)
        out.append({**t, "content": c})
    return out


async def _ask_agent_for_quiz(
    user_id: str,
    cert_code: str,
    course_name: str,
    topics: list[dict],
    count: int,
) -> list[dict]:
    """Call the orchestrator's assessment generate endpoint.

    We forward the course's real topic content (topic_name + content_md +
    key_takeaways) so the agent can ground questions on the actual learning
    material instead of relying on cert blueprint alone.
    """
    url = f"{settings.ORCHESTRATOR_URL}/assessments/generate"
    headers = {"X-User-Id": user_id, "X-Role": "learner"}

    grounded = _shrink_grounding(topics[:30])
    payload = {
        "cert_code": cert_code,
        "count": count,
        "course_name": course_name,
        "topics": [t["topic_name"] for t in grounded if t.get("topic_name")],
        # Rich grounding: each topic carries its module title, content excerpt,
        # and key takeaways — the orchestrator/agent uses this to author MCQs.
        "topic_content": [
            {
                "module": t.get("module_title") or "",
                "topic": t.get("topic_name") or "",
                "content": t.get("content") or "",
                "key_takeaways": t.get("key_takeaways") or [],
            }
            for t in grounded
            if t.get("topic_name")
        ],
    }
    total_chars = sum(len(tc.get("content") or "") for tc in payload["topic_content"])
    logger.info(
        "calling agent /assessments/generate cert=%s count=%d topics=%d grounding_chars=%d",
        cert_code, count, len(payload["topics"]), total_chars,
    )
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            r = await client.post(url, json=payload, headers=headers)
            if r.status_code >= 400:
                logger.warning(
                    "agent /assessments/generate -> %s body=%s",
                    r.status_code, r.text[:500],
                )
                return []
            data = r.json() or {}
            output = data.get("output") or data
            if isinstance(output, dict):
                qs = output.get("questions") or output.get("data") or []
            elif isinstance(output, list):
                qs = output
            else:
                qs = []
            qs_list = [q for q in qs if isinstance(q, dict)]
            logger.info(
                "agent returned %d question(s) (output keys=%s)",
                len(qs_list),
                list(output.keys()) if isinstance(output, dict) else type(output).__name__,
            )
            return qs_list
    except Exception as exc:  # noqa: BLE001
        logger.error("agent quiz call failed: %s", exc)
        return []


def _normalize_question(q: dict, index: int, fallback_topic: str) -> dict | None:
    """Coerce an agent question into our canonical shape.

    Canonical: {index, question, options[4], correct_index, topic, explanation?}
    Returns None if the question is unsalvageable.
    """
    text = (q.get("question") or q.get("stem") or "").strip()
    raw_options = q.get("options") or q.get("choices") or []
    if not text or not isinstance(raw_options, list) or len(raw_options) < 2:
        return None

    # Strip leading "A. ", "B) ", "(C) " etc. that the agent may include.
    cleaned: list[str] = []
    for o in raw_options:
        s = str(o).strip()
        s = re.sub(r"^\s*[\(\[]?[A-Da-d][\)\.\]:\-]\s+", "", s)
        if s:
            cleaned.append(s)
    options = cleaned[:4]
    while len(options) < 4:
        options.append(f"Option {chr(ord('A') + len(options))}")

    # Resolve the correct index from any of the documented field names.
    correct: int | None = None
    for key in ("correct_index", "correct", "correct_answer", "answer", "correct_option"):
        if key not in q:
            continue
        ca = q[key]
        if isinstance(ca, int):
            correct = ca
            break
        if isinstance(ca, str):
            s = ca.strip()
            # Single letter "A".."D"?
            if len(s) == 1 and s.upper() in "ABCD":
                correct = "ABCD".index(s.upper())
                break
            # "A. text" / "(B) text" — extract the letter.
            m = re.match(r"^[\(\[]?([A-Da-d])[\)\.\]:\-]?\s*", s)
            if m:
                correct = "ABCD".index(m.group(1).upper())
                break
            # Otherwise, match the option text.
            for i, opt in enumerate(options):
                if opt.strip().lower() == s.lower():
                    correct = i
                    break
            if correct is not None:
                break
    if not isinstance(correct, int) or not 0 <= correct < 4:
        correct = 0

    return {
        "index": index,
        "question": text,
        "options": options,
        "correct_index": int(correct),
        "topic": (q.get("topic") or fallback_topic or "").strip(),
        "explanation": (q.get("explanation") or "").strip(),
    }


def _first_sentence(text: str, max_len: int = 160) -> str:
    """First sentence of a content_md blob, with length cap."""
    if not text:
        return ""
    cleaned = re.sub(r"\s+", " ", text).strip()
    cleaned = re.sub(r"^#+\s*[^\n.]+[.\n]\s*", "", cleaned)  # drop leading heading
    m = re.search(r".+?[.!?](?=\s|$)", cleaned)
    snippet = (m.group(0) if m else cleaned)[:max_len].strip()
    return snippet.rstrip(",;:")


def _topic_correct_phrase(topic: dict) -> str:
    """The grounded text used as the correct answer for a topic."""
    takeaways = topic.get("key_takeaways") or []
    if takeaways:
        return str(takeaways[0]).strip()
    return _first_sentence(topic.get("content") or "") or (topic.get("topic_name") or "this topic")


def _deterministic_fallback(
    course_name: str,
    topics: list[dict],
    needed: int,
    start_index: int,
) -> list[dict]:
    """Last-resort questions if the agent failed. Stems and options are
    pulled from the topic's real `key_takeaways` / `content_md` so even the
    fallback output is grounded in the course material — not placeholder
    text. The fallback only fires when the agent under-produces; under
    normal conditions the agent's MCQs replace these entirely.
    """
    out: list[dict] = []
    grounded = [t for t in (topics or []) if t.get("topic_name")]
    if not grounded:
        grounded = [{
            "module_title": course_name or "General",
            "topic_name": course_name or "General",
            "key_takeaways": [],
            "content": "",
        }]

    correct_phrases = [_topic_correct_phrase(t) for t in grounded]

    for i in range(needed):
        topic = grounded[i % len(grounded)]
        tname = topic.get("topic_name") or course_name or "this topic"
        correct = correct_phrases[i % len(correct_phrases)]
        # Distractors: pull from OTHER topics' grounded phrases so they
        # are plausibly wrong (related to the same course) rather than
        # obvious filler. Fall back to a paraphrased generic if we only
        # have one topic.
        distractor_pool = [p for j, p in enumerate(correct_phrases)
                           if j != (i % len(correct_phrases)) and p and p != correct]
        random.shuffle(distractor_pool)
        distractors = distractor_pool[:3]
        while len(distractors) < 3:
            distractors.append(
                f"A misconception about {tname.lower()} that's not supported by the course material."
            )

        opts = [correct, *distractors]
        random.shuffle(opts)
        correct_idx = opts.index(correct)
        out.append({
            "index": start_index + i,
            "question": f"Which statement is most consistent with what the course teaches about {tname}?",
            "options": opts,
            "correct_index": correct_idx,
            "topic": tname,
            "explanation": f"Anchored to the course key takeaway: \"{correct}\"",
        })
    return out


async def generate_and_persist(
    schedule_id: str,
    user_id: str,
    course_id: str,
) -> tuple[int, dict]:
    """Generate questions for a schedule and persist them.

    Returns (question_count, summary_meta) on success. Raises on
    unrecoverable failure (e.g. course not found) so the caller can mark the
    schedule as failed.
    """
    db = get_db()
    course = await _load_course(course_id)
    if not course:
        raise ValueError(f"course {course_id} not found")

    course_name = course.get("course_name") or "Course"
    cert = (course.get("certification") or {})
    cert_code = (cert.get("cert_code") or "").strip()

    topics = await _load_grounded_topics(course_id, course)
    target_count = _decide_count(topics)
    logger.info(
        "loaded %d grounded topic(s) for course=%s (with content_md: %d)",
        len(topics),
        course_name,
        sum(1 for t in topics if t.get("content")),
    )

    raw = await _ask_agent_for_quiz(user_id, cert_code, course_name, topics, target_count)

    questions: list[dict] = []
    topic_names = [t["topic_name"] for t in topics] or [""]
    for i, q in enumerate(raw):
        norm = _normalize_question(q, len(questions), topic_names[i % len(topic_names)])
        if norm is not None:
            questions.append(norm)
        if len(questions) >= target_count:
            break

    if len(questions) < settings.MIN_QUESTIONS:
        needed = settings.MIN_QUESTIONS - len(questions)
        logger.warning(
            "agent returned only %d valid questions (raw=%d, target=%d). "
            "Topping up with %d deterministic fallback question(s) for course=%s cert=%s.",
            len(questions), len(raw), target_count, needed, course_name, cert_code,
        )
        questions.extend(_deterministic_fallback(course_name, topics, needed, len(questions)))

    # Persist (one document per schedule, embedded list)
    schedule_oid = ObjectId(schedule_id)
    await db.assessment_questions.update_one(
        {"schedule_id": schedule_oid},
        {"$set": {
            "schedule_id": schedule_oid,
            "user_id": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id,
            "course_id": ObjectId(course_id),
            "course_name": course_name,
            "cert_code": cert_code,
            "questions": questions,
        }},
        upsert=True,
    )

    summary = {
        "course_name": course_name,
        "cert_code": cert_code,
        "question_count": len(questions),
        "duration_minutes": len(questions),  # 1 minute per question
    }
    return len(questions), summary
