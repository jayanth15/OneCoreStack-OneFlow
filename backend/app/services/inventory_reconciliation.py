"""Read-only inventory consistency checks across all stock domains."""
from collections import Counter
from datetime import datetime, timezone
from app.core.timezone import now
from math import isclose

from sqlmodel import Session, select

from app.models.attachment_history import AttachmentHistory
from app.models.attachment_item import AttachmentItem
from app.models.consumable import Consumable
from app.models.consumable_history import ConsumableHistory
from app.models.dispatch import Dispatch
from app.models.inventory import InventoryItem
from app.models.inventory_history import InventoryHistory
from app.models.request import REQUEST_TYPE_INTERNAL_TRANSFER, Request
from app.models.request_item import RequestItem
from app.models.spare_item import SpareItem
from app.models.spare_item_history import SpareItemHistory
from app.models.spare_item_variant import SpareItemVariant
from app.models.weeder_history import WeederHistory
from app.models.weeder_item import WeederItem
from app.schemas.reconciliation import (
    InventoryReconciliationReport,
    ReconciliationIssue,
    ReconciliationSummary,
)

_EPSILON = 1e-6


def build_inventory_reconciliation(session: Session) -> InventoryReconciliationReport:
    """Inspect inventory invariants without flushing or committing the session."""
    issues: list[ReconciliationIssue] = []

    inventory = list(session.exec(select(InventoryItem)).all())
    consumables = list(session.exec(select(Consumable)).all())
    weeders = list(session.exec(select(WeederItem)).all())
    attachments = list(session.exec(select(AttachmentItem)).all())
    spare_items = list(session.exec(select(SpareItem)).all())
    spare_variants = list(session.exec(select(SpareItemVariant)).all())
    requests = list(
        session.exec(
            select(Request).where(
                Request.request_type == REQUEST_TYPE_INTERNAL_TRANSFER,
                Request.status.in_(["awaiting_signoff", "received"]),  # type: ignore[union-attr]
            )
        ).all()
    )
    dispatches = list(
        session.exec(
            select(Dispatch).where(
                Dispatch.status.in_(["dispatched", "delivered"]),  # type: ignore[union-attr]
            )
        ).all()
    )

    _check_simple_domain(
        issues,
        domain="inventory",
        items=inventory,
        quantity_attr="quantity_on_hand",
        label=lambda item: item.code or item.name,
        histories=list(session.exec(select(InventoryHistory)).all()),
        history_item_attr="inventory_item_id",
        history_quantity_attr="quantity_after",
    )
    _check_simple_domain(
        issues,
        domain="consumable",
        items=consumables,
        quantity_attr="qty",
        label=lambda item: item.code or item.name,
        histories=list(session.exec(select(ConsumableHistory)).all()),
        history_item_attr="consumable_id",
        history_quantity_attr="qty_after",
    )
    _check_simple_domain(
        issues,
        domain="weeder",
        items=weeders,
        quantity_attr="qty",
        label=lambda item: item.sn_no or item.name or f"Weeder #{item.id}",
        histories=list(session.exec(select(WeederHistory)).all()),
        history_item_attr="weeder_id",
        history_quantity_attr="qty_after",
    )
    _check_simple_domain(
        issues,
        domain="attachment",
        items=attachments,
        quantity_attr="qty",
        label=lambda item: item.sn_no or item.description or f"Attachment #{item.id}",
        histories=list(session.exec(select(AttachmentHistory)).all()),
        history_item_attr="attachment_id",
        history_quantity_attr="qty_after",
    )

    spare_histories = list(session.exec(select(SpareItemHistory)).all())
    _check_spares(issues, spare_items, spare_variants, spare_histories)
    _check_request_evidence(
        session,
        issues,
        requests,
        inventory_histories=list(session.exec(select(InventoryHistory)).all()),
        consumable_histories=list(session.exec(select(ConsumableHistory)).all()),
        weeder_histories=list(session.exec(select(WeederHistory)).all()),
        attachment_histories=list(session.exec(select(AttachmentHistory)).all()),
        spare_histories=spare_histories,
    )
    _check_dispatch_evidence(issues, dispatches)

    active_value_by_domain = _active_values(
        inventory, consumables, weeders, attachments, spare_items, spare_variants
    )
    counts = Counter(issue.severity for issue in issues)
    by_code = Counter(issue.code for issue in issues)
    scanned = {
        "inventory": len(inventory),
        "consumables": len(consumables),
        "weeders": len(weeders),
        "attachments": len(attachments),
        "spare_items": len(spare_items),
        "spare_variants": len(spare_variants),
        "completed_internal_requests": len(requests),
        "completed_dispatches": len(dispatches),
    }
    return InventoryReconciliationReport(
        generated_at=now(),
        summary=ReconciliationSummary(
            issue_count=len(issues),
            critical_count=counts["critical"],
            warning_count=counts["warning"],
            info_count=counts["info"],
            by_code=dict(sorted(by_code.items())),
            scanned=scanned,
            active_value_by_domain=active_value_by_domain,
            active_total_value=round(sum(active_value_by_domain.values()), 2),
        ),
        issues=issues,
    )


