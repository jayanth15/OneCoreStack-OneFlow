"""Tests for Receipt creation, signoff, and dispute workflow."""
from tests.conftest import create_admin, create_dept, create_user_with_dept, login


# ── helpers ────────────────────────────────────────────────────────────────────

def setup_request(client, session, admin_token, qa_dept):
    """Create a PROD dept + worker, create an internal_transfer QA<--PROD, approve & accept it.
    Returns (prod_token, req_id) where request is in 'in_progress' status.
    """
    create_dept(session, "PROD", "Production")
    create_user_with_dept(session, "prod_worker", "worker", "PROD")
    prod_token = login(client, "prod_worker", "test123")

    # Create request
    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "department": "QA",
            "items": [{"item_name": "Steel", "quantity": 10}],
        },
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    req_id = resp.json()["id"]

    # Admin approve
    client.post(
        f"/api/v1/requests/{req_id}/review",
        json={"decision": "approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    # QA user accepts
    create_user_with_dept(session, "qa_worker", "worker", "QA")
    qa_token = login(client, "qa_worker", "test123")
    client.post(
        f"/api/v1/requests/{req_id}/accept",
        headers={"Authorization": f"Bearer {qa_token}"},
    )

    return prod_token, qa_token, req_id


# ── tests ──────────────────────────────────────────────────────────────────────


def test_create_receipt_requires_fulfiller_or_admin(client, session, admin_token, qa_dept):
    """Only a user in the fulfilling department or an admin can create a receipt."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # prod_worker is NOT in QA → should be denied
    resp = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "items": [], "notes": ""},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code} {resp.json()}"


def test_create_receipt_fulfiller_succeeds(client, session, admin_token, qa_dept):
    """A user in the fulfilling department can create a receipt."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    resp = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test receipt"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp.status_code == 201, f"Create receipt failed: {resp.status_code} {resp.json()}"
    data = resp.json()
    assert "receipt_number" in data, str(data)
    assert data["request_id"] == req_id
    assert data["status"] == "created"


def test_create_receipt_transitions_request_to_awaiting_signoff(client, session, admin_token, qa_dept):
    """Creating a receipt flips the request status to awaiting_signoff."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )

    # Verify request status
    resp = client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {qa_token}"})
    assert resp.json()["status"] == "awaiting_signoff"


def test_deliver_request_creates_linked_receipt(client, session, admin_token, qa_dept):
    """Marking a request delivered creates the receipt shown on the receipts page."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    resp = client.post(
        f"/api/v1/requests/{req_id}/deliver",
        json={"delivery_note": "Ready at stores"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp.status_code == 200, f"Deliver failed: {resp.status_code} {resp.json()}"
    assert resp.json()["status"] == "awaiting_signoff"

    receipts = client.get(
        f"/api/v1/receipts/by-request/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert receipts.status_code == 200
    data = receipts.json()
    assert len(data) == 1
    assert data[0]["request_id"] == req_id
    assert data[0]["notes"] == "Ready at stores"
    assert data[0]["items"][0]["item_name"] == "Steel"
    assert data[0]["items"][0]["quantity_delivered"] == 10


def test_receipt_list_includes_request_direction_context_for_source_department_user(client, session, admin_token, qa_dept):
    """A user in the requester's department can identify receipt source/target context."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    client.post(
        f"/api/v1/requests/{req_id}/deliver",
        json={"delivery_note": "Ready at stores"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )

    create_user_with_dept(session, "prod_viewer", "worker", "PROD")
    viewer_token = login(client, "prod_viewer", "test123")
    resp = client.get(
        "/api/v1/receipts?limit=10&offset=0",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["request_id"] == req_id
    assert data[0]["request_from_department"] == "PROD"
    assert data[0]["request_target_departments"] == ["QA"]


def test_signoff_auto_created_receipt_closes_request(client, session, admin_token, qa_dept):
    """Accepting the auto-created receipt closes the linked request."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    client.post(
        f"/api/v1/requests/{req_id}/deliver",
        json={"delivery_note": "Ready at stores"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )

    receipts = client.get(
        f"/api/v1/receipts/by-request/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    receipt_id = receipts[0]["id"]

    resp = client.post(
        f"/api/v1/receipts/{receipt_id}/signoff",
        json={"notes": "Received OK"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert resp.status_code == 200, f"Signoff failed: {resp.status_code} {resp.json()}"
    assert resp.json()["status"] == "signed_off"
    assert resp.json()["signed_off_by_username"] == "prod_worker"
    assert resp.json()["items"][0]["quantity_signed_off"] == 10

    request = client.get(
        f"/api/v1/requests/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    assert request["status"] == "received"


def test_partial_delivery_shortage_can_be_signed_off_and_close_request(client, session, admin_token, qa_dept):
    """Short delivered quantities are recorded and still close the request once signed off."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)
    req = client.get(
        f"/api/v1/requests/{req_id}",
        headers={"Authorization": f"Bearer {qa_token}"},
    ).json()
    req_item_id = req["items"][0]["id"]

    client.post(
        f"/api/v1/requests/{req_id}/deliver",
        json={
            "delivery_note": "Only ten available",
            "items": [{"request_item_id": req_item_id, "quantity_delivered": 8, "condition": "partial"}],
        },
        headers={"Authorization": f"Bearer {qa_token}"},
    )

    receipt = client.get(
        f"/api/v1/receipts/by-request/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()[0]
    assert receipt["items"][0]["quantity_requested"] == 10
    assert receipt["items"][0]["quantity_delivered"] == 8
    assert receipt["items"][0]["condition"] == "partial"

    signed = client.post(
        f"/api/v1/receipts/{receipt['id']}/signoff",
        json={"notes": "Accepted shortage"},
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    assert signed["items"][0]["quantity_signed_off"] == 8

    request = client.get(
        f"/api/v1/requests/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    assert request["status"] == "received"


def test_multi_department_request_creates_department_receipts(client, session, admin_token, qa_dept):
    """Delivery splits receipts by line-item department and closes only after all are signed off."""
    create_dept(session, "PROD", "Production")
    create_dept(session, "STORE", "Stores")
    create_user_with_dept(session, "prod_worker", "worker", "PROD")
    prod_token = login(client, "prod_worker", "test123")

    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "department": "QA",
            "items": [
                {"item_name": "Steel", "quantity": 10, "department": "QA"},
                {"item_name": "Bolts", "quantity": 5, "department": "STORE"},
            ],
        },
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    req_id = resp.json()["id"]

    client.post(
        f"/api/v1/requests/{req_id}/review",
        json={"decision": "approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.post(
        f"/api/v1/requests/{req_id}/accept",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    client.post(
        f"/api/v1/requests/{req_id}/deliver",
        json={"delivery_note": "Ready by departments"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    receipts = client.get(
        f"/api/v1/receipts/by-request/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    assert len(receipts) == 2
    by_dept = {r["department"]: r for r in receipts}
    assert set(by_dept) == {"QA", "STORE"}
    assert [item["item_name"] for item in by_dept["QA"]["items"]] == ["Steel"]
    assert [item["item_name"] for item in by_dept["STORE"]["items"]] == ["Bolts"]

    client.post(
        f"/api/v1/receipts/{by_dept['QA']['id']}/signoff",
        json={"notes": "QA received"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    request = client.get(
        f"/api/v1/requests/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    assert request["status"] == "awaiting_signoff"

    client.post(
        f"/api/v1/receipts/{by_dept['STORE']['id']}/signoff",
        json={"notes": "Stores received"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    request = client.get(
        f"/api/v1/requests/{req_id}",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    assert request["status"] == "received"


def test_create_receipt_with_items(client, session, admin_token, qa_dept):
    """Receipt can be created with item-level quantity_delivered."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Get request items
    req_resp = client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {qa_token}"})
    req_item_id = req_resp.json()["items"][0]["id"]

    resp = client.post(
        "/api/v1/receipts",
        json={
            "request_id": req_id,
            "items": [
                {"request_item_id": req_item_id, "quantity_delivered": 5, "condition": "good"}
            ],
            "notes": "Partial delivery",
        },
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp.status_code == 201, f"Create receipt failed: {resp.status_code} {resp.json()}"
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["quantity_delivered"] == 5
    assert data["items"][0]["quantity_requested"] == 10


def test_signoff_only_by_requester_or_admin(client, session, admin_token, qa_dept):
    """Only the original requester or an admin can sign off a receipt."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Create receipt
    resp = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    receipt_id = resp.json()["id"]

    # QA user should NOT be able to sign off (not the requester)
    resp = client.post(
        f"/api/v1/receipts/{receipt_id}/signoff",
        json={"notes": "trying to signoff"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"


def test_signoff_by_requester_succeeds(client, session, admin_token, qa_dept):
    """The original requester can sign off a receipt."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Create receipt
    resp = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    receipt_id = resp.json()["id"]

    # Requester signs off
    resp = client.post(
        f"/api/v1/receipts/{receipt_id}/signoff",
        json={"notes": "Received OK"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert resp.status_code == 200, f"Signoff failed: {resp.status_code} {resp.json()}"
    assert resp.json()["status"] == "signed_off"


def test_signoff_transitions_request_to_received(client, session, admin_token, qa_dept):
    """When all active receipts for a request are signed off, status → received."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Create receipt
    resp = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    receipt_id = resp.json()["id"]

    # Requester signs off
    client.post(
        f"/api/v1/receipts/{receipt_id}/signoff",
        json={"notes": "All good"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )

    # Verify request is received
    resp = client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {prod_token}"})
    assert resp.json()["status"] == "received"


def test_receipt_visibility_filter(client, session, admin_token, qa_dept):
    """Receipt list respects visibility: requester sees their own, fulfiller sees dept receipts,
    admin sees all."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Create receipt
    client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )

    # Requester should see it
    resp = client.get("/api/v1/receipts", headers={"Authorization": f"Bearer {prod_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Admin should see it
    resp = client.get("/api/v1/receipts", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert len(resp.json()) >= 1


def test_multiple_receipts_for_same_request(client, session, admin_token, qa_dept):
    """Multiple receipts can be created for the same request."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # First receipt
    resp1 = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "First receipt"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp1.status_code == 201

    # Second receipt
    resp2 = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Second receipt"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp2.status_code == 201

    # List by request should have both
    resp = client.get(
        f"/api/v1/receipts/by-request/{req_id}",
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_signoff_partial_completes_request_only_when_all_done(client, session, admin_token, qa_dept):
    """Request.status → received only after ALL active receipts are signed off."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Create two receipts
    r1 = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Receipt 1"},
        headers={"Authorization": f"Bearer {qa_token}"},
    ).json()
    r2 = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Receipt 2"},
        headers={"Authorization": f"Bearer {qa_token}"},
    ).json()

    # Sign off first receipt only
    client.post(
        f"/api/v1/receipts/{r1['id']}/signoff",
        json={"notes": "First done"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )

    # Request should still be awaiting_signoff (r2 not signed off)
    resp = client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {prod_token}"})
    assert resp.json()["status"] == "awaiting_signoff"

    # Sign off second receipt
    client.post(
        f"/api/v1/receipts/{r2['id']}/signoff",
        json={"notes": "Second done"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )

    # Now request should be received
    resp = client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {prod_token}"})
    assert resp.json()["status"] == "received"


def test_requester_can_dispute_a_receipt(client, session, admin_token, qa_dept):
    """Requester can dispute a receipt, reverting it to disputed status."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Create and sign off a receipt
    receipt_resp = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    receipt_id = receipt_resp.json()["id"]

    client.post(
        f"/api/v1/receipts/{receipt_id}/signoff",
        json={"notes": "Signed off"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )

    # Now dispute it
    resp = client.post(
        f"/api/v1/receipts/{receipt_id}/dispute",
        json={"note": "Items were damaged"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert resp.status_code == 200, f"Dispute failed: {resp.status_code} {resp.json()}"
    assert resp.json()["status"] == "disputed"
    assert resp.json()["dispute_note"] == "Items were damaged"


def test_dispute_reverts_request_to_awaiting_signoff(client, session, admin_token, qa_dept):
    """When the only receipt for a request is disputed after signoff, request goes back to awaiting_signoff."""
    prod_token, qa_token, req_id = setup_request(client, session, admin_token, qa_dept)

    # Create and sign off
    receipt_resp = client.post(
        "/api/v1/receipts",
        json={"request_id": req_id, "notes": "Test"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    receipt_id = receipt_resp.json()["id"]
    client.post(
        f"/api/v1/receipts/{receipt_id}/signoff",
        json={"notes": "Done"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {prod_token}"}).json()["status"] == "received"

    # Dispute
    client.post(
        f"/api/v1/receipts/{receipt_id}/dispute",
        json={"note": "Wrong items"},
        headers={"Authorization": f"Bearer {prod_token}"},
    )
    assert client.get(f"/api/v1/requests/{req_id}", headers={"Authorization": f"Bearer {prod_token}"}).json()["status"] == "awaiting_signoff"
