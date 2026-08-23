from app.models.consumable import Consumable
from app.models.inventory import InventoryItem
from app.models.user import User
from app.routers.dashboard import get_inventory_summary
from app.routers.inventory import list_items


def test_inventory_lists_and_summary_exclude_inactive_items(
    session,
):
    admin = User(
        username="inventory-summary-admin",
        password_hash="unused-in-this-test",
        role="admin",
        is_active=True,
    )
    session.add(admin)
    session.commit()
    session.add_all([
        InventoryItem(
            code="SCR-ACTIVE",
            name="Active scrap",
            item_type="scrap",
            quantity_on_hand=2,
            reorder_level=3,
            rate=5,
            is_active=True,
        ),
        InventoryItem(
            code="SCR-INACTIVE",
            name="Inactive scrap",
            item_type="scrap",
            quantity_on_hand=100,
            rate=10,
            is_active=False,
        ),
        Consumable(
            code="CON-ACTIVE",
            name="Active consumable",
            qty=3,
            reorder_level=1,
            rate_per_unit=2,
            is_active=True,
        ),
        Consumable(
            code="CON-INACTIVE",
            name="Inactive consumable",
            qty=50,
            rate_per_unit=10,
            is_active=False,
        ),
    ])
    session.commit()

    active_list = list_items(
        session=session,
        current_user=admin,
        item_type="scrap",
        include_inactive=False,
    )
    assert active_list["total"] == 1
    assert active_list["items"][0]["code"] == "SCR-ACTIVE"

    summary = get_inventory_summary(session=session, current_user=admin)
    assert summary.types["scrap"].model_dump() == {
        "count": 1,
        "low_stock": 1,
        "value": 10.0,
    }
    assert summary.types["consumable"].model_dump() == {
        "count": 1,
        "low_stock": 0,
        "value": 6.0,
    }
    assert summary.types["finished_good"].model_dump() == {
        "count": 0,
        "low_stock": 0,
        "value": 0.0,
    }
