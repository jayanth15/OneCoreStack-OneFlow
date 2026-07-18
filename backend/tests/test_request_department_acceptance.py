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
    approved_items = {item["department"]: item for item in approved.json()["items"]}
    qa_item_id = approved_items["QA"]["id"]
    store_item_id = approved_items["STORE"]["id"]

    qa_detail = client.get(
        f"/api/v1/requests/{request_id}",
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    store_detail = client.get(
        f"/api/v1/requests/{request_id}",
        headers={"Authorization": f"Bearer {store_token}"},
    )
    assert qa_detail.status_code == 200
    assert store_detail.status_code == 200
    assert qa_detail.json()["target_departments"] == ["QA", "STORE"]
    assert qa_detail.json()["acceptance_departments"] == ["QA"]
    assert store_detail.json()["acceptance_departments"] == ["STORE"]

    qa_acceptance = client.post(
        f"/api/v1/requests/{request_id}/items/accept",
        json={"item_id": qa_item_id, "decision": "accept"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert qa_acceptance.status_code == 200
    after_qa = qa_acceptance.json()
    assert after_qa["status"] == "approved"
    items_after_qa = {item["department"]: item for item in after_qa["items"]}
    assert items_after_qa["QA"]["item_status"] == "in_progress"
    assert items_after_qa["QA"]["accepted_by_username"] == "qa_worker"
    assert items_after_qa["STORE"]["item_status"] is None
    assert after_qa["acceptance_departments"] == []

    store_after_qa = client.get(
        f"/api/v1/requests/{request_id}",
        headers={"Authorization": f"Bearer {store_token}"},
    )
    assert store_after_qa.status_code == 200
    assert store_after_qa.json()["acceptance_departments"] == ["STORE"]

    repeated = client.post(
        f"/api/v1/requests/{request_id}/items/accept",
        json={"item_id": qa_item_id, "decision": "accept"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert repeated.status_code == 409

    store_acceptance = client.post(
        f"/api/v1/requests/{request_id}/items/accept",
        json={"item_id": store_item_id, "decision": "accept"},
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
    approved = client.post(
        f"/api/v1/requests/{request_id}/review",
        json={"decision": "approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    store_item_id = next(
        item["id"] for item in approved.json()["items"] if item["department"] == "STORE"
    )

    response = client.post(
        f"/api/v1/requests/{request_id}/items/accept",
        json={"item_id": store_item_id, "decision": "accept"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert response.status_code == 403


def test_same_department_accepts_each_item_separately(client, session, admin_token):
    create_dept(session, "PROD", "Production")
    create_dept(session, "QA", "Quality Assurance")
    create_user_with_dept(session, "same_dept_requester", "worker", "PROD")
    create_user_with_dept(session, "same_dept_qa", "worker", "QA")

    requester_token = login(client, "same_dept_requester", "test123")
    qa_token = login(client, "same_dept_qa", "test123")
    created = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "items": [
                {"item_name": "Steel", "quantity": 2, "department": "QA"},
                {"item_name": "Bolts", "quantity": 3, "department": "QA"},
            ],
        },
        headers={"Authorization": f"Bearer {requester_token}"},
    )
    request_id = created.json()["id"]
    approved = client.post(
        f"/api/v1/requests/{request_id}/review",
        json={"decision": "approve"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    first_item, second_item = approved.json()["items"]

    bulk = client.post(
        f"/api/v1/requests/{request_id}/accept?department=QA",
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert bulk.status_code == 400

    first = client.post(
        f"/api/v1/requests/{request_id}/items/accept",
        json={"item_id": first_item["id"], "decision": "accept"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert first.status_code == 200
    assert first.json()["status"] == "approved"
    assert first.json()["items"][0]["item_status"] == "in_progress"
    assert first.json()["items"][1]["item_status"] is None
    assert first.json()["acceptance_departments"] == ["QA"]

    second = client.post(
        f"/api/v1/requests/{request_id}/items/accept",
        json={"item_id": second_item["id"], "decision": "accept"},
        headers={"Authorization": f"Bearer {qa_token}"},
    )
    assert second.status_code == 200
    assert second.json()["status"] == "in_progress"
    assert all(item["item_status"] == "in_progress" for item in second.json()["items"])
    assert second.json()["acceptance_departments"] == []
