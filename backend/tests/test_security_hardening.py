from app.core.config import settings


def test_debug_schema_endpoint_is_not_exposed(client):
    response = client.get("/_debug/schema/users")
    assert response.status_code == 404


def test_api_responses_include_security_headers(client):
    response = client.get("/api/v1/auth/me")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
    assert response.headers["cache-control"] == "no-store"


def test_login_rate_limit_returns_retry_after(client, monkeypatch):
    monkeypatch.setattr(settings, "login_rate_limit", 2)
    first = {"username": "missing-1", "password": "wrong"}
    second = {"username": "missing-2", "password": "wrong"}
    third = {"username": "missing-3", "password": "wrong"}

    assert client.post("/api/v1/auth/login", json=first).status_code == 401
    assert client.post("/api/v1/auth/login", json=second).status_code == 401
    blocked = client.post("/api/v1/auth/login", json=third)

    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1


def test_production_refresh_cookie_is_secure(client, session, monkeypatch):
    from conftest import create_admin

    create_admin(session)
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "cookie_secure", False)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )

    assert response.status_code == 200
    assert "Secure" in response.headers["set-cookie"]


def test_global_exception_handler_is_registered():
    from app.main import app as fastapi_app, global_exception_handler

    assert fastapi_app.exception_handlers[Exception] is global_exception_handler
