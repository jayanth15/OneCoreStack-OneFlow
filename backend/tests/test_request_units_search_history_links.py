"""Regression coverage for Request units, search, and stock document lineage."""
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.receipt import Receipt
from app.models.unit import Unit
from tests.conftest import create_dept


def test_request_preserves_inventory_unit_and_is_searchable(client, session, admin_token):
    create_dept(session, "QA", "Quality Assurance")
    unit = Unit(name="Kilogram")
    session.add(unit)
    session.flush()
    inventory = InventoryItem(
        code="RM-SEARCH-UNIT",
        name="Searchable steel",
        item_type="raw_material",
        unit_id=unit.id,
        quantity_on_hand=25,
    )
    session.add(inventory)
    session.commit()

    response = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "department": "QA",
            "items": [{
                "inventory_item_id": inventory.id,
                "item_name": inventory.name,
                "item_code": inventory.code,
                "item_type": inventory.item_type,
                "quantity": 2,
                "department": "QA",
            }],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201, response.json()
    request = response.json()
    assert request["items"][0]["unit_id"] == unit.id
    assert request["items"][0]["unit_name"] == "Kilogram"

    by_number = client.get(
        f"/api/v1/requests?search={request['sn_no']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    by_item = client.get(
        "/api/v1/requests?search=Searchable%20steel",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert [row["id"] for row in by_number.json()] == [request["id"]]
    assert [row["id"] for row in by_item.json()] == [request["id"]]

    receipt = Receipt(receipt_number="RCP-2099-0001", request_id=request["id"], status="created")
    session.add(receipt)
    session.flush()
    session.add(InventoryHistory(
        inventory_item_id=inventory.id,
        change_type="subtract",
        quantity_before=25,
        quantity_after=23,
        quantity_delta=-2,
        notes=f"Fulfilled request {request['sn_no']}",
    ))
    session.commit()

    history = client.get(
        "/api/v1/history/raw-materials",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert history.status_code == 200, history.json()
    linked = next(item for item in history.json()["items"] if item["entity_id"] == inventory.id)
    assert linked["request_id"] == request["id"]
    assert linked["request_sn_no"] == request["sn_no"]
    assert linked["receipt_id"] == receipt.id
    assert linked["receipt_number"] == receipt.receipt_number
