def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_gate_pass_detail_and_transition_guard(client, admin_token):
    created = client.post("/api/v1/gate-passes", json={
        "party_type": "vendor", "vendor_name": "Acme", "pass_type": "out",
        "items": [{"item_name": "Pump", "quantity": 1, "inv_type": "spare"}],
    }, headers=auth(admin_token))
    assert created.status_code == 201, created.text
    gp = created.json()
    detail = client.get(f"/api/v1/gate-passes/{gp['id']}", headers=auth(admin_token))
    assert detail.status_code == 200
    assert detail.json()["party_type"] == "vendor"
    invalid = client.put(f"/api/v1/gate-passes/{gp['id']}", json={"status": "delivered"}, headers=auth(admin_token))
    assert invalid.status_code == 409


def test_po_identity_flows_into_grn_and_grn_drives_po_status(client, admin_token):
    po_response = client.post("/api/v1/purchase-orders", json={
        "party_type": "supplier", "supplier_name": "Steel Co", "status": "draft",
        "items": [{
            "item_name": "Steel", "quantity": 5, "inventory_type": "raw_material",
            "inventory_item_id": 42,
        }],
    }, headers=auth(admin_token))
    assert po_response.status_code == 201, po_response.text
    po = po_response.json()
    line = po["items"][0]
    assert line["inventory_type"] == "raw_material"
    assert line["inventory_item_id"] == 42

    approved = client.put(f"/api/v1/purchase-orders/{po['id']}", json={"status": "approved"}, headers=auth(admin_token))
    assert approved.status_code == 200, approved.text
    grn_response = client.post("/api/v1/grn", json={
        "purchase_order_id": po["id"], "transport_type": "own",
        "items": [{
            "item_name": line["item_name"], "item_type": line["inventory_type"],
            "quantity_received": 5, "purchase_order_item_id": line["id"],
        }],
    }, headers=auth(admin_token))
    assert grn_response.status_code == 201, grn_response.text
    grn = grn_response.json()
    assert grn["purchase_order_id"] == po["id"]
    assert grn["items"][0]["purchase_order_item_id"] == line["id"]

    filled = client.post(f"/api/v1/grn/{grn['id']}/mark-stock-filled", headers=auth(admin_token))
    assert filled.status_code == 200, filled.text
    refreshed_po = client.get(f"/api/v1/purchase-orders/{po['id']}", headers=auth(admin_token))
    assert refreshed_po.json()["status"] == "received"
