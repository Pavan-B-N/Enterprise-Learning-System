# Synthetic Data — Enterprise Learning System (ELS)

> **All data in this folder is synthetic.** No real customer data, employee
> data, or PII is included. The dataset is hand-authored or
> deterministically generated for the Microsoft Foundry hackathon to
> demonstrate the ELS multi-agent learning platform.

## What lives here

| Path | Contents |
| --- | --- |
| `collections-synthetic-data/` | 23 MongoDB collection seed files (extended JSON) — users, courses, modules, topics, assessments, certifications, agent insights, chat history, etc. |
| `course-guidance/doc-guidance/` | Markdown grounding docs (one per certification). Used as RAG context for the assessment & curator agents. |
| `course-guidance/policies/` | Markdown governance documents (training policy, escalation, accessibility, etc.) used by the engagement & manager-insights agents. |
| `system-prompts/` | System prompts for each agent (orchestrator, assessment, engagement, curator, manager-insights, study-plan-generator). |

## Provenance

- **Cert content** (topics, MCQs, doc-guidance) is paraphrased from
  publicly documented Azure / Microsoft 365 concepts (Microsoft Learn,
  certification skill outlines). No proprietary content is reproduced
  verbatim.
- **Names, emails, IDs** are fictitious. All `email` values use the
  `@els.dev` reserved-style domain.
- **Credentials** (`user_credentials.json`) all share a single bcrypt
  hash for demo convenience — **do not** import this file into any
  shared / production environment.

## Realistic spread

The dataset is tuned to give the demo a believable cross-section so the
agents have something to reason about:

- Strong learners: **Priya Sharma**, **Chen Wei**, **Yuki Tanaka** (≥90% avg)
- Borderline: **Marcus Johnson**, **Raj Patel**, **Emma Wilson** (65-80%)
- At-risk: **Fatima Ali**, **Omar Hassan**, **James Lee** on AI-102 (<60%)
- Onboarding (no completed attempts yet): **Sofia Garcia**

Manager-insights, assessment-insights, certifications, and per-topic
breakdowns are all derived from the same underlying assessment results,
so the agents will reach the same conclusions if they re-derive from
collections directly.

## Regenerating

The dataset is hand-curated and committed as the source of truth — there
is no regeneration script. Edit the JSON files in
[`collections-synthetic-data/`](collections-synthetic-data/) directly when
the schema changes or when new content is needed, and keep cross-collection
references (`_id`, `user_id`, `course_id`, `topic_id`, etc.) consistent
by hand.

If you change a topic's content or an MCQ, remember to also update the
matching entries in:
- `assessment_questions.json` (questions referencing that `topic_id`)
- `assessment_results.json` (per-topic breakdowns + scores)
- `assessment_schedules.json` (mirrored `score_percentage` / `passed`)
- `certifications.json` (only kept when the backing result passes)
- `assessment_agent_insights.json` and
  `manager_insights_agent_insights.json` (re-derived from results).

## Loading into MongoDB

See [`setup-scripts/seed_mongodb.py`](../setup-scripts/seed_mongodb.py)
for the full ingestion pipeline.
