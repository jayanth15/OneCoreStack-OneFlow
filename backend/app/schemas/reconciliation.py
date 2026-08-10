from datetime import datetime

from pydantic import BaseModel


class ReconciliationIssue(BaseModel):
    code: str
    severity: str
    domain: str
    entity_id: int | None = None
    reference: str | None = None
    message: str
    expected: float | str | None = None
    actual: float | str | None = None


class ReconciliationSummary(BaseModel):
    issue_count: int
    critical_count: int
    warning_count: int
    info_count: int
    by_code: dict[str, int]
    scanned: dict[str, int]
    active_value_by_domain: dict[str, float]
    active_total_value: float


class InventoryReconciliationReport(BaseModel):
    generated_at: datetime
    summary: ReconciliationSummary
    issues: list[ReconciliationIssue]
