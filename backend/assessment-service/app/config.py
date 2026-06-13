from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Enterprise Learning Assessment Service"
    DEBUG: bool = False

    # MongoDB
    MONGODB_URI: str = "mongodb://0.0.0.0:27017"
    MONGODB_DATABASE: str = "enterprise_learning"

    # Azure Service Bus
    AZURE_SERVICE_BUS_CONNECTION_STRING: str = ""
    SB_QUEUE_ASSESSMENT_JOBS: str = "els-assessment-jobs"
    SB_QUEUE_NOTIFICATIONS: str = "els-notifications"

    # Orchestrator (for assessment_agent.generate_quiz)
    ORCHESTRATOR_URL: str = "http://localhost:8002"

    # Question generation
    MIN_QUESTIONS: int = 20
    MAX_QUESTIONS: int = 50
    QUESTIONS_PER_TOPIC: int = 2

    class Config:
        env_file = ".env"


settings = Settings()
