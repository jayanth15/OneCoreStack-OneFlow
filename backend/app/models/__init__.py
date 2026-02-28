# Models package — import all table models here so SQLModel.metadata is populated
from app.models.bom_item import BomItem  # noqa: F401
from app.models.customer import Customer  # noqa: F401
from app.models.department import Department  # noqa: F401
from app.models.inventory import InventoryItem  # noqa: F401
from app.models.inventory_history import InventoryHistory  # noqa: F401
from app.models.job_card import JobCard  # noqa: F401
from app.models.production_plan import ProductionPlan  # noqa: F401
from app.models.production_process import ProductionProcess  # noqa: F401
from app.models.schedule import Schedule  # noqa: F401
from app.models.token import RefreshToken  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.user_department import UserDepartment  # noqa: F401