def _check_simple_domain(
    issues: list[ReconciliationIssue],
    *,
    domain: str,
    items: list,
    quantity_attr: str,
    label,
    histories: list,
    history_item_attr: str,
    history_quantity_attr: str,
) -> None:
    latest: dict[int, object] = {}
    for history in histories:
        item_id = getattr(history, history_item_attr)
        current = latest.get(item_id)
        if current is None or (history.changed_at, history.id or 0) > (
            current.changed_at,
            current.id or 0,
        ):
            latest[item_id] = history

    for item in items:
        quantity = float(getattr(item, quantity_attr))
        reference = str(label(item))
        if quantity < -_EPSILON:
            issues.append(
                _issue(
                    "negative_quantity", "critical", domain, item.id, reference,
                    "Quantity on hand is below zero.", expected=0.0, actual=quantity,
                )
            )
        if not item.is_active and abs(quantity) > _EPSILON:
            issues.append(
                _issue(
                    "inactive_item_has_stock", "warning", domain, item.id, reference,
                    "Inactive item still carries quantity and can inflate historical totals.",
                    expected=0.0, actual=quantity,
                )
            )
        history = latest.get(item.id)
        history_quantity = getattr(history, history_quantity_attr) if history else None
        if history_quantity is not None and not isclose(
            quantity, float(history_quantity), abs_tol=_EPSILON
        ):
            issues.append(
                _issue(
                    "history_balance_mismatch", "warning", domain, item.id, reference,
                    "Current quantity does not match the latest stock-history balance.",
                    expected=float(history_quantity), actual=quantity,
                )
            )


def _check_spares(
    issues: list[ReconciliationIssue],
    parents: list[SpareItem],
    variants: list[SpareItemVariant],
    histories: list[SpareItemHistory],
) -> None:
    variants_by_parent: dict[int, list[SpareItemVariant]] = {}
    for variant in variants:
        variants_by_parent.setdefault(variant.spare_item_id, []).append(variant)
        if variant.qty < -_EPSILON:
            issues.append(
                _issue(
                    "negative_quantity", "critical", "spare", variant.id,
                    variant.serial_number or variant.variant_color or f"Variant #{variant.id}",
                    "Spare variant quantity is below zero.", expected=0.0, actual=variant.qty,
                )
            )
        if not variant.is_active and abs(variant.qty) > _EPSILON:
            issues.append(
                _issue(
                    "inactive_item_has_stock", "warning", "spare", variant.id,
                    variant.serial_number or variant.variant_color or f"Variant #{variant.id}",
                    "Inactive spare variant still carries quantity.",
                    expected=0.0, actual=variant.qty,
                )
            )

    latest_parent: dict[int, SpareItemHistory] = {}
    for history in histories:
        current = latest_parent.get(history.spare_item_id)
        if current is None or (history.changed_at, history.id or 0) > (
            current.changed_at,
            current.id or 0,
        ):
            latest_parent[history.spare_item_id] = history

    for parent in parents:
        active_variants = [v for v in variants_by_parent.get(parent.id, []) if v.is_active]
        variant_total = sum(v.qty for v in active_variants)
        if parent.recorded_qty < -_EPSILON:
            issues.append(
                _issue(
                    "negative_quantity", "critical", "spare", parent.id, parent.part_number or parent.name,
                    "Spare parent quantity is below zero.", expected=0.0, actual=parent.recorded_qty,
                )
            )
        if not parent.is_active and abs(parent.recorded_qty) > _EPSILON:
            issues.append(
                _issue(
                    "inactive_item_has_stock", "warning", "spare", parent.id, parent.part_number or parent.name,
                    "Inactive spare item still carries quantity.", expected=0.0, actual=parent.recorded_qty,
                )
            )
        if active_variants and not isclose(parent.recorded_qty, variant_total, abs_tol=_EPSILON):
            issues.append(
                _issue(
                    "spare_parent_variant_mismatch", "warning", "spare", parent.id,
                    parent.part_number or parent.name,
                    "Parent recorded quantity differs from its active variant total.",
                    expected=variant_total, actual=parent.recorded_qty,
                )
            )
        history = latest_parent.get(parent.id)
        if history and not isclose(parent.recorded_qty, history.qty_after, abs_tol=_EPSILON):
            issues.append(
                _issue(
                    "history_balance_mismatch", "warning", "spare", parent.id,
                    parent.part_number or parent.name,
                    "Current parent quantity does not match the latest stock-history balance.",
                    expected=history.qty_after, actual=parent.recorded_qty,
                )
            )


