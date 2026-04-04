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
from app.models.attachment_item import AttachmentItem
from app.models.weeder_item import WeederItem
from app.models.spare_category import SpareCategory
from app.models.spare_sub_category import SpareSubCategory
from app.models.spare_item import SpareItem
from app.models.spare_item_variant import SpareItemVariant

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
        "PRD": Department(code="PRD", name="Production",  is_active=True),
        "SPR": Department(code="SPR", name="Spares",      is_active=True),
        "MKT": Department(code="MKT", name="Marketing",   is_active=True),
        "PUR": Department(code="PUR", name="Purchase",    is_active=True),
    }
    for d in depts.values():
        s.add(d)
    s.flush()
    print(f"  Departments : {len(depts)}")

    # ── Users ────────────────────────────────────────────────────────────────
    users_seed = [
        # username,   password,     role,          active, dept
        ("mohan", "mohan@123",  "super_admin", True,  "PRD"),
        ("chadran",      "chandran@123",  "super_admin",       True,  "PRD"),
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

    # ── Attachment Items ─────────────────────────────────────────────────────
    attachments_seed = [
        ("ATT-001", "Rotavator Attachment 3-pt",  12.0, 5.0,  28500.0, "Warehouse A - Rack 1"),
        ("ATT-002", "MB Plough - Single Bottom",  8.0,  3.0,  15000.0, "Warehouse A - Rack 2"),
        ("ATT-003", "Disc Harrow 16-disc",        5.0,  2.0,  42000.0, "Warehouse B - Bay 1"),
        ("ATT-004", "Cultivator 9-tine",          3.0,  2.0,  18500.0, "Warehouse B - Bay 2"),
        ("ATT-005", "Rear Blade / Land Leveller",  7.0,  3.0,  22000.0, "Warehouse A - Rack 3"),
    ]
    for sn, desc, qty, rl, rate, loc in attachments_seed:
        s.add(AttachmentItem(
            sn_no=sn, description=desc, qty=qty, reorder_level=rl,
            rate_per_unit=rate, storage_location=loc,
            is_active=True, created_at=NOW, updated_at=NOW,
        ))
    print(f"  Attachments : {len(attachments_seed)}")

    # ── Weeder Items ─────────────────────────────────────────────────────────
    weeders_seed = [
        ("WDR-001", "Inter-row Weeder 5-row",       10.0, 4.0,  12000.0, "Shed C - Section 1"),
        ("WDR-002", "Wheel Hoe Weeder",              6.0,  3.0,   4500.0, "Shed C - Section 2"),
        ("WDR-003", "Power Weeder 5HP",              4.0,  2.0,  38000.0, "Shed D - Bay A"),
        ("WDR-004", "Hand-push Row Weeder",         15.0,  5.0,   2800.0, "Shed C - Section 3"),
        ("WDR-005", "Rotary Weeder Drum Type",       3.0,  2.0,   9500.0, "Shed D - Bay B"),
    ]
    for sn, desc, qty, rl, rate, loc in weeders_seed:
        s.add(WeederItem(
            sn_no=sn, description=desc, qty=qty, reorder_level=rl,
            rate_per_unit=rate, storage_location=loc,
            is_active=True, created_at=NOW, updated_at=NOW,
        ))
    print(f"  Weeders     : {len(weeders_seed)}")

    # ── Spare Categories / Sub-categories / Items ────────────────────────────
    # 1 category × 5 sub-categories × 10 items = 50 spare items
    SPARE_DATA = [
        # (category_name, [
        #     (sub_name, sub_description, [
        #         (name, part_number, part_description, rate, unit, opening_qty, reorder_level, storage_type, storage_location),
        #         ...
        #     ]),
        # ]),
        ("2-Wheeler Spares", [
            ("Engine Parts", "Internal engine components for 2-wheelers", [
                ("Piston Ring Set",      "ENG-001", "Standard bore piston ring set",         450.0,  "set",  20.0, 5.0,  "Rack",  "Rack A-1, Shelf 1"),
                ("Cylinder Gasket",      "ENG-002", "Head gasket for 168cc engine",          180.0,  "pcs",  30.0, 8.0,  "Bin",   "Rack A-1, Shelf 2"),
                ("Crankshaft Bearing",   "ENG-003", "Main crankshaft bearing pair",          320.0,  "set",  15.0, 4.0,  "Bin",   "Rack A-1, Shelf 3"),
                ("Valve Spring Set",     "ENG-004", "Intake and exhaust valve springs",      210.0,  "set",  25.0, 6.0,  "Bin",   "Rack A-1, Shelf 4"),
                ("Oil Seal Kit",         "ENG-005", "Complete engine oil seal kit",          380.0,  "set",  18.0, 5.0,  "Box",   "Rack A-1, Shelf 5"),
                ("Rocker Arm",           "ENG-006", "Rocker arm assembly with adjuster",     260.0,  "pcs",  12.0, 3.0,  "Bin",   "Rack A-2, Shelf 1"),
                ("Push Rod",             "ENG-007", "Valve push rod 168cc",                  95.0,   "pcs",  20.0, 5.0,  "Rack",  "Rack A-2, Shelf 2"),
                ("Timing Chain",         "ENG-008", "Cam timing chain 82 links",            420.0,  "pcs",  10.0, 3.0,  "Box",   "Rack A-2, Shelf 3"),
                ("Camshaft Sprocket",    "ENG-009", "Camshaft drive sprocket 20T",           310.0,  "pcs",  8.0,  2.0,  "Bin",   "Rack A-2, Shelf 4"),
                ("Connecting Rod",       "ENG-010", "Con-rod assembly complete",             780.0,  "pcs",  6.0,  2.0,  "Rack",  "Rack A-2, Shelf 5"),
                ("Piston Assembly",       "ENG-011", "Complete piston with pin & clips",      620.0,  "set",  10.0, 3.0,  "Bin",   "Rack A-3, Shelf 1"),
                ("Cylinder Block",        "ENG-012", "Bare cylinder block 168cc rebored",    1850.0,  "pcs",  3.0,  1.0,  "Shelf", "Rack A-3, Shelf 2"),
            ]),
            ("Transmission & Clutch", "Gearbox and clutch components", [
                ("Clutch Plate Set",     "TRN-001", "4-plate friction clutch set",          550.0,  "set",  15.0, 4.0,  "Box",   "Rack B-1, Shelf 1"),
                ("Clutch Spring Set",    "TRN-002", "Clutch pressure springs (set of 6)",  140.0,  "set",  20.0, 5.0,  "Bin",   "Rack B-1, Shelf 2"),
                ("Gear Shift Fork",      "TRN-003", "Primary gear shift fork",              220.0,  "pcs",  10.0, 3.0,  "Bin",   "Rack B-1, Shelf 3"),
                ("Drive Sprocket 14T",   "TRN-004", "Engine output sprocket 14 teeth",     175.0,  "pcs",  18.0, 5.0,  "Bin",   "Rack B-1, Shelf 4"),
                ("Rear Sprocket 37T",    "TRN-005", "Rear wheel sprocket 37 teeth",         390.0,  "pcs",  12.0, 3.0,  "Rack",  "Rack B-1, Shelf 5"),
                ("Drive Chain 428H",     "TRN-006", "Heavy-duty drive chain 428H×110L",    480.0,  "pcs",  10.0, 3.0,  "Box",   "Rack B-2, Shelf 1"),
                ("Clutch Cable",         "TRN-007", "Clutch actuation cable 1.2m",         85.0,   "pcs",  25.0, 8.0,  "Rack",  "Rack B-2, Shelf 2"),
                ("Gear Selector Drum",   "TRN-008", "5-speed selector drum",               430.0,  "pcs",  5.0,  2.0,  "Bin",   "Rack B-2, Shelf 3"),
                ("Kick Start Shaft",     "TRN-009", "Kick-start spindle with spring",      290.0,  "pcs",  8.0,  2.0,  "Bin",   "Rack B-2, Shelf 4"),
                ("Primary Chain",        "TRN-010", "Primary drive chain 219×66L",         210.0,  "pcs",  14.0, 4.0,  "Box",   "Rack B-2, Shelf 5"),
                ("Gear Shift Lever",      "TRN-011", "Foot gear shift lever assembly",        185.0,  "pcs",  10.0, 3.0,  "Bin",   "Rack B-3, Shelf 1"),
                ("Clutch Hub",            "TRN-012", "Clutch basket inner hub",               740.0,  "pcs",  6.0,  2.0,  "Rack",  "Rack B-3, Shelf 2"),
            ]),
            ("Brakes & Wheels", "Brake system and wheel components", [
                ("Brake Shoe Set Front", "BRK-001", "Front drum brake shoe pair",           240.0,  "set",  20.0, 5.0,  "Bin",   "Rack C-1, Shelf 1"),
                ("Brake Shoe Set Rear",  "BRK-002", "Rear drum brake shoe pair",            240.0,  "set",  20.0, 5.0,  "Bin",   "Rack C-1, Shelf 2"),
                ("Brake Cable Front",    "BRK-003", "Front brake cable assembly",           75.0,   "pcs",  30.0, 8.0,  "Rack",  "Rack C-1, Shelf 3"),
                ("Brake Cable Rear",     "BRK-004", "Rear brake cable assembly",            75.0,   "pcs",  30.0, 8.0,  "Rack",  "Rack C-1, Shelf 4"),
                ("Wheel Bearing F6301",  "BRK-005", "Front wheel bearing 6301-2RS",         120.0,  "pcs",  40.0, 10.0, "Bin",   "Rack C-1, Shelf 5"),
                ("Wheel Bearing F6202",  "BRK-006", "Rear wheel bearing 6202-2RS",          120.0,  "pcs",  40.0, 10.0, "Bin",   "Rack C-2, Shelf 1"),
                ("Brake Drum Front",     "BRK-007", "Front brake drum assembly",            680.0,  "pcs",  8.0,  2.0,  "Rack",  "Rack C-2, Shelf 2"),
                ("Brake Drum Rear",      "BRK-008", "Rear brake drum assembly",             680.0,  "pcs",  8.0,  2.0,  "Rack",  "Rack C-2, Shelf 3"),
                ("Spoke Set 36pc",       "BRK-009", "Wheel spoke set 36 pcs with nipples", 310.0,  "set",  6.0,  2.0,  "Box",   "Rack C-2, Shelf 4"),
                ("Tyre Tube 2.75-17",    "BRK-010", "Inner tube 2.75-17 TR4 valve",        185.0,  "pcs",  15.0, 4.0,  "Shelf", "Rack C-2, Shelf 5"),
                ("Brake Panel Front",     "BRK-011", "Front brake cam panel plate",           310.0,  "pcs",  8.0,  2.0,  "Bin",   "Rack C-3, Shelf 1"),
                ("Axle Nut Set",          "BRK-012", "Front & rear axle nut with split pin",  45.0,   "set",  50.0, 12.0, "Drawer","Rack C-3, Shelf 2"),
            ]),
            ("Fuel & Electrical", "Fuel system and electrical components", [
                ("Carburetor Main Jet",  "FUL-001", "Main jet #115 for PZ30 carb",         45.0,   "pcs",  50.0, 15.0, "Drawer","Rack D-1, Shelf 1"),
                ("Air Filter Element",   "FUL-002", "Foam air filter element 168cc",        95.0,   "pcs",  30.0, 8.0,  "Box",   "Rack D-1, Shelf 2"),
                ("Fuel Filter Inline",   "FUL-003", "Inline petrol filter 6mm",             35.0,   "pcs",  40.0, 10.0, "Bin",   "Rack D-1, Shelf 3"),
                ("Spark Plug A7TC",      "FUL-004", "Champion A7TC spark plug",            55.0,   "pcs",  60.0, 15.0, "Box",   "Rack D-1, Shelf 4"),
                ("CDI Unit",             "FUL-005", "Capacitor discharge ignition box",   480.0,  "pcs",  10.0, 3.0,  "Bin",   "Rack D-1, Shelf 5"),
                ("Magneto Coil",         "FUL-006", "Ignition magneto stator coil",        620.0,  "pcs",  8.0,  2.0,  "Box",   "Rack D-2, Shelf 1"),
                ("Rectifier Regulator",  "FUL-007", "12V voltage regulator rectifier",     320.0,  "pcs",  12.0, 3.0,  "Bin",   "Rack D-2, Shelf 2"),
                ("Fuel Tap Assembly",    "FUL-008", "Petcock fuel tap with reserve",        145.0,  "pcs",  15.0, 4.0,  "Bin",   "Rack D-2, Shelf 3"),
                ("Carb Float",           "FUL-009", "Carburetor float bowl assembly",       135.0,  "pcs",  20.0, 5.0,  "Drawer","Rack D-2, Shelf 4"),
                ("Throttle Cable",       "FUL-010", "Throttle control cable 1.1m",         70.0,   "pcs",  25.0, 6.0,  "Rack",  "Rack D-2, Shelf 5"),
                ("Kill Switch",           "FUL-011", "Handlebar engine kill switch",          55.0,   "pcs",  30.0, 8.0,  "Bin",   "Rack D-3, Shelf 1"),
                ("Choke Cable",           "FUL-012", "Choke control cable 900mm",             65.0,   "pcs",  20.0, 5.0,  "Rack",  "Rack D-3, Shelf 2"),
            ]),
            ("Body & Frame", "Bodywork and frame components", [
                ("Side Cover LH",        "BDY-001", "Left side body panel",                 420.0,  "pcs",  10.0, 3.0,  "Shelf", "Rack E-1, Shelf 1"),
                ("Side Cover RH",        "BDY-002", "Right side body panel",                420.0,  "pcs",  10.0, 3.0,  "Shelf", "Rack E-1, Shelf 2"),
                ("Headlight Assembly",   "BDY-003", "12V 35/35W headlight with bracket",  890.0,  "pcs",  8.0,  2.0,  "Box",   "Rack E-1, Shelf 3"),
                ("Tail Light Assembly",  "BDY-004", "Tail/brake light LED unit",            350.0,  "pcs",  10.0, 3.0,  "Box",   "Rack E-1, Shelf 4"),
                ("Front Mudguard",       "BDY-005", "Front fender plastic",                 310.0,  "pcs",  8.0,  2.0,  "Shelf", "Rack E-1, Shelf 5"),
                ("Rear Mudguard",        "BDY-006", "Rear fender plastic with bracket",    380.0,  "pcs",  8.0,  2.0,  "Shelf", "Rack E-2, Shelf 1"),
                ("Handle Bar",           "BDY-007", "Steel handlebar 22mm DIN",            520.0,  "pcs",  6.0,  2.0,  "Rack",  "Rack E-2, Shelf 2"),
                ("Foot Peg Set",         "BDY-008", "Rider and pillion foot peg pair",     280.0,  "set",  12.0, 3.0,  "Bin",   "Rack E-2, Shelf 3"),
                ("Seat Assembly",        "BDY-009", "Complete seat with foam & cover",    1100.0, "pcs",  5.0,  2.0,  "Shelf", "Rack E-2, Shelf 4"),
                ("Centre Stand",         "BDY-010", "Centre stand with spring",             460.0,  "pcs",  7.0,  2.0,  "Rack",  "Rack E-2, Shelf 5"),
                ("Side Stand",            "BDY-011", "Side kick stand with spring",           280.0,  "pcs",  10.0, 3.0,  "Rack",  "Rack E-3, Shelf 1"),
                ("Fuel Tank Cap",         "BDY-012", "Fuel tank filler cap with lock",        220.0,  "pcs",  12.0, 3.0,  "Bin",   "Rack E-3, Shelf 2"),
            ]),
            ("Suspension & Steering", "Front fork and rear suspension parts", [
                ("Front Fork Oil Seal",  "SUS-001", "Front fork dust & oil seal pair",      190.0,  "set",  20.0, 5.0,  "Bin",   "Rack F-1, Shelf 1"),
                ("Front Fork Spring",    "SUS-002", "Front fork inner spring",              230.0,  "pcs",  12.0, 3.0,  "Rack",  "Rack F-1, Shelf 2"),
                ("Rear Shock Absorber",  "SUS-003", "Rear monoshock absorber",              980.0,  "pcs",  6.0,  2.0,  "Rack",  "Rack F-1, Shelf 3"),
                ("Steering Ball Race",   "SUS-004", "Steering head ball bearing set",       145.0,  "set",  15.0, 4.0,  "Bin",   "Rack F-1, Shelf 4"),
                ("Fork Tube LH",         "SUS-005", "Left inner fork tube 33mm",            560.0,  "pcs",  5.0,  2.0,  "Rack",  "Rack F-1, Shelf 5"),
                ("Fork Tube RH",         "SUS-006", "Right inner fork tube 33mm",           560.0,  "pcs",  5.0,  2.0,  "Rack",  "Rack F-2, Shelf 1"),
                ("Swing Arm Bush",       "SUS-007", "Swingarm pivot rubber bush pair",      110.0,  "set",  20.0, 5.0,  "Bin",   "Rack F-2, Shelf 2"),
                ("Fork Oil 10W",         "SUS-008", "SAE 10W fork damper oil 500ml",        95.0,   "btl",  24.0, 6.0,  "Shelf", "Rack F-2, Shelf 3"),
                ("Steering Stem",        "SUS-009", "Complete steering stem assembly",      640.0,  "pcs",  4.0,  2.0,  "Rack",  "Rack F-2, Shelf 4"),
                ("Rear Cushion Pin",     "SUS-010", "Rear shock mounting pin & nut",        55.0,   "set",  30.0, 8.0,  "Bin",   "Rack F-2, Shelf 5"),
                ("Fork Dust Seal",        "SUS-011", "Front fork dust wiper seal pair",       95.0,   "set",  20.0, 5.0,  "Bin",   "Rack F-3, Shelf 1"),
                ("Swing Arm Bolt",        "SUS-012", "Swingarm pivot bolt M14 with nut",      75.0,   "set",  15.0, 4.0,  "Bin",   "Rack F-3, Shelf 2"),
            ]),
            ("Cooling & Lubrication", "Oil filtration and cooling system parts", [
                ("Engine Oil Filter",    "OIL-001", "Centrifugal oil filter rotor",         85.0,   "pcs",  40.0, 10.0, "Bin",   "Rack G-1, Shelf 1"),
                ("Oil Drain Washer",     "OIL-002", "Sump drain bolt copper washer",        8.0,    "pcs", 100.0, 20.0, "Drawer","Rack G-1, Shelf 2"),
                ("Oil Pump Gear",        "OIL-003", "Inner oil pump rotor gear",            195.0,  "pcs",  10.0, 3.0,  "Bin",   "Rack G-1, Shelf 3"),
                ("Oil Pump Cover",       "OIL-004", "Oil pump outer cover gasket",          65.0,   "pcs",  20.0, 5.0,  "Bin",   "Rack G-1, Shelf 4"),
                ("Engine Oil 20W50",     "OIL-005", "Mineral engine oil 20W-50 1L",         180.0,  "ltr",  48.0, 12.0, "Shelf", "Rack G-1, Shelf 5"),
                ("Coolant Overflow Btl", "OIL-006", "Coolant reservoir bottle 300ml",       120.0,  "pcs",  8.0,  2.0,  "Shelf", "Rack G-2, Shelf 1"),
                ("Breather Tube",        "OIL-007", "Crankcase breather hose 8mm",          30.0,   "pcs",  35.0, 8.0,  "Bin",   "Rack G-2, Shelf 2"),
                ("Oil Level Glass",      "OIL-008", "Sight glass bolt with washer",         45.0,   "pcs",  25.0, 6.0,  "Drawer","Rack G-2, Shelf 3"),
                ("Temperature Sensor",   "OIL-009", "Cylinder head temp NTC sensor",        220.0,  "pcs",  10.0, 3.0,  "Bin",   "Rack G-2, Shelf 4"),
                ("Sump Gasket",          "OIL-010", "Engine sump cover gasket",             55.0,   "pcs",  30.0, 8.0,  "Bin",   "Rack G-2, Shelf 5"),
                ("Oil Strainer Mesh",     "OIL-011", "Engine oil strainer screen filter",     70.0,   "pcs",  20.0, 5.0,  "Bin",   "Rack G-3, Shelf 1"),
                ("Crankcase Vent Valve",  "OIL-012", "PCV one-way breather valve",            90.0,   "pcs",  15.0, 4.0,  "Bin",   "Rack G-3, Shelf 2"),
            ]),
        ]),
    ]

    # part numbers that should receive 2 seed variants each
    VARIANT_SEEDS: dict[str, list[dict]] = {
        "ENG-001": [
            {"variant_color": "Standard Bore",  "serial_number": "STD",   "qty": 12.0, "rate": 450.0, "reorder_level": 3.0, "storage_location": "Rack A-1, Shelf 1A"},
            {"variant_color": "+0.25 Oversize", "serial_number": "OS25",  "qty":  8.0, "rate": 490.0, "reorder_level": 2.0, "storage_location": "Rack A-1, Shelf 1B"},
        ],
        "TRN-001": [
            {"variant_color": "Organic (std)",  "serial_number": "ORG",   "qty": 10.0, "rate": 550.0, "reorder_level": 2.0, "storage_location": "Rack B-1, Shelf 1A"},
            {"variant_color": "Sintered (HD)",  "serial_number": "SIN",   "qty":  5.0, "rate": 650.0, "reorder_level": 2.0, "storage_location": "Rack B-1, Shelf 1B"},
        ],
    }

    total_cats = 0; total_subs = 0; total_items = 0; total_variants = 0
    for cat_name, sub_list in SPARE_DATA:
        cat = SpareCategory(name=cat_name, is_active=True, created_at=NOW, updated_at=NOW)
        s.add(cat); s.flush(); total_cats += 1
        for sub_name, sub_desc, item_list in sub_list:
            sub = SpareSubCategory(
                category_id=cat.id, name=sub_name, description=sub_desc,
                is_active=True, created_at=NOW, updated_at=NOW,
            )
            s.add(sub); s.flush(); total_subs += 1
            for name, pn, desc, rate, unit, qty, reorder, stype, sloc in item_list:
                item = SpareItem(
                    category_id=cat.id, sub_category_id=sub.id,
                    name=name, part_number=pn, part_description=desc,
                    rate=rate, unit=unit,
                    opening_qty=qty, recorded_qty=qty, reorder_level=reorder,
                    storage_type=stype, storage_location=sloc,
                    is_active=True, created_at=NOW, updated_at=NOW,
                )
                s.add(item); s.flush(); total_items += 1
                # Add variants to flagged items
                if pn in VARIANT_SEEDS:
                    for vd in VARIANT_SEEDS[pn]:
                        s.add(SpareItemVariant(
                            spare_item_id=item.id,
                            variant_color=vd["variant_color"],
                            serial_number=vd["serial_number"],
                            qty=vd["qty"],
                            rate=vd["rate"],
                            reorder_level=vd["reorder_level"],
                            storage_type=stype,
                            storage_location=vd["storage_location"],
                            is_active=True, created_at=NOW, updated_at=NOW,
                        ))
                        total_variants += 1
    s.flush()
    print(f"  Spare Cats  : {total_cats}  ({total_subs} sub-cats,  {total_items} items,  {total_variants} variants)")

    s.commit()

print("""
    ✅  Seed complete!

    Login credentials
    ─────────────────────────────────────
    Role         Username     Password
    super_admin  mohan        mohan@123
    super_admin  chadran      chandran@123
    """)
