import logging
from bson import ObjectId
from fastapi import FastAPI
from fastapi.encoders import ENCODERS_BY_TYPE

from app.config import settings
from app.routes.assessments import router as assessments_router
from app.routes.chat_routes import router as chat_router
from app.routes.engagement import router as engagement_router
from app.routes.health import router as health_router
from app.routes.insights import router as insights_router
from app.routes.plan import router as plan_router
from app.routes.recommendations import router as recommendations_router
from app.telemetry import RAIDMiddleware, RequestLoggerMiddleware

# Teach FastAPI's jsonable_encoder how to handle bson.ObjectId so route
# handlers can return raw Mongo documents without crashing the serializer.
ENCODERS_BY_TYPE[ObjectId] = str


# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url=None,
    )

    app.add_middleware(RequestLoggerMiddleware)
    app.add_middleware(RAIDMiddleware)

    app.include_router(health_router)
    app.include_router(chat_router)
    app.include_router(recommendations_router)
    app.include_router(plan_router)
    app.include_router(engagement_router)
    app.include_router(assessments_router)
    app.include_router(insights_router)

    logger.info(f"🚀 {settings.APP_NAME} started (DEBUG={settings.DEBUG})")

    return app


app = create_app()
