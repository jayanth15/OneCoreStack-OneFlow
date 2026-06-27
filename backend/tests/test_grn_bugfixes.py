"""Tests for GRN bug fixes (2026-06-25): PR line-item prefill + workers search filter."""
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.security import hash_password
from app.models.purchase_request import PurchaseRequest
from app.models.purchase_request_item import PurchaseRequestItem
from app.models.user import User


def _create_user(session: Session, username: str, is_active: bool = True) -> User:
    user = User(
        username=username,
        password_hash=hash_password("test123"),
        role="staff",
        is_active=is_active,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_pr_with_items(
    session: Session,
    status: str = "approved",
    is_active: bool = True,
    item_count: int = 2,
    sn_no: str | None = None,
) -> PurchaseRequest:
    pr = PurchaseRequest(
        sn_no=sn_no or f"PR-{int.from_bytes(__import__('os').urandom(2), 'big'):04d}",
        status=status,
        is_active=is_active,
        item_name="Header Item",
        quantity=0,
    )
    session.add(pr)
    session.commit()
    session.refresh(pr)
    for i in range(item_count):
        item = PurchaseRequestItem(
            request_id=pr.id,  # type: ignore[arg-type]
            item_name=f"Item {i+1}",
            item_code=f"ITM-{i+1:03d}",
            quantity=10 + i,
            item_status="approved",
        )
        session.add(item)
    session.commit()
    return pr


def test_linkable_pr_items_returns_line_items(client: TestClient, session: Session, admin_token: str) -> None:
    """GET /api/v1/grn/linkable-prs/{id}/items returns all line items for a linkable PR."""
    pr = _create_pr_with_items(session, status="approved", item_count=2, sn_no="PR-0001")
    resp = client.get(
        f"/api/v1/grn/linkable-prs/{pr.id}/items",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 2
    assert items[0]["sn_no"] == f"{pr.sn_no}-1"
    assert items[1]["sn_no"] == f"{pr.sn_no}-2"
    assert items[0]["quantity"] == 10
    assert items[1]["quantity"] == 11


def test_linkable_pr_items_404_for_inactive_pr(client: TestClient, session: Session, admin_token: str) -> None:
    """Soft-deleted PR returns 404."""
    pr = _create_pr_with_items(session, status="approved", is_active=False)
    resp = client.get(
        f"/api/v1/grn/linkable-prs/{pr.id}/items",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_linkable_pr_items_404_for_wrong_status(client: TestClient, session: Session, admin_token: str) -> None:
    """PR in 'pending' status is not linkable → 404."""
    pr = _create_pr_with_items(session, status="pending")
    resp = client.get(
        f"/api/v1/grn/linkable-prs/{pr.id}/items",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_linkable_pr_items_404_for_missing_pr(client: TestClient, admin_token: str) -> None:
    """Non-existent PR id returns 404."""
    resp = client.get(
        "/api/v1/grn/linkable-prs/999999/items",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_linkable_pr_items_empty_for_pr_without_items(client: TestClient, session: Session, admin_token: str) -> None:
    """PR with 0 items returns 200 + []."""
    pr = _create_pr_with_items(session, status="approved", item_count=0)
    resp = client.get(
        f"/api/v1/grn/linkable-prs/{pr.id}/items",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_workers_search_filters_by_username(client: TestClient, session: Session, admin_token: str) -> None:
    """GET /api/v1/production/workers?search=al returns only matching users."""
    _create_user(session, "alice")
    _create_user(session, "bob")
    _create_user(session, "carol")
    resp = client.get(
        "/api/v1/production/workers?search=al",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    users = resp.json()
    usernames = [u["username"] for u in users]
    assert "alice" in usernames
    assert "bob" not in usernames
    assert "carol" not in usernames


def test_workers_search_includes_only_active(client: TestClient, session: Session, admin_token: str) -> None:
    """Inactive users are excluded from worker search."""
    _create_user(session, "active_user")
    _create_user(session, "inactive_user", is_active=False)
    resp = client.get(
        "/api/v1/production/workers?search=user",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    usernames = [u["username"] for u in resp.json()]
    assert "active_user" in usernames
    assert "inactive_user" not in usernames
