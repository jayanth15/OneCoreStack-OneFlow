"""
Work Types router — configurable categories for worker time tracking.

GET    /api/v1/work-types          — list active work types (any user)
POST   /api/v1/work-types          — create a new work type (admin+)
PUT    /api/v1/work-types/{id}     — update (admin+)
DELETE /api/v1/work-types/{id}     — soft-delete (admin+)
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.database import get_session
from app.dependencies.auth import get_current_user, require_admin
from app.models.user import User
from app.models.work_type import WorkType

router = APIRouter(
    prefix="/api/v1/work-types",
    tags=["work-types"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────

class WorkTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WorkTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class WorkTypeResponse(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("", response_model=list[WorkTypeResponse])
def list_work_types(
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(get_current_user)],
    include_inactive: bool = False,
) -> list[WorkType]:
    """Return work types. By default only active ones."""
    q = select(WorkType).order_by(WorkType.name)  # type: ignore[arg-type]
    if not include_inactive:
        q = q.where(WorkType.is_active == True)  # noqa: E712
    return list(session.exec(q).all())


@router.post("", response_model=WorkTypeResponse, status_code=status.HTTP_201_CREATED)
def create_work_type(
    body: WorkTypeCreate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> WorkType:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Work type name is required")
    existing = session.exec(select(WorkType).where(WorkType.name == name)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Work type '{name}' already exists")
    wt = WorkType(name=name, description=(body.description or "").strip() or None)
    session.add(wt)
    session.commit()
    session.refresh(wt)
    return wt


@router.put("/{wt_id}", response_model=WorkTypeResponse)
def update_work_type(
    wt_id: int,
    body: WorkTypeUpdate,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> WorkType:
    wt = session.get(WorkType, wt_id)
    if not wt:
        raise HTTPException(status_code=404, detail="Work type not found")
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        data["name"] = data["name"].strip()
        if not data["name"]:
            raise HTTPException(status_code=422, detail="Work type name is required")
    for k, v in data.items():
        setattr(wt, k, v)
    session.add(wt)
    session.commit()
    session.refresh(wt)
    return wt


@router.delete("/{wt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_type(
    wt_id: int,
    session: Annotated[Session, Depends(get_session)],
    _: Annotated[User, Depends(require_admin)],
) -> None:
    wt = session.get(WorkType, wt_id)
    if not wt:
        raise HTTPException(status_code=404, detail="Work type not found")
    wt.is_active = False
    session.add(wt)
    session.commit()
