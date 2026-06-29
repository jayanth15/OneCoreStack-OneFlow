"""
Suppliers router.

Suppliers are companies that provide parts/materials and/or perform job work.

GET  /api/v1/suppliers        — list all active suppliers (admin+)
GET  /api/v1/suppliers/names  — lightweight [{id, name}] for dropdowns
POST /api/v1/suppliers        — create a new supplier (admin+)
PUT  /api/v1/suppliers/{id}   — update a supplier (admin+)
DELETE /api/v1/suppliers/{id} — deactivate a supplier (admin+)
"""
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.supplier import Supplier
from app.models.supplier_job import SupplierJob
from app.models.supplier_material import SupplierMaterial
from app.models.unit import Unit
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/suppliers",
    tags=["suppliers"],
)


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/names")
def list_supplier_names(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[dict[str, Any]]:
    """Lightweight dropdown data — [{id, name}] sorted by name."""
    suppliers = session.exec(
        select(Supplier).where(Supplier.is_active == True).order_by(Supplier.name)  # noqa: E712
    ).all()
    return [{"id": s.id, "name": s.name} for s in suppliers]


@router.get("")
def list_suppliers(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
    search: str = "",
    include_inactive: bool = False,
) -> list[dict[str, Any]]:
    """List all suppliers, optionally including inactive ones."""
    q = select(Supplier)
    if not include_inactive:
        q = q.where(Supplier.is_active == True)  # noqa: E712
    q = q.order_by(Supplier.name)  # type: ignore[union-attr]
    suppliers = session.exec(q).all()

    result = []
    for s in suppliers:
        if search and search.lower() not in s.name.lower():
            continue
        result.append({
            "id": s.id,
            "name": s.name,
            "contact_person": s.contact_person,
            "phone": s.phone,
            "email": s.email,
            "address": s.address,
            "notes": s.notes,
            "is_active": s.is_active,
            "created_at": s.created_at,
        })
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
def create_supplier(
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """Create a new supplier (admin / super_admin only)."""
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Supplier name is required")

    existing = session.exec(select(Supplier).where(Supplier.name == name)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Supplier '{name}' already exists")

    supplier = Supplier(
        name=name,
        contact_person=(body.get("contact_person") or "").strip() or None,
        phone=(body.get("phone") or "").strip() or None,
        email=(body.get("email") or "").strip() or None,
        address=(body.get("address") or "").strip() or None,
        notes=(body.get("notes") or "").strip() or None,
        is_active=True,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return {"id": supplier.id, "name": supplier.name}


@router.put("/{supplier_id}")
def update_supplier(
    supplier_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """Update supplier details (admin / super_admin only)."""
    supplier = session.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Supplier name is required")
        # Check uniqueness if name changed
        if name != supplier.name:
            existing = session.exec(select(Supplier).where(Supplier.name == name)).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Supplier '{name}' already exists")
        supplier.name = name

    for field in ("contact_person", "phone", "email", "address", "notes"):
        if field in body:
            setattr(supplier, field, (body[field] or "").strip() or None)

    if "is_active" in body:
        supplier.is_active = bool(body["is_active"])

    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    return {
        "id": supplier.id,
        "name": supplier.name,
        "contact_person": supplier.contact_person,
        "phone": supplier.phone,
        "email": supplier.email,
        "address": supplier.address,
        "notes": supplier.notes,
        "is_active": supplier.is_active,
    }


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_supplier(
    supplier_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    """Soft-delete (deactivate) a supplier (admin / super_admin only)."""
    supplier = session.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    supplier.is_active = False
    session.add(supplier)
    session.commit()


# ── Supplier Detail ───────────────────────────────────────────────────────────

def _supplier_to_dict(s: Supplier) -> dict[str, Any]:
    return {
        "id": s.id,
        "name": s.name,
        "contact_person": s.contact_person,
        "phone": s.phone,
        "email": s.email,
        "address": s.address,
        "notes": s.notes,
        "is_active": s.is_active,
        "created_at": s.created_at,
    }


@router.get("/{supplier_id}")
def get_supplier_detail(
    supplier_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    """Get a single supplier with their jobs and materials."""
    supplier = session.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    jobs = session.exec(
        select(SupplierJob).where(SupplierJob.supplier_id == supplier_id)
        .order_by(SupplierJob.id)  # type: ignore[union-attr]
    ).all()
    materials = session.exec(
        select(SupplierMaterial).where(SupplierMaterial.supplier_id == supplier_id)
        .order_by(SupplierMaterial.id)  # type: ignore[union-attr]
    ).all()

    job_list = []
    for j in jobs:
        ju = session.get(Unit, j.unit_id) if j.unit_id else None
        job_list.append({
            "id": j.id, "job_name": j.job_name, "description": j.description,
            "rate": j.rate, "unit_id": j.unit_id, "unit_name": ju.name if ju else None,
            "notes": j.notes, "is_active": j.is_active, "created_at": j.created_at,
        })
    mat_list = []
    for m in materials:
        mu = session.get(Unit, m.unit_id) if m.unit_id else None
        mat_list.append({
            "id": m.id, "material_name": m.material_name, "category": m.category,
            "unit_id": m.unit_id, "unit_name": mu.name if mu else None,
            "rate": m.rate, "notes": m.notes,
            "is_active": m.is_active, "created_at": m.created_at,
        })
    return {
        **_supplier_to_dict(supplier),
        "jobs": job_list,
        "materials": mat_list,
    }


# ── Jobs ──────────────────────────────────────────────────────────────────────

@router.post("/{supplier_id}/jobs", status_code=status.HTTP_201_CREATED)
def add_supplier_job(
    supplier_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    supplier = session.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    job_name = (body.get("job_name") or "").strip()
    if not job_name:
        raise HTTPException(status_code=422, detail="job_name is required")

    job = SupplierJob(
        supplier_id=supplier_id,
        job_name=job_name,
        description=(body.get("description") or "").strip() or None,
        rate=body.get("rate"),
        unit_id=body.get("unit_id"),
        notes=(body.get("notes") or "").strip() or None,
        is_active=True,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    ju = session.get(Unit, job.unit_id) if job.unit_id else None
    return {
        "id": job.id, "job_name": job.job_name, "description": job.description,
        "rate": job.rate, "unit_id": job.unit_id, "unit_name": ju.name if ju else None,
        "notes": job.notes, "is_active": job.is_active, "created_at": job.created_at,
    }


@router.put("/{supplier_id}/jobs/{job_id}")
def update_supplier_job(
    supplier_id: int,
    job_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    job = session.get(SupplierJob, job_id)
    if not job or job.supplier_id != supplier_id:
        raise HTTPException(status_code=404, detail="Job not found")

    if "job_name" in body:
        job.job_name = (body["job_name"] or "").strip() or job.job_name
    if "description" in body:
        job.description = (body["description"] or "").strip() or None
    if "rate" in body:
        job.rate = body["rate"]
    if "unit_id" in body:
        job.unit_id = body["unit_id"]
    if "notes" in body:
        job.notes = (body["notes"] or "").strip() or None
    if "is_active" in body:
        job.is_active = bool(body["is_active"])

    session.add(job)
    session.commit()
    session.refresh(job)
    ju = session.get(Unit, job.unit_id) if job.unit_id else None
    return {
        "id": job.id, "job_name": job.job_name, "description": job.description,
        "rate": job.rate, "unit_id": job.unit_id, "unit_name": ju.name if ju else None,
        "notes": job.notes, "is_active": job.is_active,
    }


@router.delete("/{supplier_id}/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_job(
    supplier_id: int,
    job_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    job = session.get(SupplierJob, job_id)
    if not job or job.supplier_id != supplier_id:
        raise HTTPException(status_code=404, detail="Job not found")
    session.delete(job)
    session.commit()


# ── Materials ─────────────────────────────────────────────────────────────────

@router.post("/{supplier_id}/materials", status_code=status.HTTP_201_CREATED)
def add_supplier_material(
    supplier_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    supplier = session.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    material_name = (body.get("material_name") or "").strip()
    if not material_name:
        raise HTTPException(status_code=422, detail="material_name is required")

    mat = SupplierMaterial(
        supplier_id=supplier_id,
        material_name=material_name,
        category=(body.get("category") or "").strip() or None,
        unit_id=body.get("unit_id"),
        rate=body.get("rate"),
        notes=(body.get("notes") or "").strip() or None,
        is_active=True,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    session.add(mat)
    session.commit()
    session.refresh(mat)
    mu = session.get(Unit, mat.unit_id) if mat.unit_id else None
    return {
        "id": mat.id, "material_name": mat.material_name, "category": mat.category,
        "unit_id": mat.unit_id, "unit_name": mu.name if mu else None,
        "rate": mat.rate, "notes": mat.notes,
        "is_active": mat.is_active, "created_at": mat.created_at,
    }


@router.put("/{supplier_id}/materials/{mat_id}")
def update_supplier_material(
    supplier_id: int,
    mat_id: int,
    body: dict[str, Any],
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> dict[str, Any]:
    mat = session.get(SupplierMaterial, mat_id)
    if not mat or mat.supplier_id != supplier_id:
        raise HTTPException(status_code=404, detail="Material not found")

    if "material_name" in body:
        mat.material_name = (body["material_name"] or "").strip() or mat.material_name
    if "category" in body:
        mat.category = (body["category"] or "").strip() or None
    if "rate" in body:
        mat.rate = body["rate"]
    if "unit_id" in body:
        mat.unit_id = body["unit_id"]
    if "notes" in body:
        mat.notes = (body["notes"] or "").strip() or None
    if "is_active" in body:
        mat.is_active = bool(body["is_active"])

    session.add(mat)
    session.commit()
    session.refresh(mat)
    mu = session.get(Unit, mat.unit_id) if mat.unit_id else None
    return {
        "id": mat.id, "material_name": mat.material_name, "category": mat.category,
        "unit_id": mat.unit_id, "unit_name": mu.name if mu else None,
        "rate": mat.rate, "notes": mat.notes,
        "is_active": mat.is_active,
    }


@router.delete("/{supplier_id}/materials/{mat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_material(
    supplier_id: int,
    mat_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    mat = session.get(SupplierMaterial, mat_id)
    if not mat or mat.supplier_id != supplier_id:
        raise HTTPException(status_code=404, detail="Material not found")
    session.delete(mat)
    session.commit()

