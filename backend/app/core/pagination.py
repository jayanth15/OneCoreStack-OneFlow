"""Shared pagination utility for SQLModel queries.

Usage:
    from app.core.pagination import paginate
    from sqlmodel import select

    statement = select(Item).where(Item.is_active == True).offset(0).limit(1000)
    result = paginate(session, statement, page=1, page_size=20)
    # result.items, result.total, result.page, result.page_size, result.pages
"""
from dataclasses import dataclass
from typing import Generic, TypeVar

from sqlmodel import Session, func, select

T = TypeVar("T")

MAX_PAGE_SIZE = 200


@dataclass
class Page(Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


def paginate(
    session: Session,
    statement,
    page: int = 1,
    page_size: int = 20,
) -> Page:
    """Paginate a SQLModel select statement.

    Args:
        session: SQLModel session
        statement: a select() statement (without offset/limit)
        page: 1-based page number
        page_size: items per page (capped at MAX_PAGE_SIZE)

    Returns:
        Page with items, total, page, page_size, pages
    """
    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    count_stmt = select(func.count()).select_from(statement.order_by(None))
    total = session.exec(count_stmt).one()

    pages = max(1, -(-total // page_size))

    offset = (page - 1) * page_size
    items = session.exec(
        statement.offset(offset).limit(page_size)
    ).all()

    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )
