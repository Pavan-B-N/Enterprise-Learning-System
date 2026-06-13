from app.db.mongo import get_db


class TelemetryService:
    """Provides system usage stats from MongoDB collections."""

    async def get_stats(self) -> dict:
        db = get_db()
        users_count = await db["users"].count_documents({})
        courses_count = await db["courses"].count_documents({})
        job_roles_count = await db["job_roles"].count_documents({})
        certifications_count = await db["certifications"].count_documents({})
        assessments_count = await db["assessments"].count_documents({})

        return {
            "users": users_count,
            "courses": courses_count,
            "job_roles": job_roles_count,
            "certifications": certifications_count,
            "assessments": assessments_count,
        }

    async def get_usage(self) -> dict:
        db = get_db()
        # Recent assessments (last 100)
        cursor = db["assessments"].find({}).sort("started_at", -1).limit(100)
        events = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            events.append(doc)

        return {
            "recent_assessments_count": len(events),
            "assessments": events,
        }
