from typing import Optional

from sqlmodel import Field, SQLModel


# Valid inventory_type values for customer dispatch
DISPATCH_INVENTORY_TYPE_WEEDER = "weeder"
DISPATCH_INVENTORY_TYPE_ATTACHMENT = "attachment"
DISPATCH_INVENTORY_TYPES = (DISPATCH_INVENTORY_TYPE_WEEDER, DISPATCH_INVENTORY_TYPE_ATTACHMENT)

# Valid delivery_type values
DELIVERY_TYPE_DIRECT = "direct"
DELIVERY_TYPE_TRANSPORT = "transport"
DELIVERY_TYPES = (DELIVERY_TYPE_DIRECT, DELIVERY_TYPE_TRANSPORT)


class RequestCustomerDispatch(SQLModel, table=True):
    """Customer-dispatch child entity (1:1 with Request when request_type=customer_dispatch).

    Stores customer contact info and the single item being dispatched.
    """
    __tablename__ = "request_customer_dispatch"

    id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(unique=True, index=True)  # FK to request.id (1:1)

    # Customer info
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    customer_bought_by: Optional[str] = None

    # Delivery method
    delivery_type: Optional[str] = None  # direct | transport

    # The single item being dispatched
    inventory_type: str = Field(default=DISPATCH_INVENTORY_TYPE_WEEDER)
    item_id: Optional[int] = None
    item_sn_no: Optional[str] = None
    item_description: Optional[str] = None
    quantity: float = Field(default=1.0)
