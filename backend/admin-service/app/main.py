from contextlib import asynccontextmanager

from bson import ObjectId
from fastapi import FastAPI
from fastapi.encoders import ENCODERS_BY_TYPE

from app.config import settings
from app.db.mongo import close_client
from app.services import log_handler
from app.routes.user_routes import router as user_router
from app.routes.team_routes import router as team_router
from app.routes.telemetry_routes import router as telemetry_router
from app.routes.course_routes import router as course_router
from app.routes.role_routes import router as role_router
from app.routes.skill_routes import router as skill_router
from app.routes.topic_routes import router as topic_router
from app.routes.module_routes import router as module_router
from app.routes.dashboard_routes import router as dashboard_router
from app.routes.health import router as health_router
from app.telemetry import RAIDMiddleware, RequestLoggerMiddleware

# Teach FastAPI's jsonable_encoder how to handle bson.ObjectId so route
# handlers can return raw Mongo documents (e.g. audit fields like
# `created_by`/`updated_by`) without crashing the response serializer.
ENCODERS_BY_TYPE[ObjectId] = str


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure telemetry log indexes (TTL + service/level/raid).
    try:
        await log_handler.ensure_indexes()
    except Exception as exc:  # noqa: BLE001
        print(f"[admin-service] telemetry index init failed: {exc}")
    yield
    await close_client()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url=None,
    )

    app.add_middleware(RequestLoggerMiddleware)
    app.add_middleware(RAIDMiddleware)

    app.include_router(health_router)
    app.include_router(user_router)
    app.include_router(team_router)
    app.include_router(telemetry_router)
    app.include_router(course_router)
    app.include_router(role_router)
    app.include_router(skill_router)
    app.include_router(topic_router)
    app.include_router(module_router)
    app.include_router(dashboard_router)

    return app


app = create_app()
