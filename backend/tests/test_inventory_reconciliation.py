from app.core.security import hash_password
from app.models.dispatch import Dispatch
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.request import Request
from app.models.request_item import RequestItem
from app.models.spare_category import SpareCategory
from app.models.spare_item import SpareItem
from app.models.spare_item_variant import SpareItemVariant
from app.models.user import User

from conftest import create_admin, login


def test_reconciliation_reports_mismatches_and_never_mutates(client, session):
    create_admin(session)

    active = InventoryItem(code="ACTIVE-1", name="Active", quantity_on_hand=10, rate=100)
    inactive = InventoryItem(
        code="DELETED-1", name="Deleted", quantity_on_hand=7, rate=1000, is_active=False
    )
    session.add(active)
    session.add(inactive)
    session.commit()
    session.refresh(active)
    session.refresh(inactive)
    session.add(
        InventoryHistory(
            inventory_item_id=active.id,
            change_type="set",
            quantity_before=0,
            quantity_after=8,
            quantity_delta=8,
        )
    )

    category = SpareCategory(name="Audit spares")
    session.add(category)
    session.commit()
    session.refresh(category)
    spare = SpareItem(
        category_id=category.id,
        name="Filter",
        part_number="SP-1",
        recorded_qty=9,
        rate=50,
    )
    session.add(spare)
    session.commit()
    session.refresh(spare)
    session.add(
        SpareItemVariant(
            spare_item_id=spare.id,
            serial_number="SP-1-A",
            qty=4,
            rate=60,
        )
    )

    request = Request(
        sn_no="REQ-AUDIT-1",
        request_type="internal_transfer",
        status="received",
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    session.add(
        RequestItem(
            request_id=request.id,
            inventory_item_id=active.id,
            item_name="Active",
            item_type="raw_material",
            quantity=2,
            item_status="delivered",
        )
    )
    session.add(
        Dispatch(
            dispatch_number="DSP-AUDIT-1",
            party_type="vendor",
            product_name="Active",
            quantity=1,
            status="delivered",
        )
    )
    session.commit()

    quantities_before = (active.quantity_on_hand, inactive.quantity_on_hand, spare.recorded_qty)
    token = login(client)
    response = client.get(
        "/api/v1/admin/reconciliation/inventory",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    report = response.json()
    assert "issues" in report, report
    codes = {issue["code"] for issue in report["issues"]}
    assert "history_balance_mismatch" in codes
    assert "inactive_item_has_stock" in codes
    assert "spare_parent_variant_mismatch" in codes
    assert "missing_request_deduction_evidence" in codes
    assert "missing_dispatch_deduction_evidence" in codes
    assert report["summary"]["active_value_by_domain"]["inventory"] == 1000
    assert report["summary"]["active_value_by_domain"]["spares"] == 240
    assert report["summary"]["active_total_value"] == 1240

    session.refresh(active)
    session.refresh(inactive)
    session.refresh(spare)
    assert (active.quantity_on_hand, inactive.quantity_on_hand, spare.recorded_qty) == quantities_before


def test_reconciliation_requires_admin(client, session):
    worker = User(
        username="worker",
        password_hash=hash_password("test123"),
        role="worker",
        is_active=True,
    )
    session.add(worker)
    session.commit()
    token = login(client, "worker", "test123")

    response = client.get(
        "/api/v1/admin/reconciliation/inventory",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
