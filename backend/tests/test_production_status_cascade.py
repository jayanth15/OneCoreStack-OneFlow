"""Tests for the production status cascade (job → order → plan → schedule).

Covers the downgrade paths fixed in the FG-completion cascade:
- completing all job cards + reaching FG target completes order → plan → schedule
- dropping actual_qty below target reverts order/plan/schedule back
- deleting a job card triggers re-propagation
"""
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.schedule import Schedule
from app.models.production_plan import ProductionPlan
from app.models.production_order import ProductionOrder
from app.models.production_process import ProductionProcess
from app.models.job_card import JobCard


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_production(session: Session) -> dict[str, int]:
    """Create schedule → plan (2 processes) → order with 2 job cards."""
    sched = Schedule(
        schedule_number="SCH-CAS-001",
        customer_name="Test Customer",
        description="Cascade Widget",
        scheduled_date="2026-08-15",
        scheduled_qty=10,
        status="confirmed",
    )
    session.add(sched)
    session.flush()

    plan = ProductionPlan(
        plan_number="PLN-CAS-001",
        title="Cascade Widget Plan",
        planned_qty=10,
        schedule_id=sched.id,  # type: ignore[arg-type]
        status="approved",
    )
    session.add(plan)
    session.flush()

    session.add(ProductionProcess(plan_id=plan.id, name="Cut", estimated_time_minutes=60, sequence=1))
    session.add(ProductionProcess(plan_id=plan.id, name="Assemble", estimated_time_minutes=60, sequence=2))

    order = ProductionOrder(order_number="ORD-CAS-001", production_plan_id=plan.id, status="open")
    session.add(order)
    session.flush()

    c1 = JobCard(card_number="JC-CAS-1", production_order_id=order.id, process_name="Cut", worker_name="w1", status="open")
    c2 = JobCard(card_number="JC-CAS-2", production_order_id=order.id, process_name="Assemble", worker_name="w2", status="open")
    session.add(c1)
    session.add(c2)
    session.commit()

    return {
        "schedule_id": sched.id,  # type: ignore[arg-type]
        "plan_id": plan.id,  # type: ignore[arg-type]
        "order_id": order.id,  # type: ignore[arg-type]
        "c1_id": c1.id,  # type: ignore[arg-type]
        "c2_id": c2.id,  # type: ignore[arg-type]
    }


def _complete_card(client: TestClient, token: str, card_id: int, actual_qty: float) -> None:
    resp = client.put(f"/api/v1/production/jobs/{card_id}", json={"actual_qty": actual_qty}, headers=_headers(token))
    assert resp.status_code == 200, resp.json()


def _statuses(session: Session, ids: dict[str, int]) -> tuple[str, str, str]:
    order = session.get(ProductionOrder, ids["order_id"])
    plan = session.get(ProductionPlan, ids["plan_id"])
    sched = session.get(Schedule, ids["schedule_id"])
    return order.status, plan.status, sched.status  # type: ignore[union-attr]


def test_completing_all_cards_reaches_fg_and_completes_cascade(client, session, admin_token):
    ids = _seed_production(session)
    _complete_card(client, admin_token, ids["c1_id"], 10)
    _complete_card(client, admin_token, ids["c2_id"], 10)

    order, plan, sched = _statuses(session, ids)
    assert order == "completed", f"order={order}"
    assert plan == "completed", f"plan={plan}"
    assert sched == "completed", f"sched={sched}"


def test_reducing_actual_qty_reverts_cascade(client, session, admin_token):
    ids = _seed_production(session)
    _complete_card(client, admin_token, ids["c1_id"], 10)
    _complete_card(client, admin_token, ids["c2_id"], 10)

    order, plan, sched = _statuses(session, ids)
    assert (order, plan, sched) == ("completed", "completed", "completed")

    # Drop Cut below the 10-unit target → everything reverts
    _complete_card(client, admin_token, ids["c1_id"], 2)

    order, plan, sched = _statuses(session, ids)
    assert order == "in_progress", f"order={order}"
    assert plan == "in_progress", f"plan={plan}"
    assert sched == "in_production", f"sched={sched}"


def test_partial_completion_stays_in_progress(client, session, admin_token):
    ids = _seed_production(session)
    _complete_card(client, admin_token, ids["c1_id"], 10)
    # Second card still open → order in_progress, plan in_progress, schedule in_production
    _complete_card(client, admin_token, ids["c2_id"], 0)

    order, plan, sched = _statuses(session, ids)
    assert order == "in_progress", f"order={order}"
    assert plan == "in_progress", f"plan={plan}"
    assert sched == "in_production", f"sched={sched}"


def test_deleting_job_card_reverts_completed_order(client, session, admin_token):
    ids = _seed_production(session)
    _complete_card(client, admin_token, ids["c1_id"], 10)
    _complete_card(client, admin_token, ids["c2_id"], 10)
    assert _statuses(session, ids) == ("completed", "completed", "completed")

    # Delete one card → FG drops below target → cascade reverts
    resp = client.delete(f"/api/v1/production/jobs/{ids['c2_id']}", headers=_headers(admin_token))
    assert resp.status_code == 204, resp.json()

    order, plan, sched = _statuses(session, ids)
    assert order == "in_progress", f"order={order}"
    assert plan == "in_progress", f"plan={plan}"
    assert sched == "in_production", f"sched={sched}"


def test_explicit_hours_worked_is_respected_on_create(client, session, admin_token):
    """Job card forms now ask for hours/minutes directly — the backend must
    NOT override an explicitly-provided hours_worked with a qty-based calc."""
    ids = _seed_production(session)
    resp = client.post(
        f"/api/v1/production/orders/{ids['order_id']}/jobs",
        json={
            "process_name": "Cut",
            "worker_name": "w1",
            "worker_names": ["w1"],
            "hours_worked": 4.5,
            "qty_produced": 0,
            "actual_qty": 0,
        },
        headers=_headers(admin_token),
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["hours_worked"] == 4.5, resp.json()


def test_auto_hours_from_qty_only_when_hours_absent(client, session, admin_token):
    """Back-compat: when no hours are sent, qty × est-time still computes hours."""
    ids = _seed_production(session)
    resp = client.post(
        f"/api/v1/production/orders/{ids['order_id']}/jobs",
        json={
            "process_name": "Cut",
            "worker_name": "w1",
            "worker_names": ["w1"],
            "qty_produced": 10,
        },
        headers=_headers(admin_token),
    )
    assert resp.status_code == 201, resp.json()
    assert resp.json()["hours_worked"] == 10.0, resp.json()  # 10 × 60 min ÷ 60


def test_update_job_keeps_explicit_hours(client, session, admin_token):
    """Editing a job card with hours_worked must not be recalculated."""
    ids = _seed_production(session)
    resp = client.post(
        f"/api/v1/production/orders/{ids['order_id']}/jobs",
        json={"process_name": "Cut", "worker_name": "w1", "worker_names": ["w1"], "hours_worked": 2.0},
        headers=_headers(admin_token),
    )
    job_id = resp.json()["id"]

    updated = client.put(
        f"/api/v1/production/jobs/{job_id}",
        json={"hours_worked": 3.0, "qty_produced": 0},
        headers=_headers(admin_token),
    )
    assert updated.status_code == 200, updated.json()
    assert updated.json()["hours_worked"] == 3.0, updated.json()
