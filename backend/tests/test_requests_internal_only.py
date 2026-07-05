"""Tests for internal_transfer request with from_department auto-stamping."""
from tests.conftest import create_user_with_dept, create_dept, login


def test_create_internal_transfer_stamps_from_department(client, session, admin_token, qa_dept):
    """When a user in dept PROD creates an internal_transfer to dept QA,
    the from_department field is auto-stamped as PROD."""
    # Create target department
    create_dept(session, "PROD", "Production")

    # Create worker in PROD dept
    create_user_with_dept(session, "prod_worker", "worker", "PROD")
    prod_token = login(client, "prod_worker", "test123")

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "department": "QA",
            "items": [{"item_name": "Steel", "quantity": 10}],
        },
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert resp.status_code == 201, f"Create failed: {resp.status_code} {resp.json()}"
    data = resp.json()
    assert data["from_department"] == "PROD", f"Expected from_department=PROD, got {data.get('from_department')}"
    assert data["department"] == "QA", f"Expected department=QA, got {data.get('department')}"


def test_create_internal_transfer_rejects_same_from_and_to(client, session, admin_token, qa_dept):
    """Creating an internal_transfer where from_department == to_department is rejected."""
    create_user_with_dept(session, "qa_worker", "worker", "QA")
    qa_token = login(client, "qa_worker", "test123")

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "department": "QA",
            "items": [{"item_name": "Steel", "quantity": 10}],
        },
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
    data = resp.json()
    assert "same department" in data.get("detail", "").lower()


def test_vendor_purchase_also_stamps_from_department(client, session, admin_token, qa_dept):
    """vendor_purchase requests also get from_department auto-stamped."""
    create_dept(session, "PROD", "Production")
    create_user_with_dept(session, "prod_worker", "admin", "PROD")
    prod_token = login(client, "prod_worker", "test123")

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "vendor_purchase",
            "department": "QA",
            "from_whom": "Acme Corp",
            "items": [{"item_name": "Bolts", "quantity": 100}],
        },
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert resp.status_code == 201, f"Create failed: {resp.status_code} {resp.json()}"
    data = resp.json()
    assert data["from_department"] == "PROD", f"Expected from_department=PROD, got {data.get('from_department')}"


def test_purchase_request_requires_configured_department(client, session, admin_token, qa_dept):
    """Non-admin users can create purchase requests only from configured departments."""
    create_user_with_dept(session, "qa_worker", "worker", "QA")
    qa_token = login(client, "qa_worker", "test123")

    blocked = client.post(
        "/api/v1/requests",
        json={
            "request_type": "vendor_purchase",
            "items": [{"item_name": "Bearings", "quantity": 12}],
        },
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert blocked.status_code == 403

    configured = client.put(
        "/api/v1/admin/departments/purchase-request-access",
        json={"department_ids": [qa_dept.id]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert configured.status_code == 200, configured.json()

    allowed = client.post(
        "/api/v1/requests",
        json={
            "request_type": "vendor_purchase",
            "items": [{"item_name": "Bearings", "quantity": 12}],
        },
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert allowed.status_code == 201, f"Create failed: {allowed.status_code} {allowed.json()}"
    data = allowed.json()
    assert data["from_department"] == "QA"
    assert data.get("department") is None
    assert data.get("from_whom") is None


def test_customer_dispatch_does_not_stamp_from_department(client, session, admin_token, qa_dept):
    """customer_dispatch does NOT auto-stamp from_department (not applicable)."""
    # Make QA department handle customer dispatches
    qa_dept.handles_customer_dispatch = True
    session.commit()

    create_user_with_dept(session, "mkt_worker", "worker", "QA")
    mkt_token = login(client, "mkt_worker", "test123")

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "customer_dispatch",
            "dispatch": {
                "customer_name": "John Doe",
                "inventory_type": "weeder",
                "quantity": 1,
            },
            "items": [],
        },
        headers={"Authorization": f"Bearer {mkt_token}"},
    )
    # Should still create OK but from_department might be null
    assert resp.status_code == 201, f"Create failed: {resp.status_code} {resp.json()}"
    data = resp.json()
    assert data.get("from_department") is None, (
        f"Expected from_department=None for customer_dispatch, got {data.get('from_department')}"
    )


def test_get_request_returns_from_department(client, session, admin_token, qa_dept):
    """A GET on a created request includes from_department."""
    create_dept(session, "PROD", "Production")
    create_user_with_dept(session, "prod_worker", "worker", "PROD")
    prod_token = login(client, "prod_worker", "test123")

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "department": "QA",
            "items": [{"item_name": "Steel", "quantity": 5}],
        },
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    req_id = resp.json()["id"]

    # GET the request
    resp = client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {prod_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["from_department"] == "PROD"
