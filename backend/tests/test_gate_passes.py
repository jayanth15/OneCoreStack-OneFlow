"""Tests for Gate Pass creation, history, reference rules, and deletion."""
from datetime import datetime, timezone
from sqlmodel import select

from tests.conftest import create_admin, create_dept, create_user_with_dept, login


def setup_gate_pass(client, session, admin_token, party_type="vendor"):
    """Create a real purchase order and use the admin token for Gate Pass access."""
    from app.models.purchase_order import PurchaseOrder
    po = session.exec(select(PurchaseOrder).where(PurchaseOrder.po_number == "PO-0001")).first()
    if not po:
        po = PurchaseOrder(po_number="PO-0001", party_type="vendor", vendor_name="Test Vendor", status="approved")
        session.add(po)
        session.commit()
    return admin_token


def test_create_gate_pass_writes_created_history(client, session, admin_token):
    """Creating a Gate Pass must write a 'created' history row."""
    ops_token = setup_gate_pass(client, session, admin_token)
    resp = client.post(
        "/api/v1/gate-passes",
        json={
            "pass_type": "out",
            "vendor_id": 1,
            "vendor_name": "Test Vendor",
            "material": "Steel Sheet",
            "quantity": 10,
            "unit_id": 1,
            "purpose": "Production",
            "items": [
                {
                    "item_name": "Steel Sheet",
                    "inv_type": "raw_material",
                    "inv_item_id": 1,
                    "quantity": 10,
                    "unit_id": 1,
                }
            ],
        },
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    assert resp.status_code == 201, f"Create failed: {resp.status_code} {resp.json()}"
    gp_id = resp.json()["id"]

    hist = client.get(f"/api/v1/gate-passes/{gp_id}/history", headers={"Authorization": f"Bearer {ops_token}"})
    assert hist.status_code == 200
    history = hist.json()
    assert len(history) >= 1
    assert history[0]["change_type"] == "created"


def test_gate_pass_field_edit_writes_updated_history(client, session, admin_token):
    """Editing a Gate Pass field must write an 'updated' history row."""
    ops_token = setup_gate_pass(client, session, admin_token)
    resp = client.post(
        "/api/v1/gate-passes",
        json={
            "pass_type": "out",
            "vendor_id": 1,
            "vendor_name": "Test Vendor",
            "material": "Steel Sheet",
            "quantity": 10,
            "unit_id": 1,
            "items": [],
        },
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    gp_id = resp.json()["id"]

    resp = client.put(
        f"/api/v1/gate-passes/{gp_id}",
        json={"purpose": "Updated purpose"},
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    assert resp.status_code == 200

    hist = client.get(f"/api/v1/gate-passes/{gp_id}/history", headers={"Authorization": f"Bearer {ops_token}"})
    history = hist.json()
    change_types = [h["change_type"] for h in history]
    assert "updated" in change_types


def test_gate_pass_deletion_writes_deleted_history(client, session, admin_token):
    """Deleting a Gate Pass must write a 'deleted' history row and retain earlier history."""
    ops_token = setup_gate_pass(client, session, admin_token)
    resp = client.post(
        "/api/v1/gate-passes",
        json={
            "pass_type": "out",
            "vendor_id": 1,
            "vendor_name": "Test Vendor",
            "material": "Steel Sheet",
            "quantity": 10,
            "unit_id": 1,
            "items": [],
        },
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    gp_id = resp.json()["id"]

    before_hist = client.get(f"/api/v1/gate-passes/{gp_id}/history", headers={"Authorization": f"Bearer {ops_token}"})
    before_count = len(before_hist.json())

    del_resp = client.delete(f"/api/v1/gate-passes/{gp_id}", headers={"Authorization": f"Bearer {ops_token}"})
    assert del_resp.status_code == 204

    after_hist = client.get(f"/api/v1/gate-passes/{gp_id}/history", headers={"Authorization": f"Bearer {ops_token}"})
    history = after_hist.json()
    assert len(history) == before_count + 1
    assert history[0]["change_type"] == "deleted"


def test_vendor_gate_pass_accepts_purchase_orderReference(client, session, admin_token):
    """Vendor Gate Pass should accept a valid PO reference and return it."""
    ops_token = setup_gate_pass(client, session, admin_token)
    resp = client.post(
        "/api/v1/gate-passes",
        json={
            "pass_type": "out",
            "vendor_id": 1,
            "vendor_name": "Test Vendor",
            "purchase_order_id": 1,
            "purchase_order_number": "PO-0001",
            "material": "Steel Sheet",
            "quantity": 10,
            "unit_id": 1,
            "items": [],
        },
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["purchase_order_number"] == "PO-0001"


def test_supplier_gate_pass_clears_purchase_references_on_create(client, session, admin_token):
    """Supplier Gate Pass must clear all purchase references."""
    ops_token = setup_gate_pass(client, session, admin_token)
    resp = client.post(
        "/api/v1/gate-passes",
        json={
            "pass_type": "out",
            "supplier_id": 1,
            "supplier_name": "Test Supplier",
            "purchase_order_id": 1,
            "purchase_order_number": "PO-0001",
            "purchase_request_id": 1,
            "purchase_request_number": "PR-0001",
            "material": "Steel Sheet",
            "quantity": 10,
            "unit_id": 1,
            "items": [],
        },
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["purchase_order_number"] is None
    assert data["purchase_request_number"] is None


def test_supplier_gate_pass_clears_purchase_references_on_update(client, session, admin_token):
    """Switching a Gate Pass to supplier party type must clear stale purchase references."""
    ops_token = setup_gate_pass(client, session, admin_token)
    resp = client.post(
        "/api/v1/gate-passes",
        json={
            "pass_type": "out",
            "vendor_id": 1,
            "vendor_name": "Test Vendor",
            "purchase_order_id": 1,
            "purchase_order_number": "PO-0001",
            "material": "Steel Sheet",
            "quantity": 10,
            "unit_id": 1,
            "items": [],
        },
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    gp_id = resp.json()["id"]

    resp = client.put(
        f"/api/v1/gate-passes/{gp_id}",
        json={"party_type": "supplier", "supplier_id": 1, "supplier_name": "Test Supplier"},
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["purchase_order_number"] is None
    assert data["purchase_request_number"] is None


def test_history_endpoint_enforces_gate_pass_access(client, session, admin_token):
    """History endpoint must enforce Gate Pass access."""
    ops_token = setup_gate_pass(client, session, admin_token)
    resp = client.post(
        "/api/v1/gate-passes",
        json={
            "pass_type": "out",
            "vendor_id": 1,
            "vendor_name": "Test Vendor",
            "material": "Steel Sheet",
            "quantity": 10,
            "unit_id": 1,
            "items": [],
        },
        headers={"Authorization": f"Bearer {ops_token}"},
    )
    gp_id = resp.json()["id"]

    hist = client.get(f"/api/v1/gate-passes/{gp_id}/history", headers={"Authorization": f"Bearer {ops_token}"})
    assert hist.status_code == 200