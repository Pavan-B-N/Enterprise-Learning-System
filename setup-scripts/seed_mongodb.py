"""
Seed the Enterprise Learning System MongoDB database from the synthetic
data files under ``synthetic-data/collections-synthetic-data/``.

The JSON files are MongoDB Extended JSON (produced by
``generate_synthetic_data.py``). Loading via ``bson.json_util.loads``
converts ``$oid`` / ``$date`` directly into ``ObjectId`` / ``datetime`` —
no manual reference resolution needed; the generator already wrote real
ObjectIds everywhere.

This script:
  1. Drops the target database.
  2. Inserts every collection.
  3. Creates the indexes specified in ``backend/schemas.md``.

Usage:
    python setup-scripts/seed_mongodb.py

Requires:
    pip install pymongo python-dotenv
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import bcrypt
from bson import json_util
from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import ConnectionFailure


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

MONGO_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("MONGODB_DATABASE", "enterprise_learning")
DATA_DIR = PROJECT_ROOT / "synthetic-data" / "collections-synthetic-data"


# Insertion order — chosen to satisfy any human reading order, but the
# generator emits real ObjectIds so there is no actual write-order
# dependency.
COLLECTION_ORDER = [
    "job_levels",
    "skills",
    "users",
    "user_credentials",
    "work_signals",
    "job_roles",
    "courses",
    "modules",
    "topics",
    "course_progress",
    "assessment_schedules",
    "assessment_questions",
    "assessment_results",
    "certifications",
    "chat_conversations",
    "chat_messages",
    "notifications",
    "knowledge_sources",
    "learning_curator_insights",
    "engagement_agent_insights",
    "assessment_agent_insights",
    "study_plan_generator_insights",
    "manager_insights_agent_insights",
]


def load_collection_payload(name: str) -> list[dict[str, Any]]:
    """Load the ``data`` array out of an extended-JSON collection file."""
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return []
    payload = json_util.loads(path.read_text(encoding="utf-8"))
    return payload.get("data", [])


def hash_credential_passwords(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Bcrypt-hash plaintext ``password`` fields into ``password_hash``.

    The synthetic ``user_credentials.json`` file ships plaintext passwords so
    the demo creds are auditable. The plaintext is hashed here at insert time
    and dropped from the document — it is NEVER written to MongoDB.
    """
    out: list[dict[str, Any]] = []
    for doc in docs:
        new = dict(doc)
        plaintext = new.pop("password", None)
        if plaintext is not None:
            new["password_hash"] = bcrypt.hashpw(
                plaintext.encode("utf-8"), bcrypt.gensalt(rounds=12)
            ).decode("utf-8")
        out.append(new)
    return out


# ─── Index creation ──────────────────────────────────────────────────────────

