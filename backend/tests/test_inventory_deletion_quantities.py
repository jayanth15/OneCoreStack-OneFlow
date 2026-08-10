from app.models.attachment_item import AttachmentItem
from app.models.consumable import Consumable
from app.models.inventory import InventoryItem
from app.models.spare_category import SpareCategory
from app.models.spare_item import SpareItem
from app.models.weeder_item import WeederItem


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_deleting_stock_clears_only_deleted_items(client, session, admin_token):
    category = SpareCategory(name="Delete safety")
    session.add(category)
    session.commit()
    session.refresh(category)

    active_controls = [
        InventoryItem(code="KEEP-I", name="Keep inventory", quantity_on_hand=101),
        Consumable(name="Keep consumable", qty=102),
        AttachmentItem(description="Keep attachment", qty=103),
        WeederItem(name="Keep weeder", qty=104),
        SpareItem(category_id=category.id, name="Keep spare", recorded_qty=105),
    ]
    deleted_targets = [
        InventoryItem(code="DELETE-I", name="Delete inventory", quantity_on_hand=11),
        Consumable(name="Delete consumable", qty=12),
        AttachmentItem(description="Delete attachment", qty=13),
        WeederItem(name="Delete weeder", qty=14),
        SpareItem(category_id=category.id, name="Delete spare", recorded_qty=15),
    ]
    session.add_all(active_controls + deleted_targets)
    session.commit()
    for record in active_controls + deleted_targets:
        session.refresh(record)

    endpoints = (
        f"/api/v1/inventory/{deleted_targets[0].id}",
        f"/api/v1/consumables/{deleted_targets[1].id}",
        f"/api/v1/attachments/{deleted_targets[2].id}",
        f"/api/v1/weeders/{deleted_targets[3].id}",
        f"/api/v1/spares/items/{deleted_targets[4].id}",
    )
    for endpoint in endpoints:
        response = client.delete(endpoint, headers=_auth(admin_token))
        assert response.status_code == 204, (endpoint, response.text)

    for record in active_controls + deleted_targets:
        session.refresh(record)
    assert [
        active_controls[0].quantity_on_hand,
        active_controls[1].qty,
        active_controls[2].qty,
        active_controls[3].qty,
        active_controls[4].recorded_qty,
    ] == [101, 102, 103, 104, 105]
    assert all(record.is_active for record in active_controls)
    assert [
        deleted_targets[0].quantity_on_hand,
        deleted_targets[1].qty,
        deleted_targets[2].qty,
        deleted_targets[3].qty,
        deleted_targets[4].recorded_qty,
    ] == [0, 0, 0, 0, 0]
    assert all(not record.is_active for record in deleted_targets)
