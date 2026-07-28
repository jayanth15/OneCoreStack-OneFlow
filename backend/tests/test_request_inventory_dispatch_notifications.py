from sqlmodel import select

from app.models.dispatch import Dispatch
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.notification import Notification
from app.models.request import Request
from app.models.receipt import Receipt
from app.models.request_customer_dispatch import RequestCustomerDispatch
from app.models.request_item import RequestItem
from app.models.user import User
from app.models.weeder_item import WeederItem


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _internal_request(session, stock: InventoryItem, quantity: float = 4) -> Request:
    req = Request(
        sn_no=f"REQ-STOCK-{stock.id}",
        request_type="internal_transfer",
        department="QA",
        status="in_progress",
        quantity=quantity,
    )
    session.add(req)
    session.flush()
    session.add(RequestItem(
        request_id=req.id,
        inventory_item_id=stock.id,
        item_name=stock.name,
        item_code=stock.code,
        item_type=stock.item_type,
        department="QA",
        quantity=quantity,
    ))
    session.commit()
    return req


def test_request_delivery_deducts_inventory_and_writes_history(
    client, session, admin_token, qa_dept,
):
    stock = InventoryItem(code="RM-STOCK", name="Stock steel", item_type="raw_material", quantity_on_hand=10)
    session.add(stock)
    session.commit()
    req = _internal_request(session, stock, quantity=4)

    response = client.post(
        f"/api/v1/requests/{req.id}/deliver",
        json={"delivery_note": "Issued from stores"},
        headers=_headers(admin_token),
    )

    assert response.status_code == 200
    session.refresh(stock)
    assert stock.quantity_on_hand == 6
    history = session.exec(
        select(InventoryHistory).where(InventoryHistory.inventory_item_id == stock.id)
    ).all()
    assert history[-1].quantity_delta == -4
    assert history[-1].notes == f"Fulfilled request {req.sn_no}"


def test_request_delivery_is_blocked_without_enough_inventory(
    client, session, admin_token, qa_dept,
):
    stock = InventoryItem(code="RM-SHORT", name="Short steel", item_type="raw_material", quantity_on_hand=2)
    session.add(stock)
    session.commit()
    req = _internal_request(session, stock, quantity=4)

    response = client.post(
        f"/api/v1/requests/{req.id}/deliver",
        json={"delivery_note": "Should fail"},
        headers=_headers(admin_token),
    )

    assert response.status_code == 409
    assert "requested 4, available 2" in response.json()["detail"]
    session.refresh(stock)
    session.refresh(req)
    assert stock.quantity_on_hand == 2
    assert req.status == "in_progress"


def _customer_request(session, item: WeederItem, quantity: float) -> Request:
    req = Request(
        sn_no=f"REQ-DSP-{item.id}",
        request_type="customer_dispatch",
        status="approved",
        quantity=quantity,
    )
    session.add(req)
    session.flush()
    session.add(RequestCustomerDispatch(
        request_id=req.id,
        customer_name="Test customer",
        inventory_type="weeder",
        item_id=item.id,
        item_sn_no=item.sn_no,
        item_description=item.name,
        quantity=quantity,
    ))
    session.commit()
    return req


def test_linked_dispatch_reserves_then_fulfils_request_once(client, session, admin_token):
    item = WeederItem(name="Power weeder", sn_no="WD-1", qty=5)
    session.add(item)
    session.commit()
    req = _customer_request(session, item, quantity=2)

    created = client.post(
        "/api/v1/dispatch",
        json={"request_id": req.id, "request_sn_no": req.sn_no, "status": "pending"},
        headers=_headers(admin_token),
    )
    assert created.status_code == 201, created.json()
    assert created.json()["items"][0]["inv_item_id"] == item.id
    session.refresh(req)
    session.refresh(item)
    assert req.status == "in_progress"
    assert item.qty == 5

    fulfilled = client.put(
        f"/api/v1/dispatch/{created.json()['id']}",
        json={"status": "dispatched"},
        headers=_headers(admin_token),
    )
    assert fulfilled.status_code == 200, fulfilled.json()
    session.refresh(req)
    session.refresh(item)
    assert req.status == "received"
    assert item.qty == 3

    repeated = client.put(
        f"/api/v1/dispatch/{created.json()['id']}",
        json={"status": "delivered"},
        headers=_headers(admin_token),
    )
    assert repeated.status_code == 200
    session.refresh(item)
    assert item.qty == 3


def test_linked_dispatch_cannot_fulfil_more_than_inventory(client, session, admin_token):
    item = WeederItem(name="Low-stock weeder", sn_no="WD-LOW", qty=1)
    session.add(item)
    session.commit()
    req = _customer_request(session, item, quantity=2)
    created = client.post(
        "/api/v1/dispatch",
        json={"request_id": req.id, "status": "pending"},
        headers=_headers(admin_token),
    )

    response = client.put(
        f"/api/v1/dispatch/{created.json()['id']}",
        json={"status": "dispatched"},
        headers=_headers(admin_token),
    )

    assert response.status_code == 409
    session.refresh(item)
    session.refresh(req)
    dispatch = session.get(Dispatch, created.json()["id"])
    assert item.qty == 1
    assert req.status == "in_progress"
    assert dispatch.status == "pending"


