"""Integration tests for /api/v1/request-receipts."""
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel

from app.main import app
from app.core.database import engine
from app.core.security import hash_password, create_access_token
from app.models.user import User
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.request_receipt import RequestReceipt


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        for tbl in (RequestReceipt, RequestItem, Request, User):
            s.execute(tbl.__table__.delete())
        s.commit()
    yield


def _user(name: str, role: str = "worker", dept: str = "sales") -> User:
    u = User(username=name, password_hash=hash_password("pw"),
             role=role, is_active=True, department=dept)
    with Session(engine) as s:
        s.add(u); s.commit(); s.refresh(u)
    return u


def _bearer(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


def _create_approved_internal_request(staff: User) -> int:
    admin = _user("_adm", role="admin", dept="admin")
    c = TestClient(app)
    r = c.post("/api/v1/requests", headers=_bearer(staff), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "X", "quantity": 2.0}],
    })
    rid = r.json()["id"]
    c.post(f"/api/v1/requests/{rid}/review", headers=_bearer(admin), json={"decision": "approve"})
    return rid


def test_create_receipt_after_approval(client):
    staff = _user("alice", dept="sales")
    rid = _create_approved_internal_request(staff)
    r = client.post("/api/v1/request-receipts", headers=_bearer(staff), json={
        "request_id": rid, "item_name": "X", "quantity_requested": 2.0, "quantity_received": 2.0,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["sn_no"].startswith("RCPT-")
    assert body["status"] == "pending_ack"


def test_create_receipt_rejects_pending_request(client):
    staff = _user("bob", dept="sales")
    c = TestClient(app)
    r = c.post("/api/v1/requests", headers=_bearer(staff), json={
        "request_type": "internal_transfer",
        "department": "sales",
        "items": [{"item_name": "X", "quantity": 1.0}],
    })
    rid = r.json()["id"]
    r = client.post("/api/v1/request-receipts", headers=_bearer(staff), json={
        "request_id": rid, "quantity_received": 1.0,
    })
    assert r.status_code == 409


def test_acknowledge_receipt_marks_request_received(client):
    staff = _user("carol", dept="sales")
    rid = _create_approved_internal_request(staff)
    r = client.post("/api/v1/request-receipts", headers=_bearer(staff), json={
        "request_id": rid, "quantity_received": 2.0,
    })
    rcpt_id = r.json()["id"]
    r = client.post(f"/api/v1/request-receipts/{rcpt_id}/acknowledge", headers=_bearer(staff), json={"note": "OK"})
    assert r.status_code == 200
    assert r.json()["status"] == "acknowledged"
    # request status auto-promoted
    r = client.get(f"/api/v1/requests/{rid}", headers=_bearer(staff))
    assert r.json()["status"] == "received"


def test_list_receipts_filter_by_request(client):
    staff = _user("dave", dept="sales")
    rid = _create_approved_internal_request(staff)
    client.post("/api/v1/request-receipts", headers=_bearer(staff), json={"request_id": rid, "quantity_received": 1.0})
    r = client.get(f"/api/v1/request-receipts?request_id={rid}", headers=_bearer(staff))
    assert r.status_code == 200
    assert all(x["request_id"] == rid for x in r.json())
