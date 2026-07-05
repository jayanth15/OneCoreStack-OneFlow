def test_purchase_order_accepts_optional_manual_po_number(client, admin_token):
    resp = client.post(
        "/api/v1/purchase-orders",
        json={
            "po_number": "SUP-PO-7788",
            "party_type": "supplier",
            "supplier_name": "Acme Supplies",
            "items": [{"item_name": "Bearings", "quantity": 2, "rate": 10}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert resp.status_code == 201, f"Create failed: {resp.status_code} {resp.json()}"
    assert resp.json()["po_number"] == "SUP-PO-7788"

    duplicate = client.post(
        "/api/v1/purchase-orders",
        json={
            "po_number": "SUP-PO-7788",
            "party_type": "supplier",
            "supplier_name": "Acme Supplies",
            "items": [{"item_name": "Bolts", "quantity": 1, "rate": 5}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert duplicate.status_code == 400


def test_received_purchase_order_updates_linked_purchase_request(client, admin_token):
    request = client.post(
        "/api/v1/requests",
        json={
            "request_type": "vendor_purchase",
            "items": [{"item_name": "Bearings", "quantity": 2}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert request.status_code == 201, request.json()
    request_id = request.json()["id"]
    request_number = request.json()["sn_no"]

    po = client.post(
        "/api/v1/purchase-orders",
        json={
            "party_type": "supplier",
            "supplier_name": "Acme Supplies",
            "purchase_request_id": request_id,
            "purchase_request_number": request_number,
            "items": [{"item_name": "Bearings", "quantity": 2, "rate": 10}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert po.status_code == 201, po.json()

    updated = client.put(
        f"/api/v1/purchase-orders/{po.json()['id']}",
        json={"status": "received"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert updated.status_code == 200, updated.json()

    linked_request = client.get(
        f"/api/v1/requests/{request_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert linked_request.status_code == 200
    assert linked_request.json()["status"] == "received"
    assert linked_request.json()["acknowledgment_note"] == f"Linked purchase order {po.json()['po_number']} received"
