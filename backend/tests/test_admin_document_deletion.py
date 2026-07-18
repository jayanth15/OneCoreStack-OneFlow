"""Admin-only recoverable deletion for business documents."""

import pytest

from app.models.dispatch import Dispatch
from app.models.gate_pass import GatePass
from app.models.grn import GRNRecord
from app.models.purchase_order import PurchaseOrder
from tests.conftest import create_dept, create_user_with_dept, login


@pytest.fixture
def worker_token(client, session):
    create_dept(session, "OPS", "Operations")
    create_user_with_dept(session, "document_worker", "worker", "OPS")
    return login(client, "document_worker", "test123")


@pytest.mark.parametrize(
    ("model", "url", "number_field", "number"),
    [
        (Dispatch, "/api/v1/dispatch", "dispatch_number", "DSP-DELETE"),
        (GatePass, "/api/v1/gate-passes", "gate_pass_number", "GP-DELETE"),
        (PurchaseOrder, "/api/v1/purchase-orders", "po_number", "PO-DELETE"),
    ],
)
def test_only_admin_can_soft_delete_documents(
    client, session, admin_token, worker_token, model, url, number_field, number,
):
    document = model(**{number_field: number})
    session.add(document)
    session.commit()
    session.refresh(document)

    denied = client.delete(
        f"{url}/{document.id}",
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert denied.status_code == 403

    deleted = client.delete(
        f"{url}/{document.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert deleted.status_code == 204
    session.refresh(document)
    assert document.status == "deleted"

    listing = client.get(
        url,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert listing.status_code == 200
    assert document.id not in {row["id"] for row in listing.json()["items"]}


def test_only_admin_can_soft_delete_grn(client, session, admin_token, worker_token):
    grn = GRNRecord(grn_number="GRN-DELETE")
    session.add(grn)
    session.commit()
    session.refresh(grn)

    denied = client.delete(
        f"/api/v1/grn/{grn.id}",
        headers={"Authorization": f"Bearer {worker_token}"},
    )
    assert denied.status_code == 403

    deleted = client.delete(
        f"/api/v1/grn/{grn.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert deleted.status_code == 204
    session.refresh(grn)
    assert grn.is_active is False
