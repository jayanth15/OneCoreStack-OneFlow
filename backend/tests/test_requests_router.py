"""Integration tests for the unified /api/v1/requests router."""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel

from app.main import app
from app.core.database import engine
from app.core.security import hash_password, create_access_token
from app.models.user import User
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.models.request_receipt import RequestReceipt  # noqa: F401  — registered so SQLModel metadata matches


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for tbl in (
            RequestReceipt, RequestItem, RequestCustomerDispatch, Request, User,
        ):
            s.execute(tbl.__table__.delete())
        s.commit()
    yield


@pytest.fixture
def admin_user():
    u = User(
        username="admin", password_hash=hash_password("pw"),
        role="admin", is_active=True, department="admin",
    )
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


@pytest.fixture
def marketing_user():
    u = User(
        username="mkt", password_hash=hash_password("pw"),
        role="worker", is_active=True, department="marketing",
    )
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


@pytest.fixture
def staff_user():
    u = User(
        username="staff", password_hash=hash_password("pw"),
        role="worker", is_active=True, department="sales",
    )
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


@pytest.fixture
def production_user():
    """A worker in a non-allowed dept for customer_dispatch (allowed: marketing/sales/admin)."""
    u = User(
        username="prod", password_hash=hash_password("pw"),
        role="worker", is_active=True, department="production",
    )
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


def _bearer(user: User) -> dict:
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def test_list_empty(client, admin_user):
    r = client.get("/api/v1/requests", headers=_bearer(admin_user))
    assert r.status_code == 200
    assert r.json() == []


# ---------------- happy paths ----------------

def test_create_internal_transfer(client, staff_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "Laptop", "quantity": 2.0}],
        "notes": "For new hire",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sn_no"].startswith("REQ-")
    assert body["request_type"] == "internal_transfer"
    assert body["quantity"] == 2.0
    assert len(body["items"]) == 1


def test_create_vendor_purchase_requires_from_whom(client, staff_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "vendor_purchase",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    assert r.status_code == 422  # pydantic validation


def test_create_vendor_purchase_admin_only(client, staff_user):
    """Non-admin cannot create vendor_purchase."""
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "vendor_purchase",
        "from_whom": "ABC",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    assert r.status_code == 403


def test_create_customer_dispatch_marketing_only(client, production_user, marketing_user):
    """Customer dispatch is restricted to marketing/sales depts (and admin).

    A worker from a non-allowed dept (e.g. production) is rejected; a
    marketing user is allowed. (Sales is also allowed per the router
    auth model — see requests._user_can_see_type.)
    """
    # Production worker cannot create customer_dispatch
    r = client.post("/api/v1/requests", headers=_bearer(production_user), json={
        "request_type": "customer_dispatch",
        "dispatch": {"customer_name": "Bob", "inventory_type": "weeder", "quantity": 1.0},
    })
    assert r.status_code == 403

    # Marketing user can
    r = client.post("/api/v1/requests", headers=_bearer(marketing_user), json={
        "request_type": "customer_dispatch",
        "dispatch": {"customer_name": "Bob", "inventory_type": "weeder", "item_sn_no": "WP-1", "quantity": 1.0},
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sn_no"].startswith("MKT-")
    assert body["request_type"] == "customer_dispatch"
    assert body["dispatch"]["customer_name"] == "Bob"


def test_list_filters_by_type(client, staff_user, marketing_user):
    client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "A", "quantity": 1.0}],
    })
    client.post("/api/v1/requests", headers=_bearer(marketing_user), json={
        "request_type": "customer_dispatch",
        "dispatch": {"customer_name": "X", "inventory_type": "weeder", "quantity": 1.0},
    })
    r = client.get("/api/v1/requests?request_type=internal_transfer", headers=_bearer(staff_user))
    assert r.status_code == 200
    assert all(x["request_type"] == "internal_transfer" for x in r.json())
    assert len(r.json()) >= 1


def test_review_approve_then_accept_flow(client, staff_user, admin_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    # admin reviews
    r = client.post(f"/api/v1/requests/{rid}/review", headers=_bearer(admin_user), json={"decision": "approve"})
    assert r.status_code == 200
    assert r.json()["status"] == "approved"
    # staff (in sales dept, matches request department) accepts fulfilment
    r = client.post(f"/api/v1/requests/{rid}/accept", headers=_bearer(staff_user))
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"


def test_history_recorded_on_create_and_review(client, staff_user, admin_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    client.post(f"/api/v1/requests/{rid}/review", headers=_bearer(admin_user), json={"decision": "approve"})
    r = client.get(f"/api/v1/requests/{rid}/history", headers=_bearer(staff_user))
    types = [h["change_type"] for h in r.json()]
    assert "created" in types
    assert "approved" in types


def test_soft_delete(client, staff_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    r = client.delete(f"/api/v1/requests/{rid}", headers=_bearer(staff_user))
    assert r.status_code == 204
    # list with only_active=True (default) should hide it
    r = client.get("/api/v1/requests", headers=_bearer(staff_user))
    assert all(x["id"] != rid for x in r.json())


def test_only_requester_or_admin_can_edit(client, staff_user, marketing_user):
    r = client.post("/api/v1/requests", headers=_bearer(staff_user), json={
        "request_type": "internal_transfer", "department": "sales",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    # different user, not admin → 403
    r = client.put(f"/api/v1/requests/{rid}", headers=_bearer(marketing_user),
                   json={"notes": "hijack"})
    assert r.status_code == 403
