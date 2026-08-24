from app.core.linkable_prs import get_linkable_pr_items
from app.models.inventory import InventoryItem
from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_item import PurchaseRequestItem
from app.models.unit import Unit


def test_linkable_pr_items_resolve_normalized_inventory_unit(session):
    unit = Unit(name="Kilogram")
    session.add(unit)
    session.flush()
    inventory = InventoryItem(
        code="LINK-UNIT-1",
        name="Linkable steel",
        unit_id=unit.id,
    )
    session.add(inventory)
    session.flush()
    request = PurchaseRequest(sn_no="PR-2099-0001", status="approved")
    session.add(request)
    session.flush()
    session.add(PurchaseRequestItem(
        request_id=request.id,
        inventory_item_id=inventory.id,
        item_name=inventory.name,
        item_code=inventory.code,
        item_type=inventory.item_type,
        quantity=3,
    ))
    session.commit()

    items = get_linkable_pr_items(session, request.id)

    assert len(items) == 1
    assert items[0].unit_id == unit.id
    assert items[0].unit_name == "Kilogram"
