"""Pydantic schemas for the unified Request API."""
from datetime import datetime
from typing import Optional, List, Literal

from pydantic import BaseModel, Field, model_validator

from app.models.request import (
    REQUEST_TYPE_INTERNAL_TRANSFER,
    REQUEST_TYPE_VENDOR_PURCHASE,
    REQUEST_TYPE_CUSTOMER_DISPATCH,
)
from app.models.request_customer_dispatch import (
    DISPATCH_INVENTORY_TYPE_WEEDER,
    DISPATCH_INVENTORY_TYPE_ATTACHMENT,
    DELIVERY_TYPE_DIRECT,
    DELIVERY_TYPE_TRANSPORT,
)


RequestType = Literal["internal_transfer", "vendor_purchase", "customer_dispatch"]
DispatchInventoryType = Literal["weeder", "attachment"]
DeliveryType = Literal["direct", "transport"]
RequestStatus = Literal["pending", "approved", "in_progress", "awaiting_signoff", "received", "not_approved", "cancelled"]


class RequestItemCreate(BaseModel):
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    quantity: float = 1.0
    timeline_days: Optional[int] = None
    department: Optional[str] = None


class RequestItemRead(BaseModel):
    id: int
    inventory_item_id: Optional[int] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    item_type: Optional[str] = None
    description: Optional[str] = None
    quantity: float
    timeline_days: Optional[int] = None
    department: Optional[str] = None
    department_label: Optional[str] = None
    item_status: Optional[str] = None
    accepted_by_username: Optional[str] = None
    accepted_at: Optional[datetime] = None
    acceptance_note: Optional[str] = None

    model_config = {"from_attributes": True}


class RequestCustomerDispatchCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_bought_by: Optional[str] = None
    delivery_type: Optional[DeliveryType] = None
    inventory_type: DispatchInventoryType = DISPATCH_INVENTORY_TYPE_WEEDER
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float = 1.0


class RequestCustomerDispatchRead(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_bought_by: Optional[str] = None
    delivery_type: Optional[str] = None
    inventory_type: str
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float

    model_config = {"from_attributes": True}


class RequestHistoryRead(BaseModel):
    id: int
    changed_by_username: Optional[str] = None
    change_type: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    note: Optional[str] = None
    changed_at: datetime

    model_config = {"from_attributes": True}


class RequestCreate(BaseModel):
    request_type: RequestType
    department: Optional[str] = None
    from_whom: Optional[str] = None
    notes: Optional[str] = None
    items: List[RequestItemCreate] = Field(default_factory=list)
    dispatch: Optional[RequestCustomerDispatchCreate] = None

    @model_validator(mode="after")
    def _validate_type_specific(self):
        if self.request_type == REQUEST_TYPE_VENDOR_PURCHASE and not self.from_whom:
            raise ValueError("from_whom is required when request_type=vendor_purchase")
        if self.request_type == REQUEST_TYPE_CUSTOMER_DISPATCH:
            if not self.dispatch:
                raise ValueError("dispatch is required when request_type=customer_dispatch")
            if not self.dispatch.customer_name:
                raise ValueError("dispatch.customer_name is required for customer dispatch")
        if self.request_type in (REQUEST_TYPE_INTERNAL_TRANSFER, REQUEST_TYPE_VENDOR_PURCHASE):
            if not self.items:
                raise ValueError("at least one line item is required for internal_transfer / vendor_purchase")
        return self


class RequestUpdate(BaseModel):
    department: Optional[str] = None
    from_whom: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[RequestItemCreate]] = None
    dispatch: Optional[RequestCustomerDispatchCreate] = None


class RequestRead(BaseModel):
    id: int
    sn_no: str
    request_type: str
    department: Optional[str] = None
    department_label: Optional[str] = None
    from_whom: Optional[str] = None
    quantity: float
    notes: Optional[str] = None
    status: str
    requested_by_user_id: Optional[int] = None
    requested_by_username: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    reviewed_by_user_id: Optional[int] = None
    reviewed_by_username: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_note: Optional[str] = None
    fulfilled_by_user_id: Optional[int] = None
    fulfilled_by_username: Optional[str] = None
    fulfillment_accepted_at: Optional[datetime] = None
    fulfillment_note: Optional[str] = None
    delivered_by_user_id: Optional[int] = None
    delivered_by_username: Optional[str] = None
    delivered_at: Optional[datetime] = None
    delivery_note: Optional[str] = None
    acknowledged_by_user_id: Optional[int] = None
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_note: Optional[str] = None
    is_active: bool
    items: List[RequestItemRead] = Field(default_factory=list)
    dispatch: Optional[RequestCustomerDispatchRead] = None
    history: List[RequestHistoryRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class RequestListRead(BaseModel):
    id: int
    sn_no: str
    request_type: str
    department: Optional[str] = None
    department_label: Optional[str] = None
    from_whom: Optional[str] = None
    quantity: float
    status: str
    requested_by_username: Optional[str] = None
    created_at: datetime
    is_active: bool
    delivered_by_username: Optional[str] = None
    delivered_at: Optional[datetime] = None
    acknowledged_by_username: Optional[str] = None
    acknowledged_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RequestReviewAction(BaseModel):
    decision: Literal["approve", "reject"]
    note: Optional[str] = None


class RequestItemAcceptAction(BaseModel):
    item_id: int
    decision: Literal["accept", "reject"] = "accept"
    note: Optional[str] = None


class RequestStatusUpdate(BaseModel):
    new_status: RequestStatus
    note: Optional[str] = None


class RequestDeliverAction(BaseModel):
    delivery_note: Optional[str] = None


class RequestAcknowledgeDeliveryAction(BaseModel):
    acknowledgment_note: Optional[str] = None
