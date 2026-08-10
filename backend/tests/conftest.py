"""Pytest fixtures for OneFlow backend — in-memory SQLite, transaction-isolated per test."""
import pytest
from collections.abc import Generator
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from app.core.database import get_session
from app.core.rate_limit import reset_rate_limits
from app.core.security import hash_password
from app.main import app as fastapi_app
from app.models.user import User
from app.models.department import Department
from app.models.user_department import UserDepartment

@pytest.fixture(scope="session")
def engine():
    """Session-scoped in-memory SQLite engine. Tables created once."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    import app.models  # noqa: F401 — populate SQLModel.metadata
    SQLModel.metadata.create_all(engine)
    yield engine


@pytest.fixture(scope="function")
def session(engine):
    """Per-test session with a transaction that is rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(session):
    """FastAPI TestClient that uses the isolated per-test session."""

    def override_get_session() -> Generator[Session, None, None]:
        yield session

    reset_rate_limits()
    fastapi_app.dependency_overrides[get_session] = override_get_session
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()
    reset_rate_limits()


# ── helpers ────────────────────────────────────────────────────────────────────

def create_admin(session: Session) -> User:
    user = User(username="admin", password_hash=hash_password("admin123"), role="admin", is_active=True)
    session.add(user)
    session.commit()
    return user


def create_dept(session: Session, code: str = "QA", name: str = "Quality Assurance") -> Department:
    dept = Department(code=code, name=name, is_active=True)
    session.add(dept)
    session.commit()
    return dept


def create_user_with_dept(session: Session, username: str, role: str, dept_code: str, inventory_access: str = "") -> User:
    user = User(
        username=username,
        password_hash=hash_password("test123"),
        role=role,
        is_active=True,
        inventory_access=inventory_access,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    dept = session.exec(select(Department).where(Department.code == dept_code)).first()
    if dept:
        session.add(UserDepartment(user_id=user.id, department_id=dept.id))  # type: ignore[arg-type]
        session.commit()
    return user


def login(client: TestClient, username: str = "admin", password: str = "admin123") -> str:
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.json()}"
    return resp.json()["access_token"]


# ── convenience fixtures ──────────────────────────────────────────────────────

@pytest.fixture
def admin_token(client, session):
    create_admin(session)
    return login(client)


@pytest.fixture
def qa_dept(session):
    return create_dept(session, "QA", "Quality Assurance")


@pytest.fixture
def prod_dept(session):
    return create_dept(session, "PROD", "Production")
