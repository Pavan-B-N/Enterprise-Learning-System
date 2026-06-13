from contextlib import asynccontextmanager

from bson import ObjectId
from fastapi import FastAPI
from fastapi.encoders import ENCODERS_BY_TYPE

from app.config import settings
from app.db.mongo import close_client
from app.routes.auth_routes import router as auth_router
from app.routes.chat_routes import router as chat_router
from app.routes.learner_routes import router as learner_router
from app.routes.team_routes import router as team_router
from app.routes.user_routes import router as user_router
from app.routes.health import router as health_router
from app.routes.schedule_routes import router as schedule_router, publisher as schedule_publisher
from app.routes.notification_routes import router as notification_router
from app.services.notification_consumer import make_consumer as make_notif_consumer, redis_pub
from app.services.sb_admin import ensure_queues
from app.telemetry import RAIDMiddleware, RequestLoggerMiddleware

# Teach FastAPI's jsonable_encoder how to handle bson.ObjectId so route
# handlers can return raw Mongo documents without crashing the serializer.
ENCODERS_BY_TYPE[ObjectId] = str


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AZURE_SERVICE_BUS_CONNECTION_STRING:
        ensure_queues(
            settings.AZURE_SERVICE_BUS_CONNECTION_STRING,
            [settings.SB_QUEUE_ASSESSMENT_JOBS, settings.SB_QUEUE_NOTIFICATIONS],
        )

    notif_consumer = make_notif_consumer()
    if settings.AZURE_SERVICE_BUS_CONNECTION_STRING:
        notif_consumer.start()

    try:
        yield
    finally:
        await notif_consumer.stop()
        await schedule_publisher.close()
        await redis_pub.close()
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
    app.include_router(auth_router)
    app.include_router(chat_router)
    app.include_router(learner_router)
    app.include_router(team_router)
    app.include_router(user_router)
    app.include_router(schedule_router)
    app.include_router(notification_router)

    return app


app = create_app()
