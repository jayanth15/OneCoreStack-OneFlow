from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.database import get_session
from app.core.security import hash_password
from app.dependencies.auth import require_admin
from app.models.department import Department
from app.models.user import User
from app.models.user_department import UserDepartment

router = APIRouter(
    prefix="/api/v1/admin/users",
    tags=["admin-users"],
    dependencies=[Depends(require_admin)],
)


# ── Schemas ──────────────────────────────────────────────────────────────────

class DeptRef(BaseModel):
    id: int
    code: str
    name: str
    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "worker"  # admin | manager | worker
    is_active: bool = True
    department_ids: list[int] = []
    # Inventory types this user may access (empty = all types allowed)
    inventory_access: list[str] = []


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None  # blank / None = no change
    role: Optional[str] = None
    is_active: Optional[bool] = None
    department_ids: Optional[list[int]] = None
    inventory_access: Optional[list[str]] = None


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    departments: list[DeptRef] = []
    inventory_access: list[str] = []
    model_config = {"from_attributes": True}


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_user_departments(session: Session, user_id: int) -> list[Department]:
    links = session.exec(
        select(UserDepartment).where(UserDepartment.user_id == user_id)
    ).all()
    dept_ids = [lnk.department_id for lnk in links]
    if not dept_ids:
        return []
    return list(session.exec(select(Department).where(Department.id.in_(dept_ids))).all())  # type: ignore[attr-defined]


def _set_user_departments(session: Session, user_id: int, dept_ids: list[int]) -> None:
    # Validate all requested dept IDs exist
    if dept_ids:
        depts = session.exec(select(Department).where(Department.id.in_(dept_ids))).all()  # type: ignore[attr-defined]
        found_ids = {d.id for d in depts}
        missing = set(dept_ids) - found_ids
        if missing:
            raise HTTPException(status_code=400, detail=f"Department IDs not found: {sorted(missing)}")

    # Remove all existing links then re-create
    existing = session.exec(
        select(UserDepartment).where(UserDepartment.user_id == user_id)
    ).all()
    for link in existing:
        session.delete(link)

    for dept_id in dept_ids:
        session.add(UserDepartment(user_id=user_id, department_id=dept_id))


def _build_response(session: Session, user: User) -> UserResponse:
    depts = _get_user_departments(session, user.id)  # type: ignore[arg-type]
    access_list = [t.strip() for t in (user.inventory_access or "").split(",") if t.strip()]
    return UserResponse(
        id=user.id,  # type: ignore[arg-type]
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        departments=[DeptRef(id=d.id, code=d.code, name=d.name) for d in depts],  # type: ignore[arg-type]
        inventory_access=access_list,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[UserResponse])
def list_users(
    session: Annotated[Session, Depends(get_session)],
    include_inactive: bool = False,
) -> list[UserResponse]:
    query = select(User)
    if not include_inactive:
        query = query.where(User.is_active == True)  # noqa: E712
    users = session.exec(query.order_by(User.username)).all()
    return [_build_response(session, u) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    session: Annotated[Session, Depends(get_session)],
) -> UserResponse:
    if session.exec(select(User).where(User.username == body.username)).first():
        raise HTTPException(status_code=400, detail=f"Username '{body.username}' already exists")

    if body.role not in ("admin", "manager", "worker"):
        raise HTTPException(status_code=400, detail="Role must be admin, manager, or worker")

    user = User(
        username=body.username.strip(),
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=body.is_active,
        inventory_access=",".join(body.inventory_access),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    _set_user_departments(session, user.id, body.department_ids)  # type: ignore[arg-type]
    session.commit()

    return _build_response(session, user)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    session: Annotated[Session, Depends(get_session)],
) -> UserResponse:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_response(session, user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    body: UserUpdate,
    session: Annotated[Session, Depends(get_session)],
) -> UserResponse:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.username is not None:
        conflict = session.exec(
            select(User).where(User.username == body.username, User.id != user_id)
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"Username '{body.username}' already taken")
        user.username = body.username.strip()

    if body.password:
        user.password_hash = hash_password(body.password)

    if body.role is not None:
        if body.role not in ("admin", "manager", "worker"):
            raise HTTPException(status_code=400, detail="Role must be admin, manager, or worker")
        user.role = body.role

    if body.is_active is not None:
        user.is_active = body.is_active

    if body.inventory_access is not None:
        user.inventory_access = ",".join(body.inventory_access)

    session.add(user)

    if body.department_ids is not None:
        _set_user_departments(session, user_id, body.department_ids)

    session.commit()
    session.refresh(user)

    return _build_response(session, user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    session.add(user)
    session.commit()