def create_indexes(db) -> None:
    """Create the indexes documented in ``backend/schemas.md``."""

    db.job_levels.create_index([("level_id", ASCENDING)], unique=True)

    db.skills.create_index([("slug", ASCENDING)], unique=True)
    db.skills.create_index([("name", ASCENDING)])

    db.courses.create_index([("course_name", ASCENDING)], unique=True)

    db.course_progress.create_index([("user_id", ASCENDING), ("course_id", ASCENDING)], unique=True)
    db.course_progress.create_index([("user_id", ASCENDING), ("status", ASCENDING)])
    db.course_progress.create_index([("user_id", ASCENDING), ("last_activity", DESCENDING)])
    db.course_progress.create_index(
        [("user_id", ASCENDING), ("completed_at", DESCENDING)],
        partialFilterExpression={"status": "completed"},
    )

    db.modules.create_index([("slug", ASCENDING)], unique=True)
    db.modules.create_index([("title", ASCENDING)])

    db.topics.create_index([("slug", ASCENDING)], unique=True)
    db.topics.create_index([("topic_name", ASCENDING)])

    db.job_roles.create_index([("role_name", ASCENDING)], unique=True)
    db.job_roles.create_index([("level", ASCENDING)])

    db.users.create_index([("email", ASCENDING)], unique=True)
    db.users.create_index([("roles", ASCENDING)])
    db.users.create_index([("reports_to", ASCENDING)])
    db.users.create_index([("job_role", ASCENDING)])

    db.user_credentials.create_index([("user_id", ASCENDING)], unique=True)

    db.work_signals.create_index([("user_id", ASCENDING)], unique=True)

    db.assessment_schedules.create_index(
        [("user_id", ASCENDING), ("course_id", ASCENDING), ("attempt_number", ASCENDING)],
        unique=True,
    )
    db.assessment_schedules.create_index([("user_id", ASCENDING), ("submitted_at", DESCENDING)])
    db.assessment_schedules.create_index([("status", ASCENDING), ("scheduled_at", ASCENDING)])
    db.assessment_schedules.create_index(
        [("user_id", ASCENDING)],
        unique=True,
        partialFilterExpression={
            "status": {"$in": ["pending", "generating", "ready", "in_progress"]}
        },
        name="one_active_schedule_per_user",
    )

    db.assessment_questions.create_index([("schedule_id", ASCENDING)], unique=True)
    db.assessment_questions.create_index([("user_id", ASCENDING), ("generated_at", DESCENDING)])

    db.assessment_results.create_index([("schedule_id", ASCENDING)], unique=True)
    db.assessment_results.create_index(
        [("user_id", ASCENDING), ("course_id", ASCENDING), ("submitted_at", DESCENDING)]
    )

    db.certifications.create_index([("user_id", ASCENDING), ("course_id", ASCENDING), ("issued_at", DESCENDING)])
    db.certifications.create_index([("user_id", ASCENDING), ("is_current", ASCENDING)])
    db.certifications.create_index([("assessment_result_id", ASCENDING)], unique=True)

    db.chat_conversations.create_index([("user_id", ASCENDING), ("last_message_at", DESCENDING)])

    db.chat_messages.create_index([("conversation_id", ASCENDING), ("seq", ASCENDING)], unique=True)
    db.chat_messages.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])

    db.notifications.create_index(
        [("user_id", ASCENDING), ("read", ASCENDING), ("created_at", DESCENDING)]
    )
    db.notifications.create_index([("user_id", ASCENDING), ("dedupe_key", ASCENDING)], unique=True)

    db.knowledge_sources.create_index([("doc_id", ASCENDING)], unique=True)
    db.knowledge_sources.create_index([("source_type", ASCENDING), ("indexed_at", DESCENDING)])
    db.knowledge_sources.create_index([("related_certs", ASCENDING)])

    for coll in [
        "learning_curator_insights",
        "engagement_agent_insights",
        "assessment_agent_insights",
        "study_plan_generator_insights",
    ]:
        db[coll].create_index([("user_id", ASCENDING)], unique=True)
        db[coll].create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)

    db.manager_insights_agent_insights.create_index([("manager_id", ASCENDING)], unique=True)
    db.manager_insights_agent_insights.create_index(
        [("expires_at", ASCENDING)], expireAfterSeconds=0
    )

    db.agent_cache.create_index(
        [("user_id", ASCENDING), ("agent", ASCENDING)], unique=True
    )


# ─── Default agent_cache seeding ─────────────────────────────────────────────

