"""Admin quantity adjustment during request approval."""

from tests.conftest import create_dept, create_user_with_dept, login


def test_admin_can_adjust_item_quantities_while_approving(client, session, admin_token, qa_dept):
    create_dept(session, "PROD", "Production")
    create_user_with_dept(session, "requester_qty", "worker", "PROD")
    requester_token = login(client, "requester_qty", "test123")

    created = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "items": [
                {"item_name": "Steel", "quantity": 10, "department": "QA"},
                {"item_name": "Bolts", "quantity": 5, "department": "QA"},
            ],
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert created.status_code == 201
    request = created.json()

    approved = client.post(
        f"/api/v1/requests/{request['id']}/review",
        json={
            "decision": "approve",
            "item_quantities": [
                {"item_id": request["items"][0]["id"], "quantity": 8},
                {"item_id": request["items"][1]["id"], "quantity": 3},
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approved.status_code == 200
    body = approved.json()
    assert body["status"] == "approved"
    assert body["quantity"] == 11
    assert [item["quantity"] for item in body["items"]] == [8, 3]


def test_approval_rejects_item_from_another_request(client, session, admin_token, qa_dept):
    create_dept(session, "PROD", "Production")
    create_user_with_dept(session, "requester_invalid_qty", "worker", "PROD")
    token = login(client, "requester_invalid_qty", "test123")

    requests = []
    for name in ("First", "Second"):
        response = client.post(
            "/api/v1/requests",
            json={
                "request_type": "internal_transfer",
                "items": [{"item_name": name, "quantity": 1, "department": "QA"}],
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        requests.append(response.json())

    response = client.post(
        f"/api/v1/requests/{requests[0]['id']}/review",
        json={
            "decision": "approve",
            "item_quantities": [
                {"item_id": requests[1]["items"][0]["id"], "quantity": 2},
            ],
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422
