"""Regression coverage for reducing spare inventory."""

from app.models.spare_category import SpareCategory
from app.models.spare_item import SpareItem
from app.models.spare_item_variant import SpareItemVariant
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