def seed_agent_cache(db) -> int:
    """Pre-populate the `agent_cache` collection with plausible curator,
    planner, and engagement outputs for every learner so the dashboard
    shows agent recommendations on first load instead of empty CTAs.

    The schemas mirror exactly what the orchestrator endpoints would cache
    after a successful agent call, so the frontend renders them with no
    code changes.
    """
    from datetime import datetime, timezone

    now_iso = datetime.now(timezone.utc).isoformat() + "Z"

    # Pre-canned curator recommendation sets, planner study plans, and
    # engagement nudges. Indexed and assigned round-robin per learner.
    CURATOR_VARIANTS = [
        [
            {"title": "AZ-104: Azure Administrator", "cert_code": "AZ-104", "priority": "Highest",
             "reason": "Your role requires hands-on Azure administration; AZ-104 builds the core infrastructure skills you'll use daily."},
            {"title": "AZ-500: Azure Security Technologies", "cert_code": "AZ-500", "priority": "High",
             "reason": "Pairs naturally with AZ-104 — security is a top hiring filter and you scored 78% on the security module."},
            {"title": "AZ-305: Azure Solutions Architect", "cert_code": "AZ-305", "priority": "Medium",
             "reason": "A logical 6-month next step once AZ-104 is complete; opens architect-track roles."},
        ],
        [
            {"title": "AI-102: Azure AI Engineer", "cert_code": "AI-102", "priority": "Highest",
             "reason": "Your team's roadmap calls for embedded ML; AI-102 covers the Cognitive Services and Azure OpenAI patterns you'll need."},
            {"title": "DP-203: Azure Data Engineering", "cert_code": "DP-203", "priority": "High",
             "reason": "Strong complement to AI-102 — most production AI workloads need solid data pipelines first."},
            {"title": "AZ-204: Developing Azure Solutions", "cert_code": "AZ-204", "priority": "Medium",
             "reason": "Fills the gap between data and AI services with general developer fundamentals."},
        ],
        [
            {"title": "AZ-204: Developing Azure Solutions", "cert_code": "AZ-204", "priority": "Highest",
             "reason": "Recommended for cloud developers; covers the App Service, Functions, and Cosmos DB stack you ship to."},
            {"title": "AZ-400: Azure DevOps Solutions", "cert_code": "AZ-400", "priority": "High",
             "reason": "Builds the CI/CD and IaC skills that complete the developer-to-DevOps progression."},
            {"title": "AZ-900: Azure Fundamentals", "cert_code": "AZ-900", "priority": "Medium",
             "reason": "Quick refresher on cloud economics and governance — useful context for AZ-400 conversations."},
        ],
        [
            {"title": "AZ-700: Azure Network Engineer", "cert_code": "AZ-700", "priority": "Highest",
             "reason": "You're on the network platform team; AZ-700 is the only cert that maps directly to your daily VNet, ExpressRoute, and Firewall work."},
            {"title": "AZ-500: Azure Security Technologies", "cert_code": "AZ-500", "priority": "High",
             "reason": "Network security is half of AZ-700's exam blueprint — earning AZ-500 lifts your readiness materially."},
            {"title": "AZ-104: Azure Administrator", "cert_code": "AZ-104", "priority": "Medium",
             "reason": "Strengthens the core IaaS foundation that AZ-700 assumes."},
        ],
        [
            {"title": "DP-900: Azure Data Fundamentals", "cert_code": "DP-900", "priority": "Highest",
             "reason": "Right entry point for your data-leaning role; gets you fluent in relational, NoSQL, and analytics workloads on Azure."},
            {"title": "DP-203: Azure Data Engineering", "cert_code": "DP-203", "priority": "High",
             "reason": "The natural progression after DP-900 and a clear differentiator for data-engineering interviews."},
            {"title": "AI-102: Azure AI Engineer", "cert_code": "AI-102", "priority": "Medium",
             "reason": "Pairs well with the data track — many of your team's pipelines feed Cognitive Services."},
        ],
    ]

    PLANNER_VARIANTS = [
        {
            "weekly_plan": [
                {"week": 1, "tasks": [
                    {"module": "Identity & Governance", "expected_hours": 3},
                    {"module": "Storage Accounts", "expected_hours": 2},
                ], "rationale": "Foundational modules first — these unlock the rest of the content."},
                {"week": 2, "tasks": [
                    {"module": "Virtual Networks", "expected_hours": 3},
                    {"module": "Virtual Machines", "expected_hours": 3},
                ], "rationale": "Core compute + networking before tackling monitoring."},
                {"week": 3, "tasks": [
                    {"module": "Monitoring & Backup", "expected_hours": 2},
                    {"module": "Practice Exam", "expected_hours": 2},
                ], "rationale": "Wrap up content and validate readiness."},
            ],
            "milestones": ["Complete labs by week 2", "Hit 75%+ on practice exam"],
            "weekly_hours": 5,
            "cert_code": "AZ-104",
            "weeks_to_exam_ready": 4,
            "estimated_ready_date": "2026-07-08",
            "capacity_flag": "balanced",
            "notes": "Plan respects your 14:00–16:00 focus block; no conflicts with weekly stand-ups.",
        },
        {
            "weekly_plan": [
                {"week": 1, "tasks": [
                    {"module": "Cognitive Services Overview", "expected_hours": 2},
                    {"module": "Computer Vision", "expected_hours": 3},
                ], "rationale": "Start with the highest-weight exam objective."},
                {"week": 2, "tasks": [
                    {"module": "Natural Language Processing", "expected_hours": 3},
                    {"module": "Azure OpenAI", "expected_hours": 2},
                ], "rationale": "NLP + generative cover ~40% of the exam."},
                {"week": 3, "tasks": [
                    {"module": "Knowledge Mining", "expected_hours": 2},
                    {"module": "Practice Lab", "expected_hours": 3},
                ], "rationale": "Capstone the path with end-to-end labs."},
            ],
            "milestones": ["Build one demo per service", "Score 80%+ on the AI-102 practice test"],
            "weekly_hours": 5,
            "cert_code": "AI-102",
            "weeks_to_exam_ready": 5,
            "estimated_ready_date": "2026-07-15",
            "capacity_flag": "balanced",
            "notes": "Two of your meeting-heavy weeks are pre-empted; sessions front-loaded into Mon/Tue.",
        },
        {
            "weekly_plan": [
                {"week": 1, "tasks": [
                    {"module": "App Service & Functions", "expected_hours": 3},
                    {"module": "Cosmos DB", "expected_hours": 2},
                ], "rationale": "Highest-weight exam areas first."},
                {"week": 2, "tasks": [
                    {"module": "Storage & Queues", "expected_hours": 2},
                    {"module": "Authentication & Security", "expected_hours": 3},
                ], "rationale": "Security carries 25% of the AZ-204 score."},
                {"week": 3, "tasks": [
                    {"module": "Event Grid & Service Bus", "expected_hours": 2},
                    {"module": "Practice Exam", "expected_hours": 2},
                ], "rationale": "Integration patterns + dress rehearsal."},
            ],
            "milestones": ["Ship a sample serverless app", "Pass two timed practice exams"],
            "weekly_hours": 4,
            "cert_code": "AZ-204",
            "weeks_to_exam_ready": 6,
            "estimated_ready_date": "2026-07-22",
            "capacity_flag": "light",
            "notes": "You have unused capacity Friday afternoons — consider stretching to 6 hr/week.",
        },
        {
            "weekly_plan": [
                {"week": 1, "tasks": [
                    {"module": "VNet Design", "expected_hours": 3},
                    {"module": "Hybrid Connectivity", "expected_hours": 3},
                ], "rationale": "Network design topics dominate the exam blueprint."},
                {"week": 2, "tasks": [
                    {"module": "Application Delivery", "expected_hours": 3},
                    {"module": "Network Security", "expected_hours": 3},
                ], "rationale": "Front Door, App Gateway, and NSGs together."},
                {"week": 3, "tasks": [
                    {"module": "Monitoring & Troubleshooting", "expected_hours": 2},
                    {"module": "Practice Exam", "expected_hours": 2},
                ], "rationale": "Operational scenarios + dry run."},
            ],
            "milestones": ["Lab: deploy a hub-and-spoke topology", "Score 80% on practice"],
            "weekly_hours": 6,
            "cert_code": "AZ-700",
            "weeks_to_exam_ready": 4,
            "estimated_ready_date": "2026-07-08",
            "capacity_flag": "balanced",
            "notes": "Heavy on labs — plan reserves your 09:00 morning blocks for hands-on work.",
        },
        {
            "weekly_plan": [
                {"week": 1, "tasks": [
                    {"module": "Core Data Concepts", "expected_hours": 2},
                    {"module": "Relational Data on Azure", "expected_hours": 2},
                ], "rationale": "Build vocabulary before going deep."},
                {"week": 2, "tasks": [
                    {"module": "Non-relational Data", "expected_hours": 2},
                    {"module": "Analytics Workloads", "expected_hours": 2},
                ], "rationale": "Cover the breadth of DP-900 quickly."},
                {"week": 3, "tasks": [
                    {"module": "Practice Exam", "expected_hours": 2},
                ], "rationale": "DP-900 is short; a single review week is enough."},
            ],
            "milestones": ["Pass DP-900 practice with 85%+"],
            "weekly_hours": 4,
            "cert_code": "DP-900",
            "weeks_to_exam_ready": 3,
            "estimated_ready_date": "2026-07-01",
            "capacity_flag": "light",
            "notes": "Quickest cert in your roadmap — momentum builder before DP-203.",
        },
    ]

    ENGAGEMENT_VARIANTS = [
        {
            "state": "on_track",
            "headline": "Nice rhythm — 6 active days this week.",
            "body": "You logged 6.5 hours across three sessions and your AZ-104 progress is up 12% week-over-week. Your 14:00–16:00 focus block is doing its job.",
            "suggested_action": {"label": "Resume AZ-104 Module 4", "type": "resume_course", "target": "AZ-104"},
            "best_nudge_window": "Today 14:00 — your usual afternoon focus block",
            "tone": "supportive",
        },
        {
            "state": "momentum",
            "headline": "9-day streak — keep the run going.",
            "body": "You've shown up 9 days running and just cleared the AI-102 Computer Vision module. Practice scores are trending up; you're within striking distance of exam-ready.",
            "suggested_action": {"label": "Take AI-102 practice exam", "type": "take_practice", "target": "AI-102"},
            "best_nudge_window": "Tomorrow 09:00 — your morning peak",
            "tone": "celebratory",
        },
        {
            "state": "comeback",
            "headline": "Welcome back — your AZ-204 module 3 is waiting.",
            "body": "You've been away for 5 days; no judgement. Your last session left AZ-204 module 3 at 60% complete — picking that up first will rebuild momentum quickly.",
            "suggested_action": {"label": "Resume AZ-204 Module 3", "type": "resume_course", "target": "AZ-204"},
            "best_nudge_window": "Today 15:00 — light meeting load",
            "tone": "supportive",
        },
        {
            "state": "peaking",
            "headline": "You're exam-ready — let's lock in a date.",
            "body": "Three back-to-back practice scores above 82% and a 7-day streak. Past learners with this profile pass on first attempt 91% of the time. Schedule the AZ-700 exam this week.",
            "suggested_action": {"label": "Schedule AZ-700 exam", "type": "schedule_exam", "target": "AZ-700"},
            "best_nudge_window": "Today end-of-day — quick admin task",
            "tone": "celebratory",
        },
        {
            "state": "overloaded",
            "headline": "Heavy meeting week — let's lighten the plan.",
            "body": "You have 28 meeting hours this week and missed two study sessions. Rather than push, the planner can shift this week's modules to next week without affecting your exam date.",
            "suggested_action": {"label": "Shift this week's plan", "type": "adjust_plan", "target": "DP-203"},
            "best_nudge_window": "Today 17:00 — wind-down review",
            "tone": "supportive",
        },
    ]

    # ── Sources ─────────────────────────────────────────────────────────────
    # Per-cert KB grounding evidence for curator + planner. Mirrors what the
    # real Foundry IQ `kb-certification-guides` retrieval would surface.
    CERT_SOURCES: dict[str, list[dict[str, Any]]] = {
        "AZ-104": [
            {"title": "AZ-104: Microsoft Azure Administrator — Exam Skills Outline", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-104/",
             "snippet": "Manage Azure identities, governance, storage, compute, and virtual networks."},
            {"title": "AZ-104 study guide (Microsoft Learn)", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-administrator/",
             "snippet": "Recommended preparation: 30–40 hours across five domain areas."},
            {"title": "Job-role mapping: Cloud Operations Engineer → AZ-104", "kind": "role",
             "snippet": "AZ-104 is the primary required cert for your role."},
        ],
        "AZ-500": [
            {"title": "AZ-500: Microsoft Azure Security Engineer — Exam Skills Outline", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-500/",
             "snippet": "Identity and access, platform protection, security operations, data and applications."},
            {"title": "Your AZ-104 Security module assessment (78%)", "kind": "assessment",
             "snippet": "Above the 70% baseline — strong foundation for AZ-500."},
        ],
        "AZ-305": [
            {"title": "AZ-305: Designing Microsoft Azure Infrastructure Solutions", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-305/",
             "snippet": "Architect-track exam — recommends AZ-104 as prerequisite knowledge."},
        ],
        "AZ-204": [
            {"title": "AZ-204: Developing Solutions for Microsoft Azure", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-204/",
             "snippet": "App Service, Functions, Cosmos DB, storage, security, and integration patterns."},
            {"title": "Job-role mapping: Cloud Application Developer → AZ-204", "kind": "role"},
        ],
        "AZ-400": [
            {"title": "AZ-400: Designing and Implementing Microsoft DevOps Solutions", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-400/",
             "snippet": "Source control, CI/CD, IaC, monitoring, and secure DevOps practices."},
        ],
        "AZ-700": [
            {"title": "AZ-700: Designing and Implementing Microsoft Azure Networking Solutions", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-700/",
             "snippet": "Hybrid networking, core networking, application delivery, and private access."},
            {"title": "Job-role mapping: Network Platform Engineer → AZ-700", "kind": "role"},
        ],
        "AZ-900": [
            {"title": "AZ-900: Microsoft Azure Fundamentals", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-900/",
             "snippet": "Cloud concepts, Azure architecture, services, governance, and pricing."},
        ],
        "AI-102": [
            {"title": "AI-102: Designing and Implementing a Microsoft Azure AI Solution", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/ai-102/",
             "snippet": "Cognitive Services, Azure OpenAI, knowledge mining, and conversational AI."},
            {"title": "Team roadmap: embedded ML capabilities Q3", "kind": "role",
             "snippet": "Your team's roadmap calls for AI integration this quarter."},
        ],
        "DP-900": [
            {"title": "DP-900: Microsoft Azure Data Fundamentals", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/dp-900/",
             "snippet": "Core data concepts, relational, non-relational, analytics workloads."},
        ],
        "DP-203": [
            {"title": "DP-203: Data Engineering on Microsoft Azure", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/exams/dp-203/",
             "snippet": "Design and implement data storage, processing, and security on Azure."},
        ],
    }

    PLANNER_SOURCES: dict[str, list[dict[str, Any]]] = {
        "AZ-104": [
            {"title": "AZ-104 recommended preparation: 30–40 hours", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-administrator/"},
            {"title": "Module weights: Compute 25% / Networking 20% / Identity 15%", "kind": "kb",
             "kb": "kb-certification-guides"},
            {"title": "Your work signals: 18h focus / 12h meetings per week", "kind": "signal"},
            {"title": "Preferred learning slot: 14:00–16:00", "kind": "preference"},
        ],
        "AI-102": [
            {"title": "AI-102 recommended preparation: 25–30 hours", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-engineer/"},
            {"title": "Computer Vision + NLP carry ~40% of exam weight", "kind": "kb",
             "kb": "kb-certification-guides"},
            {"title": "Your work signals: meeting-heavy weeks 3–4", "kind": "signal"},
        ],
        "AZ-204": [
            {"title": "AZ-204 recommended preparation: 35 hours", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-developer/"},
            {"title": "Security carries 25% of AZ-204 score", "kind": "kb",
             "kb": "kb-certification-guides"},
            {"title": "Your unused capacity: Friday afternoons", "kind": "signal"},
        ],
        "AZ-700": [
            {"title": "AZ-700 recommended preparation: 30 hours", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-network-engineer-associate/"},
            {"title": "Hub-and-spoke topology lab (course material)", "kind": "kb",
             "kb": "kb-certification-guides"},
            {"title": "Preferred learning slot: 09:00 morning block", "kind": "preference"},
        ],
        "DP-900": [
            {"title": "DP-900 recommended preparation: 12–15 hours", "kind": "kb",
             "kb": "kb-certification-guides",
             "url": "https://learn.microsoft.com/en-us/credentials/certifications/azure-data-fundamentals/"},
            {"title": "Your work signals: light meeting week ahead", "kind": "signal"},
        ],
    }

    # Engagement sources are index-aligned with ENGAGEMENT_VARIANTS above.
    ENGAGEMENT_SOURCES = [
        # on_track
        [
            {"title": "current_streak_days: 6", "kind": "streak"},
            {"title": "weekly_progress_delta: +12%", "kind": "progress"},
            {"title": "preferred_learning_slot: 14:00–16:00", "kind": "signal"},
            {"title": "AZ-104 progress: 48% complete", "kind": "progress"},
        ],
        # momentum
        [
            {"title": "current_streak_days: 9", "kind": "streak"},
            {"title": "AI-102 Computer Vision module: completed", "kind": "progress"},
            {"title": "recent_assessment_scores: [78, 81, 84]", "kind": "assessment"},
        ],
        # comeback
        [
            {"title": "last_active_at: 5 days ago", "kind": "signal"},
            {"title": "AZ-204 module 3 progress: 60%", "kind": "progress"},
            {"title": "meeting_hours_this_week: 14 (light)", "kind": "signal"},
        ],
        # peaking
        [
            {"title": "recent_assessment_scores: [82, 85, 87]", "kind": "assessment"},
            {"title": "current_streak_days: 7", "kind": "streak"},
            {"title": "AZ-700 readiness model: 91% first-attempt pass cohort", "kind": "kb",
             "kb": "kb-certification-guides"},
        ],
        # overloaded
        [
            {"title": "meeting_hours_per_week: 28", "kind": "signal"},
            {"title": "missed_sessions_this_week: 2", "kind": "signal"},
            {"title": "DP-203 progress: 35% complete", "kind": "progress"},
        ],
    ]

    def _augment_curator(recs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Attach a sources array to each rec, derived from its cert_code."""
        out: list[dict[str, Any]] = []
        for rec in recs:
            new = dict(rec)
            code = new.get("cert_code")
            new["sources"] = list(CERT_SOURCES.get(code, []))
            out.append(new)
        return out

    def _augment_planner(plan: dict[str, Any]) -> dict[str, Any]:
        new = dict(plan)
        code = new.get("cert_code")
        new["sources"] = list(PLANNER_SOURCES.get(code, []))
        return new

    def _augment_engagement(idx: int, ev: dict[str, Any]) -> dict[str, Any]:
        new = dict(ev)
        new["sources"] = list(ENGAGEMENT_SOURCES[idx % len(ENGAGEMENT_SOURCES)])
        return new

    learners = list(db.users.find(
        {"roles": "learner", "is_active": {"$ne": False}},
        {"_id": 1},
    ))
    if not learners:
        return 0

    cache_docs: list[dict[str, Any]] = []
    for idx, u in enumerate(learners):
        uid = str(u["_id"])
        cv_idx = idx % len(CURATOR_VARIANTS)
        pv_idx = idx % len(PLANNER_VARIANTS)
        ev_idx = idx % len(ENGAGEMENT_VARIANTS)
        cache_docs.append({
            "user_id": uid,
            "agent": "curator",
            "output": _augment_curator(CURATOR_VARIANTS[cv_idx]),
            "cached_at": now_iso,
        })
        cache_docs.append({
            "user_id": uid,
            "agent": "planner",
            "output": _augment_planner(PLANNER_VARIANTS[pv_idx]),
            "cached_at": now_iso,
        })
        cache_docs.append({
            "user_id": uid,
            "agent": "engagement",
            "output": _augment_engagement(ev_idx, ENGAGEMENT_VARIANTS[ev_idx]),
            "cached_at": now_iso,
        })

    if cache_docs:
        db.agent_cache.insert_many(cache_docs, ordered=False)
    return len(cache_docs)


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    if not MONGO_URI:
        print("ERROR: MONGODB_URI is not set in .env", file=sys.stderr)
        sys.exit(1)

    safe_uri = MONGO_URI.split("@")[-1] if "@" in MONGO_URI else MONGO_URI
    print(f"Connecting to MongoDB: {safe_uri}")
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
    except ConnectionFailure:
        print("ERROR: Could not connect to MongoDB. Is it running?", file=sys.stderr)
        sys.exit(1)

    print(f"Database: {DB_NAME}")
    print("Dropping existing database...")
    client.drop_database(DB_NAME)
    db = client[DB_NAME]
    print("  ✓ Database dropped\n")

    print("Inserting collections from", DATA_DIR.relative_to(PROJECT_ROOT))

    # Cross-collection back-reference maps populated as we load each
    # collection. The synthetic data nests modules under courses
    # (`course.modules: [oid]`) and topics under modules
    # (`module.topics: [oid]`), but our admin/route code queries the
    # inverse direction (`db.modules.find({course_id: ...})` and
    # `db.topics.find({module_id: ...})`). So as we insert, we patch
    # back-refs onto each child doc.
    module_to_course: dict[Any, Any] = {}  # module _id -> course _id
    topic_to_module: dict[Any, Any] = {}   # topic  _id -> module _id

    total = 0
    for name in COLLECTION_ORDER:
        docs = load_collection_payload(name)
        if not docs:
            print(f"  · {name:<35} (no data file, skipped)")
            continue
        if name == "user_credentials":
            docs = hash_credential_passwords(docs)
        elif name == "courses":
            # Build module_to_course map and rewrite guidance path so the
            # admin course_service (which prefixes paths with the
            # admin-service `app/` directory) finds the .md files at
            # `app/local-storage/DOC-*.md`.
            for c in docs:
                for mod_oid in c.get("modules", []) or []:
                    module_to_course[mod_oid] = c["_id"]
                loc = c.get("guidance_doc_location") or ""
                if loc.startswith("course-guidance/doc-guidance/"):
                    c["guidance_doc_location"] = "local-storage/" + loc.rsplit("/", 1)[-1]
        elif name == "modules":
            # Stamp course_id onto each module and harvest topic_to_module.
            for m in docs:
                cid = module_to_course.get(m["_id"])
                if cid is not None:
                    m["course_id"] = cid
                for top_oid in m.get("topics", []) or []:
                    topic_to_module[top_oid] = m["_id"]
        elif name == "topics":
            # Stamp module_id + course_id onto each topic.
            for t in docs:
                mid = topic_to_module.get(t["_id"])
                if mid is not None:
                    t["module_id"] = mid
                    cid = module_to_course.get(mid)
                    if cid is not None:
                        t["course_id"] = cid
        db[name].insert_many(docs, ordered=False)
        print(f"  ✓ {name:<35} {len(docs):>4} docs")
        total += len(docs)

    print("\nCreating indexes...")
    create_indexes(db)
    print("  ✓ indexes created")

    print("\nSeeding default agent_cache for learners...")
    cache_count = seed_agent_cache(db)
    print(f"  ✓ agent_cache                       {cache_count:>4} docs")
    total += cache_count

    print(f"\nDone. {total} documents inserted into '{DB_NAME}'.")
    client.close()


if __name__ == "__main__":
    main()
