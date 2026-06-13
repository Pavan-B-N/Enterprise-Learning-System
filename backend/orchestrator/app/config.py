import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Enterprise Learning Orchestrator"
    DEBUG: bool = False

    # MongoDB
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DATABASE: str = "enterprise_learning"

    # Azure AI Foundry
    FOUNDRY_PROJECT_ENDPOINT: str = ""
    FOUNDRY_API_KEY: str = ""

    # The single orchestrator agent in Foundry that coordinates all sub-agents
    AGENT_ORCHESTRATOR: str = "els-orchestrator"
    # MCP server URL (can be overridden in .env)
    MCP_SERVER_URL: str = "http://els-mcp-server.eastus.azurecontainer.io:8010/mcp"

    # Redis (multi-turn task/session state)
    REDIS_URL: str = "redis://localhost:6379/0"
    SESSION_TTL_SECONDS: int = 3600

    # Multi-turn loop limits — protect against runaway agent ping-pong.
    MAX_SPECIALIST_TURNS: int = 3        # specialist round-trips per user message
    MAX_TASK_WALL_CLOCK_SECONDS: int = 90  # hard cap on a single user-facing task

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False
    )


settings = Settings()
