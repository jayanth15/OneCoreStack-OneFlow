"""Regression tests for department-scoped request acceptance."""

from tests.conftest import create_dept, create_user_with_dept, login


def test_each_target_department_accepts_independently(client, session, admin_token):
    create_dept(session, "PROD", "Production")
    create_dept(session, "QA", "Quality Assurance")
    create_dept(session, "STORE", "Stores")
    create_user_with_dept(session, "requester", "worker", "PROD")
    create_user_with_dept(session, "qa_worker", "worker", "QA")
    create_user_with_dept(session, "store_worker", "worker", "STORE")

    requester_token = login(client, "requester", "test123")
    qa_token = login(client, "qa_worker", "test123")
    store_token = login(client, "store_worker", "test123")

    created = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "items": [
                {"item_name": "Steel", "quantity": 10, "department": "QA"},
                {"item_name": "Bolts", "quantity": 5, "department": "STORE"},
            ],
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    assert created.status_code == 201
    request_id = created.json()["id"]

    approved = client.post(
        f"/api/v1/requests/{request_id}/review",
        json={"decision": "approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approved.status_code == 200

    qa_acceptance = client.post(
        f"/api/v1/requests/{request_id}/accept?department=QA",
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert qa_acceptance.status_code == 200
    after_qa = qa_acceptance.json()
    assert after_qa["status"] == "approved"
    items_after_qa = {item["department"]: item for item in after_qa["items"]}
    assert items_after_qa["QA"]["item_status"] == "in_progress"
    assert items_after_qa["QA"]["accepted_by_username"] == "qa_worker"
    assert items_after_qa["STORE"]["item_status"] is None

    repeated = client.post(
        f"/api/v1/requests/{request_id}/accept?department=QA",
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert repeated.status_code == 409

    store_acceptance = client.post(
        f"/api/v1/requests/{request_id}/accept?department=STORE",
        headers={"Authorization": f"Bearer {store_token}"},
    )
    assert store_acceptance.status_code == 200
    after_store = store_acceptance.json()
    assert after_store["status"] == "in_progress"
    items_after_store = {item["department"]: item for item in after_store["items"]}
    assert items_after_store["QA"]["accepted_by_username"] == "qa_worker"
    assert items_after_store["STORE"]["accepted_by_username"] == "store_worker"


def test_department_cannot_accept_for_another_target(client, session, admin_token):
    create_dept(session, "PROD", "Production")
    create_dept(session, "QA", "Quality Assurance")
    create_dept(session, "STORE", "Stores")
    create_user_with_dept(session, "requester", "worker", "PROD")
    create_user_with_dept(session, "qa_worker", "worker", "QA")

    requester_token = login(client, "requester", "test123")
    qa_token = login(client, "qa_worker", "test123")
    created = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "items": [
                {"item_name": "Steel", "quantity": 1, "department": "QA"},
                {"item_name": "Bolts", "quantity": 1, "department": "STORE"},
            ],
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    request_id = created.json()["id"]
    client.post(
        f"/api/v1/requests/{request_id}/review",
        json={"decision": "approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    response = client.post(
        f"/api/v1/requests/{request_id}/accept?department=STORE",
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert response.status_code == 403
