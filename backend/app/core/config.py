from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load .env from the backend/ directory, regardless of where uvicorn is launched from
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "OneFlow"
    debug: bool = False

    # Database
    database_url: str = "sqlite:///./oneflow.db"

    # JWT
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # CORS
    cors_origins: list[str] = ["*"]

    # Optional modules (all off by default, enable per deployment)
    module_planning: bool = False
    module_routing: bool = False
    module_resources: bool = False
    module_outsourcing: bool = False
    module_quality: bool = False
    module_dispatch: bool = False


settings = Settings()
