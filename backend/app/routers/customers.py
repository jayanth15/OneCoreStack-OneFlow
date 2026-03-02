"""
Customers router.

Customers are stored in their own table so new schedules *must* reference
an existing customer.  Schedule-derived stats are merged in at list/detail time.

GET  /api/v1/customers              — list all customers with aggregated stats
GET  /api/v1/customers/names        — lightweight [{id, name}] list for dropdowns
POST /api/v1/customers              — create a new customer (admin+)
GET  /api/v1/customers/{name}       — full detail for one customer
"""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.schedule import Schedule
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/customers",
    tags=["customers"],
)

ACTIVE_STATUSES = {"pending", "confirmed", "in_production"}
STATUS_ORDER = ["pending", "confirmed", "in_production", "delivered", "cancelled"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _status_counts(schedules: list[Schedule]) -> dict[str, int]:
    counts: dict[str, int] = {s: 0 for s in STATUS_ORDER}
    for s in schedules:
        counts[s.status] = counts.get(s.status, 0) + 1
    return counts


def _product_summary(schedules: list[Schedule], session: Session) -> list[dict[str, Any]]:
    """Group schedules by product (description) and enrich with FG inventory data."""
    by_product: dict[str, list[Schedule]] = {}
    for s in schedules:
        by_product.setdefault(s.description, []).append(s)

    result = []
    for product_name, scheds in sorted(by_product.items()):
        total_ordered = sum(s.scheduled_qty for s in scheds if s.status in ACTIVE_STATUSES)
        total_backlog = sum(s.backlog_qty for s in scheds if s.status in ACTIVE_STATUSES)
        total_delivered = sum(s.scheduled_qty for s in scheds if s.status == "delivered")
        statuses = _status_counts(scheds)

        # Lookup matching FG inventory item
        fg = session.exec(
            select(InventoryItem).where(
                InventoryItem.name == product_name,
                InventoryItem.item_type == "finished_good",
            )
        ).first()

        # Next delivery date from active schedules
        active_dates = sorted(
            s.scheduled_date for s in scheds if s.status in ACTIVE_STATUSES
        )

        result.append({
            "product_name": product_name,
            "total_schedules": len(scheds),
            "active_schedules": sum(1 for s in scheds if s.status in ACTIVE_STATUSES),
            "total_ordered": total_ordered,
            "total_backlog": total_backlog,
            "total_delivered": total_delivered,
            "next_delivery_date": active_dates[0] if active_dates else None,
            "status_counts": statuses,
            "fg_item_id": fg.id if fg else None,
            "fg_available_qty": fg.quantity_on_hand if fg else None,
            "fg_unit": fg.unit if fg else None,
            "fg_code": fg.code if fg else None,
        })
    return result


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/names")
def list_customer_names(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[dict[str, Any]]:
    """
    Lightweight dropdown data — [{id, name}] sorted by name.
    Includes all customers in the Customer table.
    """
    customers = session.exec(select(Customer).order_by(Customer.name)).all()  # type: ignore[union-attr]
    return [{"id": c.id, "name": c.name} for c in customers]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_customer(
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """
    Create a new customer / OEM client (admin / super_admin only).
    Body: { name, contact_person?, phone?, email?, notes? }
    """
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Customer name is required")

    # Uniqueness check
    existing = session.exec(select(Customer).where(Customer.name == name)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Customer '{name}' already exists")

    customer = Customer(
        name=name,
        contact_person=(body.get("contact_person") or "").strip() or None,
        phone=(body.get("phone") or "").strip() or None,
        email=(body.get("email") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
    )
    session.add(customer)
    session.commit()
    session.refresh(customer)
    return {"id": customer.id, "name": customer.name}


@router.get("")
def list_customers(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
    search: str = "",
) -> list[dict[str, Any]]:
    """
    Returns one entry per customer (from the Customer table, enriched with
    schedule stats).  Customers with no schedules yet also appear.
    """
    # All registered customers
    registered = {c.name: c for c in session.exec(select(Customer).order_by(Customer.name)).all()}  # type: ignore[union-attr]

    all_schedules = list(session.exec(
        select(Schedule).where(Schedule.is_active == True)  # noqa: E712
    ).all())

    # Group schedules by customer
    by_customer: dict[str, list[Schedule]] = {}
    for s in all_schedules:
        by_customer.setdefault(s.customer_name, []).append(s)

    # Union of registered names + names that only appear in schedules
    all_names = sorted(set(registered.keys()) | set(by_customer.keys()))

    result = []
    for customer_name in all_names:
        if search and search.lower() not in customer_name.lower():
            continue

        scheds = by_customer.get(customer_name, [])
        active = [s for s in scheds if s.status in ACTIVE_STATUSES]
        total_active_qty = sum(s.scheduled_qty for s in active)
        total_backlog = sum(s.backlog_qty for s in active)
        total_delivered = sum(s.scheduled_qty for s in scheds if s.status == "delivered")
        products = sorted({s.description for s in scheds})
        active_products = sorted({s.description for s in active})

        all_dates = sorted(s.scheduled_date for s in scheds)
        next_dates = sorted(s.scheduled_date for s in active)

        c = registered.get(customer_name)
        result.append({
            "customer_name": customer_name,
            "customer_id": c.id if c else None,
            "contact_person": c.contact_person if c else None,
            "phone": c.phone if c else None,
            "email": c.email if c else None,
            "total_schedules": len(scheds),
            "active_schedules": len(active),
            "total_active_qty": total_active_qty,
            "total_backlog": total_backlog,
            "total_delivered": total_delivered,
            "products": products,
            "active_products": active_products,
            "next_delivery_date": next_dates[0] if next_dates else None,
            "last_schedule_date": all_dates[-1] if all_dates else None,
            "status_counts": _status_counts(scheds),
        })

    return result


@router.get("/{customer_name}")
def get_customer_detail(
    customer_name: str,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """
    Full detail for a single customer: all schedules + per-product breakdown.
    """
    schedules = list(session.exec(
        select(Schedule).where(
            Schedule.customer_name == customer_name,
            Schedule.is_active == True,  # noqa: E712
        ).order_by(Schedule.scheduled_date)  # type: ignore[union-attr]
    ).all())

    if not schedules:
        raise HTTPException(status_code=404, detail=f"Customer '{customer_name}' not found")

    active = [s for s in schedules if s.status in ACTIVE_STATUSES]
    total_active_qty = sum(s.scheduled_qty for s in active)
    total_backlog = sum(s.backlog_qty for s in active)
    total_delivered = sum(s.scheduled_qty for s in schedules if s.status == "delivered")

    schedule_list = [
        {
            "id": s.id,
            "schedule_number": s.schedule_number,
            "description": s.description,
            "scheduled_qty": s.scheduled_qty,
            "backlog_qty": s.backlog_qty,
            "scheduled_date": s.scheduled_date,
            "status": s.status,
            "notes": s.notes,
        }
        for s in schedules
    ]

    return {
        "customer_name": customer_name,
        "total_schedules": len(schedules),
        "active_schedules": len(active),
        "total_active_qty": total_active_qty,
        "total_backlog": total_backlog,
        "total_delivered": total_delivered,
        "status_counts": _status_counts(schedules),
        "schedules": schedule_list,
        "products": _product_summary(schedules, session),
    }
