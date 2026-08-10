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


def test_grn_received_purchase_order_updates_linked_purchase_request(client, admin_token):
    request = client.post(
        "/api/v1/requests",
        json={"request_type": "vendor_purchase", "items": [{"item_name": "Bearings", "quantity": 2}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert request.status_code == 201, request.json()
    request_id = request.json()["id"]
    approved_request = client.post(
        f"/api/v1/requests/{request_id}/review", json={"decision": "approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approved_request.status_code == 200, approved_request.text

    po_response = client.post(
        "/api/v1/purchase-orders",
        json={
            "party_type": "supplier", "supplier_name": "Acme Supplies",
            "purchase_request_id": request_id,
            "purchase_request_number": request.json()["sn_no"],
            "items": [{"item_name": "Bearings", "quantity": 2, "rate": 10}],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert po_response.status_code == 201, po_response.text
    po = po_response.json()
    approved_po = client.put(
        f"/api/v1/purchase-orders/{po['id']}", json={"status": "approved"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approved_po.status_code == 200, approved_po.text
    manual_received = client.put(
        f"/api/v1/purchase-orders/{po['id']}", json={"status": "received"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert manual_received.status_code == 409

    grn_response = client.post(
        "/api/v1/grn",
        json={"purchase_order_id": po["id"], "items": [{"item_name": "Bearings", "quantity_received": 2}]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert grn_response.status_code == 201, grn_response.text
    filled = client.post(
        f"/api/v1/grn/{grn_response.json()['id']}/mark-stock-filled",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert filled.status_code == 200, filled.text

    linked_request = client.get(
        f"/api/v1/requests/{request_id}", headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert linked_request.status_code == 200
    assert linked_request.json()["status"] == "received"
    assert po["po_number"] in linked_request.json()["acknowledgment_note"]
