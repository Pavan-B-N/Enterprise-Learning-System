from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.rate_limiter import RateLimitMiddleware
from app.middleware.auth_middleware import AuthMiddleware
from app.routes.proxy import router as proxy_router
from app.routes.health import router as health_router
from app.routes.websocket import router as websocket_router
from app.telemetry import RAIDMiddleware, RequestLoggerMiddleware


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url=None,
    )

    # Middleware (order matters: last added = outermost)
    # Innermost first → request log runs after auth+raid populated; raid runs first inbound.
    app.add_middleware(RequestLoggerMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(AuthMiddleware)
    app.add_middleware(RAIDMiddleware)

    # CORS must be outermost to handle preflight OPTIONS before auth
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routes
    app.include_router(health_router)
    app.include_router(proxy_router)
    app.include_router(websocket_router)

    return app


app = create_app()
