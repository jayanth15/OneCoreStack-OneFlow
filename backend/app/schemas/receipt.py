"""Pydantic schemas for Receipt API."""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


# ── Create ─────────────────────────────────────────────────────────────────────

class ReceiptItemCreate(BaseModel):
    request_item_id: int
    quantity_delivered: float = 0.0
    condition: Optional[str] = None  # good | damaged | partial


class ReceiptCreate(BaseModel):
    request_id: int
    items: List[ReceiptItemCreate] = Field(default_factory=list)
    notes: Optional[str] = None


# ── Read ───────────────────────────────────────────────────────────────────────

class ReceiptItemRead(BaseModel):
    id: int
    receipt_id: int
    request_item_id: int
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    unit: Optional[str] = None
    quantity_requested: float
    quantity_delivered: float
    quantity_signed_off: Optional[float] = None
    discrepancy_note: Optional[str] = None
    condition: Optional[str] = None

    model_config = {"from_attributes": True}


class ReceiptRead(BaseModel):
    id: int
    receipt_number: str
    request_id: int
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    created_at: datetime
    signed_off_by_user_id: Optional[int] = None
    signed_off_by_username: Optional[str] = None
    signed_off_at: Optional[datetime] = None
    disputed_at: Optional[datetime] = None
    dispute_note: Optional[str] = None
    status: str
    notes: Optional[str] = None
    items: List[ReceiptItemRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# ── Signoff ────────────────────────────────────────────────────────────────────

class ReceiptSignoff(BaseModel):
    notes: Optional[str] = None


class ReceiptDispute(BaseModel):
    note: Optional[str] = None
