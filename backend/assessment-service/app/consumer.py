"""Service Bus consumer for assessment-service.

Subscribes to queue `els-assessment-jobs` and handles subjects:
  - "assessment.scheduled"  -> generate questions, mark schedule ready, publish notification.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.config import settings
from app.db import get_db
from app.question_generator import generate_and_persist
from app.servicebus import ServiceBusConsumer, ServiceBusPublisher

logger = logging.getLogger(__name__)


# Single shared publisher instance for emitting notifications.
publisher = ServiceBusPublisher(
    settings.AZURE_SERVICE_BUS_CONNECTION_STRING,
    source="assessment-service",
)


async def _mark(schedule_id: str, status: str, extra: dict[str, Any] | None = None) -> None:
    db = get_db()
    update = {"status": status, "updated_at": datetime.now(timezone.utc)}
    if extra:
        update.update(extra)
    await db.assessment_schedules.update_one(
        {"_id": ObjectId(schedule_id)}, {"$set": update}
    )


async def _emit_notification(user_id: str, kind: str, title: str, body: str, metadata: dict) -> None:
    if not settings.AZURE_SERVICE_BUS_CONNECTION_STRING:
        logger.warning("SB connection string missing; skipping notification publish")
        return
    await publisher.publish(
        settings.SB_QUEUE_NOTIFICATIONS,
        subject="notification.create",
        data={
            "user_id": user_id,
            "type": kind,
            "title": title,
            "message": body,
            "metadata": metadata,
        },
    )


async def handle(subject: str, data: dict) -> None:
    if subject != "assessment.scheduled":
        logger.info("ignoring subject=%s", subject)
        return

    schedule_id = str(data.get("schedule_id") or "")
    user_id = str(data.get("user_id") or "")
    course_id = str(data.get("course_id") or "")
    if not (schedule_id and user_id and course_id):
        logger.error("invalid assessment.scheduled payload: %s", data)
        return

    # Idempotency: SB messages may be redelivered if the lock expires before
    # generation finishes. Skip if this schedule has already been processed.
    db = get_db()
    if not ObjectId.is_valid(schedule_id):
        logger.error("invalid schedule_id: %s", schedule_id)
        return
    existing = await db.assessment_schedules.find_one({"_id": ObjectId(schedule_id)})
    if not existing:
        logger.warning("schedule %s no longer exists; dropping job", schedule_id)
        return
    if existing.get("status") in ("ready", "in_progress", "completed", "expired", "failed"):
        logger.info(
            "schedule %s already in terminal/ready state (%s); skipping duplicate job",
            schedule_id, existing.get("status"),
        )
        return

    await _mark(schedule_id, "generating")
    try:
        count, summary = await generate_and_persist(schedule_id, user_id, course_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("generation failed for schedule=%s: %s", schedule_id, exc, exc_info=True)
        await _mark(schedule_id, "failed", {"error": str(exc)})
        await _emit_notification(
            user_id,
            kind="assessment_failed",
            title="Assessment scheduling failed",
            body=f"We couldn't prepare your assessment ({exc}). Please try scheduling again.",
            metadata={"schedule_id": schedule_id, "course_id": course_id},
        )
        return

    await _mark(
        schedule_id,
        "ready",
        {
            "question_count": count,
            "duration_minutes": summary["duration_minutes"],
            "course_name": summary["course_name"],
            "cert_code": summary["cert_code"],
            "ready_at": datetime.now(timezone.utc),
        },
    )

    await _emit_notification(
        user_id,
        kind="assessment_ready",
        title="Your assessment is ready",
        body=f"{summary['course_name']} \u2014 {count} questions \u00b7 {count} min. Tap to start.",
        metadata={
            "schedule_id": schedule_id,
            "course_id": course_id,
            "course_name": summary["course_name"],
            "cert_code": summary["cert_code"],
            "question_count": count,
            "duration_minutes": summary["duration_minutes"],
        },
    )


def make_consumer() -> ServiceBusConsumer:
    return ServiceBusConsumer(
        connection_string=settings.AZURE_SERVICE_BUS_CONNECTION_STRING,
        queue=settings.SB_QUEUE_ASSESSMENT_JOBS,
        handler=handle,
        max_concurrency=2,
    )
