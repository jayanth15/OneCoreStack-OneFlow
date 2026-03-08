from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load .env from the backend/ directory, regardless of where uvicorn is launched from
_BACKEND_DIR = Path(__file__).resolve().parent.parent  # backend/
_ENV_FILE = _BACKEND_DIR.parent / ".env"

# Absolute default DB path — avoids CWD-relative surprises on deployment.
# DB lives in app/db/ so that directory can be bind-mounted on the VPS.
_DB_DIR = _BACKEND_DIR / "app" / "db"
_DB_DIR.mkdir(parents=True, exist_ok=True)  # create the folder if it doesn't exist
_DEFAULT_DB_URL = f"sqlite:///{_DB_DIR / 'oneflow.db'}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "OneFlow"
    debug: bool = False

    # Database — default is absolute so it is NOT affected by CWD.
    # For Docker/Dokploy with a volume mount, set DATABASE_URL in the environment:
    #   DATABASE_URL=sqlite:////data/oneflow.db
    database_url: str = _DEFAULT_DB_URL

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
