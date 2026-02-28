"""
OneFlow comprehensive seed script.
Wipes oneflow.db and re-creates it with realistic sample data.

Run from backend/ directory:
    venv-linux/bin/python3 seed.py
"""
import os, sys
from datetime import datetime, timezone, date, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from sqlmodel import Session
from app.core.database import engine, init_db
from app.core.security import hash_password
from app.models.user import User
from app.models.department import Department
from app.models.user_department import UserDepartment
from app.models.inventory import InventoryItem
from app.models.bom_item import BomItem
from app.models.schedule import Schedule

# ── wipe old DB ──────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "oneflow.db")
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
    print(f"Deleted  {DB_PATH}")

# ── recreate all tables ───────────────────────────────────────────────────────
init_db()
print("Tables   created\n")

NOW = datetime.now(tz=timezone.utc)

def future_date(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()

with Session(engine) as s:

    # ── Departments ──────────────────────────────────────────────────────────
    depts = {
        "MFG":   Department(code="MFG",   name="Manufacturing",  is_active=True),
        "LOG":   Department(code="LOG",   name="Logistics",       is_active=True),
        "QC":    Department(code="QC",    name="Quality Control", is_active=True),
        "ADMIN": Department(code="ADMIN", name="Administration",  is_active=True),
    }
    for d in depts.values():
        s.add(d)
    s.flush()
    print(f"  Departments : {len(depts)}")

    # ── Users ────────────────────────────────────────────────────────────────
    users_seed = [
        # username,   password,     role,          active, dept
        ("superadmin", "super@123",  "super_admin", True,  "ADMIN"),
        ("admin",      "admin@123",  "admin",       True,  "ADMIN"),
        ("manager1",   "pass@1234",  "manager",     True,  "MFG"),
        ("manager2",   "pass@1234",  "manager",     True,  "LOG"),
        ("worker1",    "pass@1234",  "worker",      True,  "MFG"),
        ("worker2",    "pass@1234",  "worker",      True,  "MFG"),
        ("worker3",    "pass@1234",  "worker",      True,  "QC"),
        ("worker4",    "pass@1234",  "worker",      False, "LOG"),  # inactive
    ]
    for username, password, role, active, dept_code in users_seed:
        u = User(
            username=username,
            password_hash=hash_password(password),
            role=role,
            is_active=active,
            created_at=NOW,
        )
        s.add(u)
        s.flush()
        s.add(UserDepartment(user_id=u.id, department_id=depts[dept_code].id))
    print(f"  Users        : {len(users_seed)}")

    # ── Raw Materials ────────────────────────────────────────────────────────
    # code, name, unit, qty, reorder, storage_type, storage_location, rate
    rm_seed = [
        ("RM-001", "Steel Sheet 2mm",    "sheets",  240.0,  50.0, "shelf", "Rack A-1",  85.00),
        ("RM-002", "Aluminum Rod 20mm",  "pcs",     180.0,  40.0, "rack",  "Rack B-2", 120.00),
        ("RM-003", "Rubber Gasket 50mm", "pcs",     950.0, 200.0, "bin",   "Bin C-3",    8.50),
        ("RM-004", "Bolt M8 x 30",       "pcs",    4200.0, 500.0, "bin",   "Bin D-1",    1.20),
        ("RM-005", "Paint Black 1L",     "litres",   38.0,  10.0, "shelf", "Rack A-3", 280.00),
        ("RM-006", "Welding Wire 0.8mm", "kg",       22.0,   5.0, "shelf", "Rack E-1", 350.00),
        ("RM-007", "Zinc Primer 1L",     "litres",   15.0,   4.0, "shelf", "Rack A-3", 190.00),
    ]
    rm_items: dict[str, InventoryItem] = {}
    for code, name, unit, qty, reorder, stype, sloc, rate in rm_seed:
        item = InventoryItem(
            code=code, name=name, item_type="raw_material",
            unit=unit, quantity_on_hand=qty, reorder_level=reorder,
            storage_type=stype, storage_location=sloc, rate=rate,
            is_active=True, updated_at=NOW,
        )
        s.add(item); s.flush()
        rm_items[code] = item
    print(f"  Raw Materials: {len(rm_seed)}")

    # ── Finished Goods ───────────────────────────────────────────────────────
    fg_seed = [
        ("FG-001", "Bracket Assembly TB-4421", "pcs",  42.0, 10.0, "shelf", "FG Rack 1", 1850.00),
        ("FG-002", "Support Frame SF-200",     "pcs",  18.0,  5.0, "rack",  "FG Rack 2", 3400.00),
        ("FG-003", "Mounting Plate MP-100",    "pcs",  65.0, 15.0, "shelf", "FG Rack 1",  950.00),
    ]
    for code, name, unit, qty, reorder, stype, sloc, rate in fg_seed:
        s.add(InventoryItem(
            code=code, name=name, item_type="finished_good",
            unit=unit, quantity_on_hand=qty, reorder_level=reorder,
            storage_type=stype, storage_location=sloc, rate=rate,
            is_active=True, updated_at=NOW,
        ))
    print(f"  Finished Goods: {len(fg_seed)}")

    # ── Semi Finished Goods ──────────────────────────────────────────────────
    sfg_seed = [
        ("SFG-001", "Steel Bracket (Pre-Formed)", "pcs",  90.0, 20.0, "rack", "SFG Rack 1",  420.00),
        ("SFG-002", "Frame Sub-Assembly",          "pcs",  25.0,  8.0, "rack", "SFG Rack 1",  780.00),
        ("SFG-003", "Primed Mounting Plate",       "pcs", 110.0, 20.0, "rack", "SFG Rack 2",  320.00),
    ]
    for code, name, unit, qty, reorder, stype, sloc, rate in sfg_seed:
        s.add(InventoryItem(
            code=code, name=name, item_type="semi_finished",
            unit=unit, quantity_on_hand=qty, reorder_level=reorder,
            storage_type=stype, storage_location=sloc, rate=rate,
            is_active=True, updated_at=NOW,
        ))
    print(f"  Semi Finished: {len(sfg_seed)}")

    s.flush()

    # ── BOM ──────────────────────────────────────────────────────────────────
    # product_name must match InventoryItem.name for a Finished Good
    bom_seed = [
        # Bracket Assembly TB-4421
        ("Bracket Assembly TB-4421", "RM-001", 2.0,   "2 steel sheets per bracket"),
        ("Bracket Assembly TB-4421", "RM-004", 8.0,   "8 M8 bolts per bracket"),
        ("Bracket Assembly TB-4421", "RM-003", 2.0,   "2 rubber gaskets per bracket"),
        ("Bracket Assembly TB-4421", "RM-005", 0.1,   "100 ml paint per bracket"),
        # Support Frame SF-200
        ("Support Frame SF-200",     "RM-002", 3.0,   "3 aluminium rods per frame"),
        ("Support Frame SF-200",     "RM-006", 0.5,   "0.5 kg welding wire per frame"),
        ("Support Frame SF-200",     "RM-004", 12.0,  "12 bolts per frame"),
        ("Support Frame SF-200",     "RM-007", 0.2,   "200 ml zinc primer per frame"),
        # Mounting Plate MP-100
        ("Mounting Plate MP-100",    "RM-001", 1.0,   "1 steel sheet per plate"),
        ("Mounting Plate MP-100",    "RM-004", 4.0,   "4 bolts per plate"),
        ("Mounting Plate MP-100",    "RM-005", 0.05,  "50 ml paint per plate"),
    ]
    for product_name, rm_code, qty_per_unit, notes in bom_seed:
        s.add(BomItem(
            product_name=product_name,
            raw_material_id=rm_items[rm_code].id,
            qty_per_unit=qty_per_unit,
            notes=notes,
            is_active=True,
        ))
    print(f"  BOM entries  : {len(bom_seed)}")

    # ── Schedules ────────────────────────────────────────────────────────────
    # description must match a Finished Good name for the availability check
    schedules_seed = [
        # customer,             description,                days,  qty, backlog, status
        ("Tata Motors Ltd.",    "Bracket Assembly TB-4421", 30,   200,  0, "confirmed",     "Monthly order Q1"),
        ("Maruti Suzuki",       "Bracket Assembly TB-4421", 45,   150, 25, "in_production", "Expedite 25 backlog"),
        ("Mahindra & Mahindra", "Support Frame SF-200",     60,    80,  0, "pending",       "New OEM trial order"),
        ("Ashok Leyland",       "Support Frame SF-200",     20,    50, 10, "confirmed",     "Rush order"),
        ("Bajaj Auto",          "Mounting Plate MP-100",    15,   300,  0, "in_production", "Standard monthly"),
        ("Hero MotoCorp",       "Mounting Plate MP-100",    90,   500,  0, "pending",       "Bulk order Q2"),
        ("TVS Motor",           "Bracket Assembly TB-4421",  7,    75,  0, "delivered",     "Delivered last week"),
    ]
    for i, (customer, desc, days, qty, backlog, status, notes) in enumerate(schedules_seed, 1):
        s.add(Schedule(
            schedule_number=f"SCH-{i:04d}",
            customer_name=customer,
            description=desc,
            scheduled_date=future_date(days),
            scheduled_qty=qty,
            backlog_qty=backlog,
            status=status,
            notes=notes,
            is_active=True,
        ))
    print(f"  Schedules    : {len(schedules_seed)}")

    s.commit()

print("""
✅  Seed complete!

Login credentials
─────────────────────────────────────
  Role         Username     Password
  super_admin  superadmin   super@123
  admin        admin        admin@123
  manager      manager1     pass@1234
  worker       worker1      pass@1234
""")
