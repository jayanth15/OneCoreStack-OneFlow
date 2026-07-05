from app.models.user_department import UserDepartment
from tests.conftest import create_dept, create_user_with_dept, login


def _create_request(client, token: str, department: str, item_name: str):
    resp = client.post(
        "/api/v1/requests",
        json={
            "request_type": "internal_transfer",
            "department": department,
            "items": [{"item_name": item_name, "quantity": 1, "department": department}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, f"Create failed: {resp.status_code} {resp.json()}"
    return resp.json()


def test_list_requests_is_limited_to_user_departments(client, session, admin_token):
    create_dept(session, "PROD", "Production")
    create_dept(session, "QA", "Quality Assurance")
    store = create_dept(session, "STORE", "Stores")

    create_user_with_dept(session, "prod_worker", "worker", "PROD")
    create_user_with_dept(session, "qa_worker", "worker", "QA")
    multi_user = create_user_with_dept(session, "multi_worker", "worker", "QA")
    session.add(UserDepartment(user_id=multi_user.id, department_id=store.id))  # type: ignore[arg-type]
    session.commit()

    prod_token = login(client, "prod_worker", "test123")
    qa_token = login(client, "qa_worker", "test123")
    multi_token = login(client, "multi_worker", "test123")

    qa_request = _create_request(client, prod_token, "QA", "QA item")
    store_request = _create_request(client, prod_token, "STORE", "Store item")

    qa_rows = client.get(
        "/api/v1/requests",
        headers={"Authorization": f"Bearer {qa_token}"},
    ).json()
    assert [row["id"] for row in qa_rows] == [qa_request["id"]]

    multi_rows = client.get(
        "/api/v1/requests",
        headers={"Authorization": f"Bearer {multi_token}"},
    ).json()
    assert {row["id"] for row in multi_rows} == {qa_request["id"], store_request["id"]}


def test_list_requests_paginates_with_limit_and_offset(client, session, admin_token):
    create_dept(session, "PROD", "Production")
    create_dept(session, "QA", "Quality Assurance")
    create_user_with_dept(session, "prod_worker", "worker", "PROD")
    prod_token = login(client, "prod_worker", "test123")

    created_ids = [
        _create_request(client, prod_token, "QA", f"Item {idx}")["id"]
        for idx in range(12)
    ]

    page_one = client.get(
        "/api/v1/requests?limit=10&offset=0",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()
    page_two = client.get(
        "/api/v1/requests?limit=10&offset=10",
        headers={"Authorization": f"Bearer {prod_token}"},
    ).json()

    assert len(page_one) == 10
    assert len(page_two) == 2
    assert {row["id"] for row in page_one}.isdisjoint({row["id"] for row in page_two})
    assert {row["id"] for row in page_one + page_two} == set(created_ids)
