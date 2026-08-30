"""Regression coverage for reducing spare inventory."""

from app.models.spare_category import SpareCategory
from app.models.spare_item import SpareItem
from app.models.spare_item_variant import SpareItemVariant
from app.models.inventory import InventoryItem
from app.models.spare_sub_category import SpareSubCategory
from sqlmodel import select


def test_reducing_spare_item_updates_parent_and_variant_inventory(client, session, admin_token):
    category = SpareCategory(name="Vehicle Spares")
    session.add(category)
    session.commit()
    session.refresh(category)
    subcategory = SpareSubCategory(category_id=category.id, name="Engine")
    session.add(subcategory)
    session.commit()
    session.refresh(subcategory)
    item = SpareItem(
        category_id=category.id,
        sub_category_id=subcategory.id,
        name="Air Filter",
        recorded_qty=20,  # deliberately stale; active variants total 10
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    session.add(SpareItemVariant(spare_item_id=item.id, variant_color="Red", qty=6))
    session.add(SpareItemVariant(spare_item_id=item.id, variant_color="Blue", qty=4))
    session.commit()

    response = client.post(
        f"/api/v1/spares/items/{item.id}/adjust",
        json={"adjustment_type": "subtract", "quantity": 3, "note": "Issued"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert response.json()["recorded_qty"] == 7

    session.refresh(item)
    variants = session.exec(
        select(SpareItemVariant).where(
            SpareItemVariant.spare_item_id == item.id,
            SpareItemVariant.is_active == True,  # noqa: E712
        )
    ).all()
    assert item.recorded_qty == 7
    assert round(sum(variant.qty for variant in variants), 4) == 7


def test_negative_spare_reduction_is_rejected(client, session, admin_token):
    category = SpareCategory(name="General Spares")
    session.add(category)
    session.commit()
    session.refresh(category)
    item = SpareItem(category_id=category.id, name="Bearing", recorded_qty=5)
    session.add(item)
    session.commit()
    session.refresh(item)

    response = client.post(
        f"/api/v1/spares/items/{item.id}/adjust",
        json={"adjustment_type": "subtract", "quantity": -2},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422
    session.refresh(item)
    assert item.recorded_qty == 5


def test_variant_history_is_scoped_to_each_individual_part(client, session, admin_token):
    category = SpareCategory(name="Scoped Spares")
    session.add(category)
    session.commit()
    session.refresh(category)
    item = SpareItem(category_id=category.id, name="Drive Belt", recorded_qty=0)
    session.add(item)
    session.commit()
    session.refresh(item)
    first = SpareItemVariant(spare_item_id=item.id, serial_number="BELT-1", qty=4)
    second = SpareItemVariant(spare_item_id=item.id, serial_number="BELT-2", qty=6)
    session.add(first)
    session.add(second)
    session.commit()
    session.refresh(first)
    session.refresh(second)

    for variant in (first, second):
        adjusted = client.post(
            f"/api/v1/spares/variants/{variant.id}/adjust",
            json={"adjustment_type": "add", "quantity": 1, "note": variant.serial_number},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert adjusted.status_code == 200

    history = client.get(
        f"/api/v1/spares/variants/{first.id}/history",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["spare_item_variant_id"] == first.id
    assert history.json()[0]["qty_before"] == 4
    assert history.json()[0]["qty_after"] == 5
    assert history.json()[0]["note"] == "BELT-1"


def test_category_value_uses_only_active_variants_and_clears_last_deleted_variant(client, session, admin_token):
    category = SpareCategory(name="Valued Spares")
    session.add(category)
    session.commit()
    session.refresh(category)
    item = SpareItem(
        category_id=category.id,
        name="Legacy Cached Item",
        recorded_qty=20,
        rate=100_000,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    active = SpareItemVariant(spare_item_id=item.id, serial_number="ACTIVE", qty=9, rate=100_000)
    deleted = SpareItemVariant(spare_item_id=item.id, serial_number="DELETED", qty=11, rate=100_000, is_active=False)
    session.add(active)
    session.add(deleted)
    session.commit()
    session.refresh(active)

    response = client.get(
        "/api/v1/spares/categories?include_inactive=false&page_size=100",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    category_payload = response.json()["items"][0]
    assert category_payload["total_value"] == 900_000

    delete_response = client.delete(
        f"/api/v1/spares/variants/{active.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete_response.status_code == 204
    session.refresh(item)
    assert item.recorded_qty == 0
    refreshed = client.get(
        "/api/v1/spares/categories?include_inactive=false&page_size=100",
        headers={"Authorization": f"Bearer {admin_token}"},
    ).json()["items"][0]
    # Item still exists with a rate; its value is now 0 (qty cleared), not None.
    assert refreshed["total_value"] == 0.0


def test_dashboard_inventory_value_excludes_inactive_items(client, session, admin_token):
    active = InventoryItem(
        code="ACTIVE-VALUE", name="Active Value", item_type="raw_material",
        quantity_on_hand=3, rate=300_000, is_active=True,
    )
    inactive = InventoryItem(
        code="DELETED-VALUE", name="Deleted Value", item_type="raw_material",
        quantity_on_hand=11, rate=100_000, is_active=False,
    )
    session.add(active)
    session.add(inactive)
    session.commit()

    response = client.get(
        "/api/v1/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["overview"]["total_inventory_items"] == 1
    raw_material = next(row for row in payload["inventory_by_type"] if row["item_type"] == "raw_material")
    assert raw_material["count"] == 1
    assert raw_material["total_value"] == 900_000
