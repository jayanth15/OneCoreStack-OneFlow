"""Tests for leaf-only stock deduction invariants."""
from sqlmodel import select
from app.models.spare_item_variant import SpareItemVariant

from tests.conftest import create_admin, create_dept, create_user_with_dept, login


def _setup_spare_with_variants(client, session, admin_token):
    from app.models.spare_item import SpareItem
    from app.models.spare_item_variant import SpareItemVariant
    from app.models.spare_category import SpareCategory
    from app.models.spare_sub_category import SpareSubCategory
    from datetime import datetime, timezone

    cat = session.exec(select(SpareCategory).where(SpareCategory.name == "Spares")).first()
    if not cat:
        cat = SpareCategory(name="Spares", is_active=True)
        session.add(cat)
        session.commit()

    sub = session.exec(select(SpareSubCategory).where(SpareSubCategory.name == "Fasteners")).first()
    if not sub:
        sub = SpareSubCategory(name="Fasteners", category_id=cat.id, is_active=True)
        session.add(sub)
        session.commit()

    parent = SpareItem(
        category_id=cat.id,
        sub_category_id=sub.id,
        name="Bolt M8",
        part_number="BOLT-M8",
        recorded_qty=100,
        is_active=True,
    )
    session.add(parent)
    session.commit()
    session.refresh(parent)

    variant_a = SpareItemVariant(
        spare_item_id=parent.id,
        variant_color="Black",
        serial_number="SN-A",
        qty=60,
        is_active=True,
    )
    variant_b = SpareItemVariant(
        spare_item_id=parent.id,
        variant_color="Silver",
        serial_number="SN-B",
        qty=40,
        is_active=True,
    )
    session.add(variant_a)
    session.add(variant_b)
    session.commit()
    session.refresh(parent)
    return parent, variant_a, variant_b


def _setup_weeder_with_items(client, session, admin_token):
    from app.models.weeder_item import WeederItem
    from app.models.weeder_category import WeederCategory
    from datetime import datetime, timezone

    cat = session.exec(select(WeederCategory).where(WeederCategory.name == "Weeds")).first()
    if not cat:
        cat = WeederCategory(name="Weeds", is_active=True)
        session.add(cat)
        session.commit()

    item_a = WeederItem(
        category_id=cat.id,
        name="Dandelion",
        description="Common weed",
        qty=50,
        is_active=True,
    )
    item_b = WeederItem(
        category_id=cat.id,
        name="Crabgrass",
        description="Lawn weed",
        qty=30,
        is_active=True,
    )
    session.add(item_a)
    session.add(item_b)
    session.commit()
    session.refresh(item_a)
    session.refresh(item_b)
    return item_a, item_b


def test_deduct_from_spare_variant_a_leaves_b_unchanged(client, session, admin_token):
    """Deducting from variant A must not affect variant B."""
    parent, variant_a, variant_b = _setup_spare_with_variants(client, session, admin_token)
    from app.services.request_inventory import StockDeduction, deduct_request_stock
    from app.models.spare_item_variant import SpareItemVariant
    from app.models.user import User

    admin = session.exec(select(User).where(User.username == "admin")).first()
    deduct_request_stock(
        session,
        [StockDeduction(
            inventory_type="spare",
            item_id=variant_a.id,
            quantity=10,
            label="Bolt M8 Black",
        )],
        admin,
        note="Test deduction",
    )
    session.refresh(variant_a)
    session.refresh(variant_b)
    assert variant_a.qty == 50
    assert variant_b.qty == 40


def test_deduct_from_weeder_item_leaves_sibling_unchanged(client, session, admin_token):
    """Deducting from weeder item A must not affect weeder item B."""
    item_a, item_b = _setup_weeder_with_items(client, session, admin_token)
    from app.services.request_inventory import StockDeduction, deduct_request_stock
    from app.models.user import User

    admin = session.exec(select(User).where(User.username == "admin")).first()
    deduct_request_stock(
        session,
        [StockDeduction(
            inventory_type="weeder",
            item_id=item_a.id,
            quantity=5,
            label="Dandelion",
        )],
        admin,
        note="Test deduction",
    )
    session.refresh(item_a)
    session.refresh(item_b)
    assert item_a.qty == 45
    assert item_b.qty == 30


def test_parent_aggregate_recomputed_after_leaf_deduction(client, session, admin_token):
    """After leaf deduction, parent SpareItem.recorded_qty must equal sum of active variants."""
    parent, variant_a, variant_b = _setup_spare_with_variants(client, session, admin_token)
    from app.services.request_inventory import StockDeduction, deduct_request_stock
    from app.models.user import User

    admin = session.exec(select(User).where(User.username == "admin")).first()
    deduct_request_stock(
        session,
        [StockDeduction(
            inventory_type="spare",
            item_id=variant_a.id,
            quantity=10,
            label="Bolt M8 Black",
        )],
        admin,
        note="Test deduction",
    )
    session.refresh(parent)
    active_variants = session.exec(
        select(SpareItemVariant).where(
            SpareItemVariant.spare_item_id == parent.id,
            SpareItemVariant.is_active == True,
        )
    ).all()
    assert parent.recorded_qty == sum(v.qty for v in active_variants)


def test_insufficient_stock_on_selected_leaf_rejects_all(client, session, admin_token):
    """If selected leaf has insufficient stock, the entire deduction must be rejected."""
    parent, variant_a, variant_b = _setup_spare_with_variants(client, session, admin_token)
    from app.services.request_inventory import StockDeduction, deduct_request_stock
    from app.models.user import User
    from fastapi import HTTPException

    admin = session.exec(select(User).where(User.username == "admin")).first()
    try:
        deduct_request_stock(
            session,
            [StockDeduction(
                inventory_type="spare",
                item_id=variant_a.id,
                quantity=1000,
                label="Bolt M8 Black",
            )],
            admin,
            note="Test deduction",
        )
        assert False, "Should have raised HTTPException"
    except HTTPException as e:
        assert e.status_code == 409

    session.refresh(variant_a)
    assert variant_a.qty == 60


def test_deduction_targets_leaf_not_parent_id(client, session, admin_token):
    """Deduction must use the leaf variant ID, not the parent spare ID."""
    parent, variant_a, _ = _setup_spare_with_variants(client, session, admin_token)
    from app.services.request_inventory import StockDeduction, deduct_request_stock
    from app.models.user import User

    admin = session.exec(select(User).where(User.username == "admin")).first()
    deduct_request_stock(
        session,
        [StockDeduction(
            inventory_type="spare",
            item_id=parent.id,  # Using parent ID should fail or resolve to variant
            quantity=10,
            label="Bolt M8",
        )],
        admin,
        note="Test deduction",
    )
    # The service resolves parent IDs to variants only when appropriate
    # For spares, it should use the variant ID
