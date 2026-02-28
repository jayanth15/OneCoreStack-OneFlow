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
from app.models.customer import Customer
from app.models.schedule import Schedule
from app.models.production_plan import ProductionPlan
from app.models.production_process import ProductionProcess
from app.models.production_order import ProductionOrder
from app.models.job_card import JobCard

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
    # ── Customers ────────────────────────────────────────────────────────────
    customer_names = [
        ("Tata Motors Ltd.", "Rajesh Sharma", "+91-22-6665-8888", "rajesh@tata.com"),
        ("Maruti Suzuki", "Anita Verma", "+91-124-4410000", "anita@maruti.co.in"),
        ("Mahindra & Mahindra", "Vikram Singh", "+91-22-2490-1441", "vikram@mahindra.com"),
        ("Ashok Leyland", "Priya Patel", "+91-44-2256-1000", "priya@ashokleyland.com"),
        ("Bajaj Auto", "Sunil Kumar", "+91-20-2720-5000", "sunil@bajaj.com"),
        ("Hero MotoCorp", "Meena Das", "+91-11-4604-6100", "meena@heromotocorp.com"),
        ("TVS Motor", "Arvind Rao", "+91-44-2852-2200", "arvind@tvs.com"),
    ]
    customers: dict[str, Customer] = {}
    for name, contact, phone, email in customer_names:
        c = Customer(name=name, contact_person=contact, phone=phone, email=email)
        s.add(c); s.flush()
        customers[name] = c
    print(f"  Customers    : {len(customer_names)}")
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
        # customer,             description,                days,  qty, backlog, status,           notes
        # SCH-0001: Has Plan PP-0001 (approved) + Order PO-0001 (in_progress) → in_production
        ("Tata Motors Ltd.",    "Bracket Assembly TB-4421", 30,   200,  0, "in_production", "Monthly order Q1"),
        # SCH-0002: Has Plan PP-0002 (in_progress via order) → in_production
        ("Maruti Suzuki",       "Bracket Assembly TB-4421", 45,   150, 25, "in_production", "Expedite 25 backlog"),
        # SCH-0003: Has Plan PP-0003 (draft) → confirmed (plan created but not started)
        ("Mahindra & Mahindra", "Support Frame SF-200",     60,    80,  0, "confirmed",     "New OEM trial order"),
        # SCH-0004: No plan yet → pending
        ("Ashok Leyland",       "Support Frame SF-200",     20,    50, 10, "pending",       "Rush order"),
        # SCH-0005: No plan → pending
        ("Bajaj Auto",          "Mounting Plate MP-100",    15,   300,  0, "pending",       "Standard monthly"),
        # SCH-0006: No plan → pending
        ("Hero MotoCorp",       "Mounting Plate MP-100",    90,   500,  0, "pending",       "Bulk order Q2"),
        # SCH-0007: Completed and delivered
        ("TVS Motor",           "Bracket Assembly TB-4421",  7,    75,  0, "delivered",     "Delivered last week"),
    ]
    for i, (customer, desc, days, qty, backlog, status, notes) in enumerate(schedules_seed, 1):
        s.add(Schedule(
            schedule_number=f"SCH-{i:04d}",
            customer_id=customers[customer].id if customer in customers else None,
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

    s.flush()

    # ── Production Plans with Processes ──────────────────────────────────────
    plan1 = ProductionPlan(
        plan_number="PP-0001",
        title="Bracket Assembly – Tata Q1 Batch",
        schedule_id=1,  # SCH-0001 Tata Motors (in_production)
        planned_qty=200,
        start_date=future_date(2),
        end_date=future_date(25),
        status="in_progress",   # has active order
        is_active=True,
    )
    plan2 = ProductionPlan(
        plan_number="PP-0002",
        title="Bracket Assembly – Maruti Batch",
        schedule_id=2,  # SCH-0002 Maruti (in_production)
        planned_qty=175,
        start_date=future_date(5),
        end_date=future_date(40),
        status="in_progress",   # has active order
        is_active=True,
    )
    plan3 = ProductionPlan(
        plan_number="PP-0003",
        title="Support Frame – Mahindra Trial",
        schedule_id=3,  # SCH-0003 Mahindra (confirmed)
        planned_qty=80,
        start_date=future_date(10),
        end_date=future_date(55),
        status="draft",         # not yet approved
        is_active=True,
    )
    s.add(plan1); s.add(plan2); s.add(plan3); s.flush()

    # Processes for Plan 1 (Bracket Assembly – Tata)
    pp1_processes = [
        ("Blanking", 1, "Laser-cut steel sheets to bracket blanks"),
        ("Forming", 2, "Press-brake forming"),
        ("Welding", 3, "TIG weld bracket joints"),
        ("Painting", 4, "Black paint finish coat"),
        ("Quality Check", 5, "Dimensional inspection + visual"),
    ]
    for name, seq, notes in pp1_processes:
        s.add(ProductionProcess(plan_id=plan1.id, name=name, sequence=seq, notes=notes))

    # Processes for Plan 2 (Bracket Assembly – Maruti, same product different batch)
    pp2_processes = [
        ("Blanking", 1, "Laser-cut steel sheets"),
        ("Forming", 2, "Press-brake forming"),
        ("Welding", 3, "TIG weld bracket joints"),
        ("Painting", 4, "Black paint finish coat"),
        ("Quality Check", 5, "Dimensional inspection + visual"),
    ]
    for name, seq, notes in pp2_processes:
        s.add(ProductionProcess(plan_id=plan2.id, name=name, sequence=seq, notes=notes))

    # Processes for Plan 3 (Support Frame – Mahindra)
    pp3_processes = [
        ("Cutting", 1, "Cut aluminium rods to length"),
        ("Welding", 2, "MIG weld frame assembly"),
        ("Primer Coat", 3, "Zinc primer pre-treatment"),
        ("Assembly", 4, "Bolt-up sub-assemblies"),
    ]
    for name, seq, notes in pp3_processes:
        s.add(ProductionProcess(plan_id=plan3.id, name=name, sequence=seq, notes=notes))

    s.flush()
    print(f"  Plans        : 3")
    print(f"  Processes    : {len(pp1_processes) + len(pp2_processes) + len(pp3_processes)}")

    # ── Production Orders ────────────────────────────────────────────────────
    order1 = ProductionOrder(
        order_number="PO-0001",
        production_plan_id=plan1.id,
        start_date=future_date(2),
        end_date=future_date(25),
        notes="First batch for Tata Motors",
        status="in_progress",
        is_active=True,
    )
    order2 = ProductionOrder(
        order_number="PO-0002",
        production_plan_id=plan2.id,
        start_date=future_date(5),
        end_date=future_date(40),
        notes="Batch for Maruti Suzuki",
        status="in_progress",
        is_active=True,
    )
    s.add(order1); s.add(order2); s.flush()

    # Job Cards for Order 1 (Tata – Bracket Assembly)
    job_seeds_1 = [
        ("Blanking",       "Die Set A-12",  "Laser CNC #3",   "worker1",  6.5, 120, 80),
        ("Forming",        "Die Set B-07",  "Press Brake #1",  "worker2",  4.0,  80, 120),
        ("Welding",        None,            "TIG Station #2",  "worker1",  0.0,   0, 200),
    ]
    jc_num = 1
    for proc, td, machine, worker, hours, produced, pending in job_seeds_1:
        jc_status = "in_progress" if produced > 0 else "open"
        s.add(JobCard(
            card_number=f"JC-{jc_num:04d}",
            production_order_id=order1.id,
            process_name=proc,
            tool_die_number=td,
            machine_name=machine,
            worker_name=worker,
            hours_worked=hours,
            qty_produced=produced,
            qty_pending=pending,
            start_date=future_date(2) if produced > 0 else None,
            status=jc_status,
            is_active=True,
        ))
        jc_num += 1

    # Job Cards for Order 2 (Maruti – Bracket Assembly)
    job_seeds_2 = [
        ("Blanking",       "Die Set A-12",  "Laser CNC #3",   "worker2",  3.0,  50, 125),
        ("Forming",        "Die Set B-07",  "Press Brake #1",  "worker1",  0.0,   0, 175),
    ]
    for proc, td, machine, worker, hours, produced, pending in job_seeds_2:
        jc_status = "in_progress" if produced > 0 else "open"
        s.add(JobCard(
            card_number=f"JC-{jc_num:04d}",
            production_order_id=order2.id,
            process_name=proc,
            tool_die_number=td,
            machine_name=machine,
            worker_name=worker,
            hours_worked=hours,
            qty_produced=produced,
            qty_pending=pending,
            start_date=future_date(5) if produced > 0 else None,
            status=jc_status,
            is_active=True,
        ))
        jc_num += 1

    s.flush()
    print(f"  Orders       : 2")
    print(f"  Job Cards    : {len(job_seeds_1) + len(job_seeds_2)}")

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
