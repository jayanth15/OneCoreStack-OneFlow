"""Pydantic schemas for the RequestReceipt API."""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class RequestReceiptCreate(BaseModel):
    request_id: int
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    quantity_requested: float = 0.0
    quantity_received: float = 0.0
    notes: Optional[str] = None
    department: Optional[str] = None


class RequestReceiptRead(BaseModel):
    id: int
    sn_no: str
    request_id: int
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    quantity_requested: float
    quantity_received: float
    notes: Optional[str] = None
    department: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    status: str
    acknowledged_by_user_id: Optional[int] = None
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RequestReceiptAcknowledge(BaseModel):
    note: Optional[str] = None
