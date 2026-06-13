"""
Assessment Agent.

Three modes — generate practice questions, evaluate answers, and emit a
readiness report. Each mode owns its `user_query` template and the JSON
contract it asks the specialist to put inside `completion`.

The new envelope protocol carries the prompt as natural language inside
`user_query`; caller-supplied context (course content, answer payloads,
target cert) is embedded into that prose. Format steering is handled by
the `format_directive` field on the envelope (set to "json" by
``BaseA2AAgent.run_raw_full`` → ``orchestrator.process_raw``).

All three modes return the full pipeline result dict (including the
``trace`` of every envelope exchanged) so the caller can cache both the
parsed completion and the diagnostic envelope journey.
"""

from __future__ import annotations

import json

from app.agents.base_a2a_agent import BaseA2AAgent


class AssessmentAgent(BaseA2AAgent):
    AGENT_NAME = "assessment-agent"
    ROUTE_KEY = "assessment"

    async def generate_quiz(
        self,
        user_id: str,
        role: str = "learner",
        cert_code: str = "",
        count: int = 5,
        course_name: str = "",
        topics: list[str] | None = None,
        topic_content: list[dict] | None = None,
    ) -> dict:
        """Generate `count` grounded practice questions for `cert_code`.

        ``course_name``, ``topics`` and ``topic_content`` are embedded into
        ``user_query`` so the assessment specialist anchors its questions to
        the exact material the learner studied (content + key takeaways)
        rather than the generic cert blueprint.
        """
        cert_clause = f" for {cert_code}" if cert_code else ""
        topics = [t.strip() for t in (topics or []) if str(t).strip()]
        topic_content = topic_content or []

        # Per-topic grounding section the agent can quote from.
        if topic_content:
            blocks: list[str] = []
            for tc in topic_content:
                tname = (tc.get("topic") or "").strip()
                if not tname:
                    continue
                module = (tc.get("module") or "").strip()
                content = (tc.get("content") or "").strip()
                takeaways = [
                    str(k).strip()
                    for k in (tc.get("key_takeaways") or [])
                    if str(k).strip()
                ]
                header = f"### Topic: {tname}"
                if module:
                    header += f"  (module: {module})"
                parts = [header]
                if takeaways:
                    parts.append("Key takeaways:")
                    parts.extend(f"- {k}" for k in takeaways)
                if content:
                    parts.append("Content:")
                    parts.append(content)
                blocks.append("\n".join(parts))
            topic_block = (
                "\n\n".join(blocks)
                if blocks
                else "(no per-topic content available)"
            )
        else:
            topic_lines = (
                "\n".join(f"- {t}" for t in topics)
                if topics
                else "- (use full cert_code blueprint)"
            )
            topic_block = f"topics_to_cover:\n{topic_lines}"

        prompt = (
            f"mode: generate\n"
            f"cert_code: {cert_code or 'unknown'}\n"
            f"course_name: {course_name or '(unspecified)'}\n"
            f"target_question_count: {count}\n\n"
            "course_topic_content:\n"
            f"{topic_block}\n\n"
            f"Generate {count} grounded multiple-choice practice questions"
            f"{cert_clause}. The `course_topic_content` block above is the "
            "authoritative source for this quiz — questions, the correct "
            "option, every distractor, and every explanation MUST be "
            "traceable to a specific phrase in that block (Content prose or "
            "Key takeaways). Do not write questions about Azure features "
            "the supplied content does not cover. Spread coverage across "
            "the listed topics (at least one question per topic when "
            "possible). You may also call kb-certification-guides for "
            "additional citations.\n\n"
            "Quality bar (any question that fails ANY of these must be "
            "regenerated before you respond):\n"
            "- Stem must name the specific Azure concept being tested "
            "(e.g., 'Which Azure service provides…', 'In RBAC, what "
            "happens when…'). Generic stems like 'Which statement best "
            "describes <topic>?' are FORBIDDEN.\n"
            "- The correct answer must paraphrase or quote a Key "
            "takeaway / Content sentence from that topic.\n"
            "- Distractors must be plausible Azure misconceptions a "
            "learner might hold — never use placeholder text like "
            "'<topic> core concept', 'Unrelated topic for <course>', "
            "'Deprecated approach to <topic>', or 'None of the above' as "
            "the correct answer.\n"
            "- Explanation must cite a specific Key takeaway or Content "
            "sentence (one short line is enough).\n\n"
            "Your `completion` MUST be a JSON object matching the "
            "assessment-agent generate schema: "
            "{cert_code, questions:[{id, topic, difficulty, question, "
            "options[4], correct, explanation}]}. Each `options` entry is "
            "plain answer text WITHOUT a leading 'A. '/'B. ' prefix. "
            "`correct` is the 0-based index of the correct option (an "
            "integer). Set `topic` to the exact topic name from "
            "course_topic_content that the question targets."
        )
        return await self.run_raw_full(prompt, user_id=user_id, role=role)

    async def evaluate_quiz(
        self,
        user_id: str,
        role: str = "learner",
        cert_code: str = "",
        answers: list | None = None,
    ) -> dict:
        """Score a set of submitted answers and return per-topic breakdown."""
        cert_clause = f" for {cert_code}" if cert_code else ""
        answers_json = json.dumps(answers or [], ensure_ascii=False)
        prompt = (
            f"mode: evaluate\n"
            f"cert_code: {cert_code or '(unspecified)'}\n"
            f"answers: {answers_json}\n\n"
            f"Score these answers{cert_clause}. Your `completion` MUST be a "
            "JSON object matching the evaluate schema: "
            "score_pct, passed, pass_threshold, per_topic[], weak_topics[], "
            "feedback, next_action."
        )
        return await self.run_raw_full(prompt, user_id=user_id, role=role)

    async def get_readiness(
        self,
        user_id: str,
        role: str = "learner",
        cert_code: str = "",
    ) -> dict:
        """Readiness report for sitting the named exam."""
        cert = cert_code or "next"
        prompt = (
            f"mode: readiness\n"
            f"cert_code: {cert}\n\n"
            f"Am I ready to sit for the {cert} exam? Use my prior assessment "
            "scores, course completion, and KB-defined pass thresholds. "
            "Your `completion` MUST be a JSON object: ready, confidence, "
            "rationale, gaps[], recommended_next_step."
        )
        return await self.run_raw_full(prompt, user_id=user_id, role=role)


assessment_agent = AssessmentAgent()