def _check_request_evidence(
    session: Session,
    issues: list[ReconciliationIssue],
    requests: list[Request],
    *,
    inventory_histories: list[InventoryHistory],
    consumable_histories: list[ConsumableHistory],
    weeder_histories: list[WeederHistory],
    attachment_histories: list[AttachmentHistory],
    spare_histories: list[SpareItemHistory],
) -> None:
    evidence = {
        "inventory": {(h.inventory_item_id, h.notes) for h in inventory_histories},
        "consumable": {(h.consumable_id, h.note) for h in consumable_histories},
        "weeder": {(h.weeder_id, h.note) for h in weeder_histories},
        "attachment": {(h.attachment_id, h.note) for h in attachment_histories},
        "spare": {(h.spare_item_variant_id, h.note) for h in spare_histories},
    }
    generic_types = {"raw_material", "finished_good", "semi_finished", "scrap"}
    for request in requests:
        note = f"Fulfilled request {request.sn_no}"
        items = session.exec(
            select(RequestItem).where(RequestItem.request_id == request.id)
        ).all()
        for item in items:
            if (
                item.item_status != "delivered"
                or item.inventory_item_id is None
                or not item.item_type
                or item.quantity <= 0
            ):
                continue
            evidence_domain = "inventory" if item.item_type in generic_types else item.item_type
            if (item.inventory_item_id, note) not in evidence.get(evidence_domain, set()):
                issues.append(
                    _issue(
                        "missing_request_deduction_evidence", "critical", evidence_domain,
                        item.inventory_item_id, request.sn_no,
                        f"Delivered request item '{item.item_name or item.item_code or item.id}' has no matching stock-history deduction.",
                        expected=note, actual="not found",
                    )
                )


def _check_dispatch_evidence(
    issues: list[ReconciliationIssue], dispatches: list[Dispatch]
) -> None:
    for dispatch in dispatches:
        if dispatch.party_type == "vendor" and dispatch.inventory_deducted_at is None:
            issues.append(
                _issue(
                    "missing_dispatch_deduction_evidence", "critical", "dispatch",
                    dispatch.id, dispatch.dispatch_number,
                    "Completed vendor dispatch has no inventory deduction marker.",
                    expected="inventory_deducted_at", actual="missing",
                )
            )
        if dispatch.party_type == "supplier" and dispatch.receipt_id is None:
            issues.append(
                _issue(
                    "supplier_dispatch_missing_receipt", "critical", "dispatch",
                    dispatch.id, dispatch.dispatch_number,
                    "Completed supplier dispatch has no linked receipt.",
                    expected="receipt_id", actual="missing",
                )
            )


def _active_values(
    inventory: list[InventoryItem],
    consumables: list[Consumable],
    weeders: list[WeederItem],
    attachments: list[AttachmentItem],
    spare_items: list[SpareItem],
    spare_variants: list[SpareItemVariant],
) -> dict[str, float]:
    values = {
        "inventory": sum(i.quantity_on_hand * (i.rate or 0) for i in inventory if i.is_active),
        "consumables": sum(i.qty * (i.rate_per_unit or 0) for i in consumables if i.is_active),
        "weeders": sum(i.qty * (i.rate_per_unit or 0) for i in weeders if i.is_active),
        "attachments": sum(i.qty * (i.rate_per_unit or 0) for i in attachments if i.is_active),
        "spares": 0.0,
    }
    active_parents = {item.id: item for item in spare_items if item.is_active}
    parent_ids_with_variants: set[int] = set()
    for variant in spare_variants:
        parent = active_parents.get(variant.spare_item_id)
        if not parent or not variant.is_active:
            continue
        parent_ids_with_variants.add(parent.id)
        values["spares"] += variant.qty * (
            variant.rate if variant.rate is not None else (parent.rate or 0)
        )
    values["spares"] += sum(
        parent.recorded_qty * (parent.rate or 0)
        for parent in active_parents.values()
        if parent.id not in parent_ids_with_variants
    )
    return {key: round(value, 2) for key, value in values.items()}


def _issue(
    code: str,
    severity: str,
    domain: str,
    entity_id: int | None,
    reference: str | None,
    message: str,
    *,
    expected: float | str | None,
    actual: float | str | None,
) -> ReconciliationIssue:
    return ReconciliationIssue(
        code=code,
        severity=severity,
        domain=domain,
        entity_id=entity_id,
        reference=reference,
        message=message,
        expected=expected,
        actual=actual,
    )
