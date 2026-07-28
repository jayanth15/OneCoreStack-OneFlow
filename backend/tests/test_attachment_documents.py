"""Tests for PDF attachment document upload, download, and validation."""
from tests.conftest import create_admin, create_dept, create_user_with_dept, login


def _setup_attachment(client, session, token):
    from app.models.attachment_item import AttachmentItem
    from datetime import datetime, timezone
    item = AttachmentItem(
        sn_no="ATT-0001",
        description="Test attachment",
        qty=1,
        reorder_level=0,
        created_at=datetime.now(tz=timezone.utc),
        updated_at=datetime.now(tz=timezone.utc),
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item.id


def test_valid_pdf_upload_succeeds(client, session, admin_token):
    """A valid PDF file must upload successfully."""
    item_id = _setup_attachment(client, session, admin_token)
    pdf_content = b"%PDF-1.4\ntest pdf content\n"
    resp = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("test.pdf", pdf_content, "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, f"Upload failed: {resp.status_code} {resp.json()}"
    data = resp.json()
    assert data["filename"] == "test.pdf"
    assert data["content_type"] == "application/pdf"
    assert data["size"] == len(pdf_content)
    assert data["sha256"] is not None


def test_invalid_pdf_extension_rejected(client, session, admin_token):
    """A .pdf file without %PDF- signature must be rejected."""
    item_id = _setup_attachment(client, session, admin_token)
    resp = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("fake.pdf", b"not a real pdf content", "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


def test_non_pdf_mime_rejected(client, session, admin_token):
    """Non-PDF MIME type must be rejected."""
    item_id = _setup_attachment(client, session, admin_token)
    resp = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("test.txt", b"not a pdf", "text/plain")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400


def test_oversized_upload_returns_413(client, session, admin_token):
    """Oversized upload must return 413."""
    item_id = _setup_attachment(client, session, admin_token)
    oversized = b"%PDF-1.4\n" + b"x" * (11 * 1024 * 1024)
    resp = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("big.pdf", oversized, "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 413


def test_multiple_pdfs_per_attachment_item(client, session, admin_token):
    """Multiple PDFs can belong to one attachment item."""
    item_id = _setup_attachment(client, session, admin_token)
    pdf1 = b"%PDF-1.4\nfirst\n"
    pdf2 = b"%PDF-1.4\nsecond\n"

    r1 = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("first.pdf", pdf1, "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r1.status_code == 200

    r2 = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("second.pdf", pdf2, "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r2.status_code == 200

    docs = client.get(
        f"/api/v1/attachments/{item_id}/documents",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert docs.status_code == 200
    assert len(docs.json()) == 2


def test_download_has_safe_headers(client, session, admin_token):
    """Download must have safe Content-Disposition and nosniff header."""
    item_id = _setup_attachment(client, session, admin_token)
    pdf = b"%PDF-1.4\ntest\n"
    uploaded = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("test.pdf", pdf, "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    doc_id = uploaded.json()["id"]
    resp = client.get(
        f"/api/v1/attachments/{item_id}/documents/{doc_id}/content",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert "attachment" in resp.headers.get("Content-Disposition", "")


def test_soft_deleted_document_not_listed(client, session, admin_token):
    """Soft-deleted documents must not appear in the list."""
    item_id = _setup_attachment(client, session, admin_token)
    pdf = b"%PDF-1.4\ntest\n"
    r = client.post(
        f"/api/v1/attachments/{item_id}/documents",
        files={"file": ("test.pdf", pdf, "application/pdf")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    doc_id = r.json()["id"]

    resp = client.delete(
        f"/api/v1/attachments/{item_id}/documents/{doc_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 204

    docs = client.get(
        f"/api/v1/attachments/{item_id}/documents",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert len(docs.json()) == 0
