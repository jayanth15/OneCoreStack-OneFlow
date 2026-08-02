"""Tests that completing a request always subtracts inventory.

Covers the admin `set_status` override path: completing an internal_transfer
request manually (→ received) must deduct stock exactly like the deliver flow,
for every inventory type. Also verifies no double-deduction when deliver already
ran, and that vendor_purchase (inbound) is not deducted.
"""
from sqlmodel import select

from app.models.consumable import Consumable
from app.models.consumable_history import ConsumableHistory
from app.models.attachment_item import AttachmentItem
from app.models.attachment_history import AttachmentHistory
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.spare_item import SpareItem
from app.models.spare_item_variant import SpareItemVariant
from app.models.spare_item_history import SpareItemHistory
from app.models.weeder_item import WeederItem
from app.models.weeder_history import WeederHistory


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _request_with_item(session, inventory_item_id: int, item_type: str, quantity: float = 4) -> Request:
    req = Request(
        sn_no=f"REQ-STS-{item_type}-{inventory_item_id}",
        request_type="internal_transfer",
        department="QA",
        status="in_progress",
        quantity=quantity,
    )
    session.add(req)
    session.flush()
    session.add(RequestItem(
        request_id=req.id,
        inventory_item_id=inventory_item_id,
        item_name=f"Item {item_type}",
        item_code=f"CODE-{item_type}",
        item_type=item_type,
        department="QA",
        quantity=quantity,
    ))
    session.commit()
    return req


def test_set_status_received_deducts_inventory_item(client, session, admin_token):
    stock = InventoryItem(code="RM-ADMIN", name="Admin steel", item_type="raw_material", quantity_on_hand=10)
    session.add(stock)
    session.commit()
    req = _request_with_item(session, stock.id, "raw_material", quantity=4)

    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(stock)
    assert stock.quantity_on_hand == 6

    history = session.exec(select(InventoryHistory).where(InventoryHistory.inventory_item_id == stock.id)).all()
    assert history[-1].quantity_delta == -4
    assert "manual status override" in history[-1].notes


def test_set_status_received_deducts_consumable(client, session, admin_token):
    item = Consumable(name="Oil", code="CON-ADMIN", qty=8)
    session.add(item)
    session.commit()
    req = _request_with_item(session, item.id, "consumable", quantity=3)

    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(item)
    assert item.qty == 5

    history = session.exec(select(ConsumableHistory).where(ConsumableHistory.consumable_id == item.id)).all()
    assert history[-1].qty_delta == -3


def test_set_status_received_deducts_weeder(client, session, admin_token):
    item = WeederItem(name="Weeder", sn_no="WD-ADMIN", qty=6)
    session.add(item)
    session.commit()
    req = _request_with_item(session, item.id, "weeder", quantity=2)

    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(item)
    assert item.qty == 4

    history = session.exec(select(WeederHistory).where(WeederHistory.weeder_id == item.id)).all()
    assert history[-1].qty_delta == -2


def test_set_status_received_deducts_attachment(client, session, admin_token):
    item = AttachmentItem(sn_no="ATT-ADMIN", description="Clamp", qty=5)
    session.add(item)
    session.commit()
    req = _request_with_item(session, item.id, "attachment", quantity=5)

    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(item)
    assert item.qty == 0

    history = session.exec(select(AttachmentHistory).where(AttachmentHistory.attachment_id == item.id)).all()
    assert history[-1].qty_delta == -5


def test_set_status_received_deducts_spare_variant(client, session, admin_token):
    from app.models.spare_category import SpareCategory
    category = SpareCategory(name="Test category")
    session.add(category)
    session.flush()
    parent = SpareItem(category_id=category.id, name="Bearing", part_number="SP-ADMIN", recorded_qty=10)
    session.add(parent)
    session.flush()
    variant = SpareItemVariant(spare_item_id=parent.id, serial_number="SN-1", qty=10)
    session.add(variant)
    session.commit()

    req = _request_with_item(session, variant.id, "spare", quantity=4)

    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(variant)
    session.refresh(parent)
    assert variant.qty == 6
    assert parent.recorded_qty == 6

    history = session.exec(
        select(SpareItemHistory).where(SpareItemHistory.spare_item_variant_id == variant.id)
    ).all()
    assert history[-1].qty_delta == -4


def test_set_status_does_not_double_deduct_after_deliver(client, session, admin_token):
    stock = InventoryItem(code="RM-DOUBLE", name="No double", item_type="raw_material", quantity_on_hand=10)
    session.add(stock)
    session.commit()
    req = _request_with_item(session, stock.id, "raw_material", quantity=4)

    # Deliver first (deducts 4)
    delivered = client.post(
        f"/api/v1/requests/{req.id}/deliver",
        json={"delivery_note": "issued"},
        headers=_headers(admin_token),
    )
    assert delivered.status_code == 200, delivered.json()
    session.refresh(stock)
    assert stock.quantity_on_hand == 6

    # Admin override to received must NOT deduct again
    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(stock)
    assert stock.quantity_on_hand == 6


def test_set_status_vendor_purchase_does_not_deduct(client, session, admin_token):
    stock = InventoryItem(code="RM-PURCH", name="Purchase inbound", item_type="raw_material", quantity_on_hand=10)
    session.add(stock)
    session.commit()
    req = Request(
        sn_no="REQ-PURCH-STS",
        request_type="vendor_purchase",
        department="QA",
        status="in_progress",
        quantity=4,
    )
    session.add(req)
    session.flush()
    session.add(RequestItem(
        request_id=req.id,
        inventory_item_id=stock.id,
        item_name="Purchased steel",
        item_code="RM-PURCH",
        item_type="raw_material",
        department="QA",
        quantity=4,
    ))
    session.commit()

    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(stock)
    # Purchases are inbound — stock must NOT be subtracted
    assert stock.quantity_on_hand == 10


def test_set_status_deducts_rejected_items_are_skipped(client, session, admin_token):
    stock = InventoryItem(code="RM-SKIP", name="Skip rejected", item_type="raw_material", quantity_on_hand=10)
    session.add(stock)
    session.commit()
    req = _request_with_item(session, stock.id, "raw_material", quantity=4)
    item = session.exec(select(RequestItem).where(RequestItem.request_id == req.id)).one()
    item.item_status = "rejected"
    session.add(item)
    session.commit()

    resp = client.post(
        f"/api/v1/requests/{req.id}/status",
        json={"new_status": "received"},
        headers=_headers(admin_token),
    )
    assert resp.status_code == 200, resp.json()
    session.refresh(stock)
    assert stock.quantity_on_hand == 10
