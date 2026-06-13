from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Enterprise Learning Admin Service"
    DEBUG: bool = False

    # Database
    MONGODB_URI: str = "mongodb://0.0.0.0:27017"
    MONGODB_DATABASE: str = "enterprise_learning"

    # JWT
    JWT_SECRET_KEY: str = "hackathon-dev-secret-change-in-prod"
    JWT_ALGORITHM: str = "HS256"

    class Config:
        env_file = ".env"


settings = Settings()
