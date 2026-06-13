from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Enterprise Learning Gateway"
    DEBUG: bool = False

    # Service URLs (internal)
    CORE_SERVICE_URL: str = "http://localhost:8001"
    ORCHESTRATOR_URL: str = "http://localhost:8002"
    ADMIN_SERVICE_URL: str = "http://localhost:8003"

    # JWT (validation only — Core issues tokens)
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 500

    # Redis (for WS pub/sub bridge from backend services)
    REDIS_URL: str = ""  # rediss://:password@host:6380/0

    class Config:
        env_file = ".env"


settings = Settings()
