from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.core.database import get_session
from app.dependencies.auth import require_admin
from app.models.department import Department
from app.models.user_department import UserDepartment

router = APIRouter(
    prefix="/api/v1/admin/departments",
    tags=["admin-departments"],
    dependencies=[Depends(require_admin)],
)


# ── Schemas ──────────────────────────────────────────────────────────────────

class DepartmentCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True


class DepartmentUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool
    user_count: int = 0

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DepartmentResponse])
def list_departments(
    session: Annotated[Session, Depends(get_session)],
    include_inactive: bool = False,
) -> list[DepartmentResponse]:
    query = select(Department)
    if not include_inactive:
        query = query.where(Department.is_active == True)  # noqa: E712
    depts = list(session.exec(query.order_by(Department.code)).all())

    # Get user counts per department in one query
    count_rows = session.exec(
        select(UserDepartment.department_id, func.count(UserDepartment.user_id))
        .group_by(UserDepartment.department_id)
    ).all()
    counts = {dept_id: cnt for dept_id, cnt in count_rows}

    return [
        DepartmentResponse(
            id=d.id,  # type: ignore[arg-type]
            code=d.code,
            name=d.name,
            description=d.description,
            is_active=d.is_active,
            user_count=counts.get(d.id, 0),  # type: ignore[arg-type]
        )
        for d in depts
    ]


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    body: DepartmentCreate,
    session: Annotated[Session, Depends(get_session)],
) -> Department:
    existing = session.exec(select(Department).where(Department.code == body.code.upper())).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Department code '{body.code}' already exists")

    dept = Department(
        code=body.code.upper().strip(),
        name=body.name.strip(),
        description=body.description.strip() if body.description else None,
        is_active=body.is_active,
    )
    session.add(dept)
    session.commit()
    session.refresh(dept)
    return dept


@router.get("/{dept_id}", response_model=DepartmentResponse)
def get_department(
    dept_id: int,
    session: Annotated[Session, Depends(get_session)],
) -> Department:
    dept = session.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept


@router.put("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: int,
    body: DepartmentUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> Department:
    dept = session.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if body.code is not None:
        new_code = body.code.upper().strip()
        conflict = session.exec(
            select(Department).where(Department.code == new_code, Department.id != dept_id)
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"Department code '{new_code}' already exists")
        dept.code = new_code

    if body.name is not None:
        dept.name = body.name.strip()
    if body.description is not None:
        dept.description = body.description.strip() or None
    if body.is_active is not None:
        dept.is_active = body.is_active

    session.add(dept)
    session.commit()
    session.refresh(dept)
    return dept


@router.delete("/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    dept_id: int,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    dept = session.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    dept.is_active = False
    session.add(dept)
    session.commit()
