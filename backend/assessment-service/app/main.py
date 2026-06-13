"""assessment-service entrypoint.

Hosts a tiny FastAPI app for `/health` and bootstraps a long-running Service
Bus consumer that does the actual work (question generation).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.consumer import make_consumer, publisher
from app.db import close_client
from app.telemetry import RAIDMiddleware, RequestLoggerMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    consumer = make_consumer()
    if settings.AZURE_SERVICE_BUS_CONNECTION_STRING:
        consumer.start()
        logger.info("assessment-service: consumer started on %s", settings.SB_QUEUE_ASSESSMENT_JOBS)
    else:
        logger.warning("AZURE_SERVICE_BUS_CONNECTION_STRING not set; consumer disabled")

    try:
        yield
    finally:
        await consumer.stop()
        await publisher.close()
        await close_client()


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME, lifespan=lifespan, docs_url="/docs" if settings.DEBUG else None)

    app.add_middleware(RequestLoggerMiddleware)
    app.add_middleware(RAIDMiddleware)

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "assessment-service"}

    return app


app = create_app()