def test_notifications_only_return_unread_active_links_and_clear_all(
    client, session, admin_token,
):
    admin = session.exec(select(User).where(User.username == "admin")).one()
    active = Request(sn_no="REQ-N-ACTIVE", request_type="internal_transfer", status="pending")
    deleted = Request(
        sn_no="REQ-N-DELETED", request_type="internal_transfer", status="cancelled", is_active=False
    )
    session.add(active)
    session.add(deleted)
    session.flush()
    session.add(Notification(user_id=admin.id, type="test", title="Visible", request_id=active.id))
    session.add(Notification(user_id=admin.id, type="test", title="Stale", request_id=deleted.id))
    session.add(Notification(user_id=admin.id, type="test", title="Already read", is_read=True))
    session.commit()

    listed = client.get("/api/v1/notifications", headers=_headers(admin_token))
    assert listed.status_code == 200
    assert [notification["title"] for notification in listed.json()] == ["Visible"]

    cleared = client.post("/api/v1/notifications/read-all", headers=_headers(admin_token))
    assert cleared.status_code == 200
    assert client.get("/api/v1/notifications", headers=_headers(admin_token)).json() == []
    assert client.get("/api/v1/notifications/unread-count", headers=_headers(admin_token)).json() == {"count": 0}


def test_any_request_can_be_selected_only_once_for_dispatch(client, session, admin_token):
    req = Request(
        sn_no="REQ-ANY-0001",
        request_type="internal_transfer",
        status="approved",
        quantity=3,
    )
    session.add(req)
    session.flush()
    session.add(RequestItem(
        request_id=req.id,
        item_name="Packing crate",
        item_type="finished_good",
        quantity=3,
    ))
    session.commit()

    available = client.get(
        "/api/v1/dispatch/available-requests",
        headers=_headers(admin_token),
    )
    assert available.status_code == 200
    assert req.id in {item["id"] for item in available.json()}

    first = client.post(
        "/api/v1/dispatch",
        json={"request_id": req.id, "status": "pending"},
        headers=_headers(admin_token),
    )
    assert first.status_code == 201, first.json()
    assert first.json()["request_sn_no"] == req.sn_no
    assert first.json()["items"][0]["item_name"] == "Packing crate"

    repeated = client.post(
        "/api/v1/dispatch",
        json={"request_id": req.id, "status": "pending"},
        headers=_headers(admin_token),
    )
    assert repeated.status_code == 409

    available_after = client.get(
        "/api/v1/dispatch/available-requests",
        headers=_headers(admin_token),
    )
    assert req.id not in {item["id"] for item in available_after.json()}


def test_standalone_oem_dispatch_deducts_only_on_first_completion(client, session, admin_token):
    item = WeederItem(name="Standalone OEM item", sn_no="WD-OEM", qty=8)
    session.add(item)
    session.commit()
    session.refresh(item)

    created = client.post(
        "/api/v1/dispatch",
        json={
            "party_type": "vendor",
            "vendor_name": "OEM Customer",
            "status": "pending",
            "items": [{"item_name": item.name, "inv_type": "weeder", "inv_item_id": item.id, "quantity": 3}],
        },
        headers=_headers(admin_token),
    )
    assert created.status_code == 201, created.json()
    session.refresh(item)
    assert item.qty == 8

    completed = client.put(
        f"/api/v1/dispatch/{created.json()['id']}",
        json={"status": "dispatched"},
        headers=_headers(admin_token),
    )
    assert completed.status_code == 200, completed.json()
    session.refresh(item)
    assert item.qty == 5
    assert completed.json()["inventory_deducted_at"] is not None

    repeated = client.put(
        f"/api/v1/dispatch/{created.json()['id']}",
        json={"status": "delivered"},
        headers=_headers(admin_token),
    )
    assert repeated.status_code == 200
    session.refresh(item)
    assert item.qty == 5


def test_supplier_dispatch_requires_receipt_and_never_deducts_again(client, session, admin_token):
    item = WeederItem(name="Supplier-reserved item", sn_no="WD-SUP", qty=4)
    request = Request(sn_no="REQ-SUP-RCP", request_type="internal_transfer", status="received", quantity=2)
    session.add(item)
    session.add(request)
    session.flush()
    receipt = Receipt(receipt_number="RCP-SUP-0001", request_id=request.id, status="signed_off")
    session.add(receipt)
    session.commit()
    session.refresh(item)
    session.refresh(receipt)

    created = client.post(
        "/api/v1/dispatch",
        json={
            "party_type": "supplier",
            "supplier_name": "Dealer",
            "receipt_id": receipt.id,
            "status": "pending",
            "items": [{"item_name": item.name, "inv_type": "weeder", "inv_item_id": item.id, "quantity": 2}],
        },
        headers=_headers(admin_token),
    )
    assert created.status_code == 201, created.json()
    assert created.json()["receipt_number"] == receipt.receipt_number

    completed = client.put(
        f"/api/v1/dispatch/{created.json()['id']}",
        json={"status": "dispatched"},
        headers=_headers(admin_token),
    )
    assert completed.status_code == 200, completed.json()
    session.refresh(item)
    assert item.qty == 4
    assert completed.json()["inventory_deducted_at"] is None
