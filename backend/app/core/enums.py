"""Enums for roles, request statuses, and other string constants.

Replaces scattered string literals ("admin", "pending", "in_progress", etc.)
with typed enum values for consistency and to prevent typos.
"""
from enum import Enum


class Role(str, Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
    MANAGER = "manager"
    WORKER = "worker"


class RequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    IN_PROGRESS = "in_progress"
    CANCELLED = "cancelled"
    DELIVERED = "delivered"
    ACKNOWLEDGED = "acknowledged"
    RECEIVED = "received"


class ScheduleStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    IN_PRODUCTION = "in_production"
    DELIVERED = "delivered"
    DRAFT = "draft"


class PlanStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    IN_PRODUCTION = "in_production"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class OrderStatus(str, Enum):
    PENDING = "pending"
    IN_PRODUCTION = "in_production"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class JobCardStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class DispatchStatus(str, Enum):
    PENDING = "pending"
    DISPATCHED = "dispatched"
    CANCELLED = "cancelled"


class GatePassStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class PurchaseOrderStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    RECEIVED = "received"
    CANCELLED = "cancelled"


def is_admin_or_above(role: str) -> bool:
    """Check if a role string is admin or super_admin."""
    return role in (Role.ADMIN.value, Role.SUPER_ADMIN.value)
