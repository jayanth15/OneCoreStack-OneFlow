"""Administrative, read-only inventory reconciliation API."""
from fastapi import APIRouter

from app.dependencies.auth import AdminUser, SessionDep
from app.schemas.reconciliation import InventoryReconciliationReport
from app.services.inventory_reconciliation import build_inventory_reconciliation

router = APIRouter(
    prefix="/api/v1/admin/reconciliation",
    tags=["admin", "reconciliation"],
)


@router.get("/inventory", response_model=InventoryReconciliationReport)
def reconcile_inventory(
    session: SessionDep, _current_user: AdminUser
) -> InventoryReconciliationReport:
    return build_inventory_reconciliation(session)
