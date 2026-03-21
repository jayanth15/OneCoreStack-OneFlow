"""
OneFlow comprehensive seed script.
Wipes the database and re-creates it with realistic sample data.

Run from backend/ directory:
    venv-linux/bin/python3 seed.py
"""
import os, sys
from datetime import datetime, timezone, date, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from sqlmodel import Session
from app.core.config import settings
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
from app.models.work_type import WorkType
from app.models.work_log import WorkLog

# ── resolve DB file path from the configured DATABASE_URL ────────────────────
if settings.database_url.startswith("sqlite:///"):
    raw = settings.database_url[len("sqlite:///"):]
    DB_PATH = raw if os.path.isabs(raw) else os.path.join(os.path.dirname(__file__), raw)
else:
    DB_PATH = None  # non-SQLite; skip file deletion

print(f"DATABASE_URL : {settings.database_url}")
if DB_PATH:
    print(f"DB file path : {DB_PATH}")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print(f"Deleted      {DB_PATH}")
    else:
        print(f"(file did not exist, creating fresh)")

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
        ("mohan", "mohan@123",  "super_admin", True,  "ADMIN"),
        ("chadran",      "chandran@123",  "super_admin",       True,  "ADMIN"),
    ]
    created_users = {}
    for u in users_seed:
        user = User(
            username=u[0],
            password_hash=hash_password(u[1]),
            role=u[2],
            is_active=u[3],
        )
        s.add(user)
        created_users[u[0]] = (user, u[4])
    s.flush()

    # Link users to departments
    for username, (user, dept_code) in created_users.items():
        s.add(UserDepartment(user_id=user.id, department_id=depts[dept_code].id))
    s.flush()
    print(f"  Users       : {len(users_seed)}")

    s.commit()

print("""
    ✅  Seed complete!

    Login credentials
    ─────────────────────────────────────
    Role         Username     Password
    super_admin  mohan        mohan@123
    super_admin  chadran      chandran@123
    """)
