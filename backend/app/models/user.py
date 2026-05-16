from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, max_length=64)
    password_hash: str
    role: str = Field(default="worker")  # super_admin | admin | manager | worker
    is_active: bool = Field(default=True)
    # Comma-separated inventory types this user may access (view).
    # Empty string = all types allowed (admin always sees all regardless).
    # Valid tokens: raw_material, finished_good, semi_finished, spare, consumable, attachment, weeder
    inventory_access: str = Field(default="")
    # Comma-separated inventory types this user may edit (add/update/remove items).
    # Empty = all types they can view; admin always has full edit access.
    inventory_edit: str = Field(default="")
    # Comma-separated department IDs this user can select when raising a request.
    # Empty = all departments (or the user's assigned depts if any).
    request_departments: str = Field(default="")
    # Comma-separated inventory types this user can raise requests for.
    # Empty = all inventory types.
    request_inventory: str = Field(default="")
    # Whether this user may create goods-received receipts for purchase requests.
    # Admin / super_admin can always create receipts regardless of this flag.
    can_create_receipt: bool = Field(default=False)
    # Whether this user may access the GRN (Goods Received Notes) module.
    # Admin / super_admin always have GRN access regardless of this flag.
    grn_access: bool = Field(default=False)
    # Access flags for additional modules
    dispatch_access: bool = Field(default=False)
    gate_pass_access: bool = Field(default=False)
    purchase_access: bool = Field(default=False)
    photo_base64: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
