from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Enterprise Learning Core Service"
    DEBUG: bool = False

    # MongoDB
    MONGODB_URI: str = "mongodb://0.0.0.0:27017"
    MONGODB_DATABASE: str = "enterprise_learning"

    # JWT (this service ISSUES tokens)
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRY_MINUTES: int = 10080  # 7 days
    JWT_REFRESH_EXPIRY_DAYS: int = 7

    # Azure Service Bus
    AZURE_SERVICE_BUS_CONNECTION_STRING: str = ""
    SB_QUEUE_ASSESSMENT_JOBS: str = "els-assessment-jobs"
    SB_QUEUE_NOTIFICATIONS: str = "els-notifications"

    # Redis (for cross-service WebSocket pub/sub bridge)
    REDIS_URL: str = ""  # e.g. rediss://:password@host:6380/0

    class Config:
        env_file = ".env"


settings = Settings()
