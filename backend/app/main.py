import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import (
    init_db,
    run_alembic_upgrade,
    stamp_alembic_head,
    alembic_version_exists,
)
from app.core.backup import start_scheduler
from app.routers import auth as auth_router
from app.routers import bom as bom_router
from app.routers import vendors as vendors_router
from app.routers import suppliers as suppliers_router
from app.routers import dispatch as dispatch_router
from app.routers import gate_passes as gate_passes_router
from app.routers import purchase_orders as purchase_orders_router
from app.routers import dashboard as dashboard_router
from app.routers import departments as departments_router
from app.routers import inventory as inventory_router
from app.routers import production as production_router
from app.routers import schedule as schedule_router
from app.routers import users as users_router
from app.routers import spares as spares_router
from app.routers import work_types as work_types_router
from app.routers import consumables as consumables_router
from app.routers import settings as settings_router
from app.routers import attachments as attachments_router
from app.routers import weeders as weeders_router
from app.routers import purchase_requests as purchase_requests_router
from app.routers import marketing_requests as marketing_requests_router
from app.routers.requests import router as requests_router
from app.routers import notifications as notifications_router
from app.routers import grn as grn_router
from app.routers import history as history_router
from app.routers.receipts import router as receipts_router
from app.routers import units

logger = logging.getLogger(__name__)

_DEFAULT_SECRET = "change-me-in-production-use-openssl-rand-hex-32"


def _auto_seed_if_empty() -> None:
    """If the database has no users at all (fresh deployment), create a default
    super_admin account so the app is immediately usable.
    Only runs when settings.auto_seed_admin is True.
    """
    if not settings.auto_seed_admin:
        return

    from app.core.database import engine
    from app.core.security import hash_password
    from app.models.user import User
    from sqlmodel import Session, select

    with Session(engine) as session:
        existing = session.exec(select(User)).first()
        if existing:
            return

        default_admin = User(
            username="admin",
            email="admin@oneflow.local",
            password_hash=hash_password("admin123"),
            role="super_admin",
            is_active=True,
        )
        session.add(default_admin)
        session.commit()
        logger.warning(
            "[AUTO-SEED] No users found — created default super_admin: "
            "username=admin  password=admin123  — CHANGE THIS PASSWORD NOW!"
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    if settings.secret_key == _DEFAULT_SECRET and settings.environment != "development":
        raise RuntimeError(
            "SECRET_KEY is still the default placeholder. "
            "Set SECRET_KEY in the environment before starting in production."
        )

    logging.basicConfig(
        level=logging.DEBUG if settings.debug else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    init_db()

    if alembic_version_exists():
        run_alembic_upgrade()
    else:
        logger.info("No alembic_version table — running legacy catch-up migrations...")
        from app.core.legacy_migrations import run_all as run_legacy_migrations
        run_legacy_migrations()
        stamp_alembic_head()
        logger.info("Legacy migrations complete — database stamped at Alembic baseline")

    _auto_seed_if_empty()
    start_scheduler()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

_cors_origins = settings.cors_origins
if _cors_origins == ["*"] and settings.environment != "development":
    logger.warning("CORS allow_origins=['*'] with credentials is insecure — restricting to none")
    _cors_origins = []

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )

# ── Core routers (always on) ──────────────────────────────────────────────────
app.include_router(auth_router.router)
app.include_router(bom_router.router)
app.include_router(vendors_router.router)
app.include_router(suppliers_router.router)
app.include_router(dispatch_router.router)
app.include_router(gate_passes_router.router)
app.include_router(purchase_orders_router.router)
app.include_router(dashboard_router.router)
app.include_router(departments_router.router)
app.include_router(departments_router.public_router)
app.include_router(inventory_router.router)
app.include_router(production_router.router)
app.include_router(schedule_router.router)
app.include_router(users_router.router)
app.include_router(work_types_router.router)
app.include_router(spares_router.router)
app.include_router(consumables_router.router)
app.include_router(settings_router.public_router)
app.include_router(settings_router.router)
app.include_router(attachments_router.router)
app.include_router(weeders_router.router)
app.include_router(purchase_requests_router.router)
app.include_router(marketing_requests_router.router)
app.include_router(requests_router)
app.include_router(notifications_router.router)
app.include_router(grn_router.router)
app.include_router(history_router.router)
app.include_router(receipts_router)
app.include_router(units.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
