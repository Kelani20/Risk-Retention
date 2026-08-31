import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


@pytest.fixture
def client():
    # A fresh lifespan/store per test prevents outreach mutations leaking between tests.
    with TestClient(create_app()) as test_client:
        yield test_client


def test_list_customers_returns_dashboard_fields_and_pagination(client):
    response = client.get("/customers")

    assert response.status_code == 200
    payload = response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 25
    assert payload["total"] == 7043
    assert payload["total_pages"] == 282
    assert len(payload["items"]) == 25
    assert {
        "customerID",
        "Contract",
        "tenure",
        "MonthlyCharges",
        "TotalCharges",
        "risk_score",
        "risk_tier",
        "outreach_status",
    } <= payload["items"][0].keys()


def test_list_customers_applies_actual_paging(client):
    first = client.get("/customers", params={"page": 1, "page_size": 5}).json()
    second = client.get("/customers", params={"page": 2, "page_size": 5}).json()

    first_ids = [item["customerID"] for item in first["items"]]
    second_ids = [item["customerID"] for item in second["items"]]
    assert len(first_ids) == len(second_ids) == 5
    assert set(first_ids).isdisjoint(second_ids)


def test_list_customers_reports_zero_pages_when_filters_match_nothing(client):
    response = client.get("/customers", params={"contract": "Not a real contract"})

    assert response.status_code == 200
    assert response.json()["total"] == 0
    assert response.json()["total_pages"] == 0
    assert response.json()["items"] == []


def test_list_customers_sorts_by_score_descending_then_customer_id(client):
    items = client.get("/customers", params={"page_size": 100}).json()["items"]
    sort_keys = [(-item["risk_score"], item["customerID"]) for item in items]

    assert sort_keys == sorted(sort_keys)


def test_list_customers_filters_by_risk_contract_outreach_and_search(client):
    response = client.get(
        "/customers",
        params={
            "risk_tier": "HIGH",
            "contract": "Month-to-month",
            "outreach_status": "NOT_CONTACTED",
            "search": "-",
            "page_size": 100,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] > 0
    assert all(
        item["risk_tier"] == "HIGH"
        and item["Contract"] == "Month-to-month"
        and item["outreach_status"] == "NOT_CONTACTED"
        and "-" in item["customerID"].lower()
        for item in payload["items"]
    )


@pytest.mark.parametrize(
    "params",
    [{"page": 0}, {"page": -1}, {"page_size": 0}, {"page_size": 101}],
)
def test_list_customers_rejects_invalid_pagination_with_400(client, params):
    response = client.get("/customers", params=params)

    assert response.status_code == 400


def test_customer_detail_returns_normalized_complete_record(client):
    response = client.get("/customers/7590-VHVEG")

    assert response.status_code == 200
    customer = response.json()
    assert customer["customerID"] == "7590-VHVEG"
    assert customer["SeniorCitizen"] == 0
    assert customer["tenure"] == 1
    assert customer["MonthlyCharges"] == 29.85
    assert customer["TotalCharges"] == 29.85
    assert isinstance(customer["risk_factors"], list)
    assert customer["outreach_status"] == "NOT_CONTACTED"
    assert customer["allowed_next_status"] == "IN_PROGRESS"
    assert customer["gender"] == "Female"
    assert customer["InternetService"] == "DSL"
    assert customer["Contract"] == "Month-to-month"
    assert customer["Churn"] == "No"
    assert all(factor["name"].lower() != "churn" for factor in customer["risk_factors"])


def test_blank_total_charges_is_normalized_to_none(client):
    response = client.get("/customers/4472-LVYGI")

    assert response.status_code == 200
    assert response.json()["TotalCharges"] is None


def test_customer_detail_returns_404_for_unknown_customer(client):
    response = client.get("/customers/DOES-NOT-EXIST")

    assert response.status_code == 404


def test_outreach_update_persists_and_returns_next_status(client):
    update = client.patch(
        "/customers/7590-VHVEG/outreach", json={"status": "IN_PROGRESS"}
    )

    assert update.status_code == 200
    assert update.json() == {
        "customerID": "7590-VHVEG",
        "outreach_status": "IN_PROGRESS",
        "allowed_next_status": "RESOLVED",
    }
    assert (
        client.get("/customers/7590-VHVEG").json()["outreach_status"] == "IN_PROGRESS"
    )


def test_outreach_update_returns_404_for_unknown_customer(client):
    response = client.patch(
        "/customers/DOES-NOT-EXIST/outreach", json={"status": "IN_PROGRESS"}
    )

    assert response.status_code == 404


def test_invalid_outreach_transition_returns_409_without_mutation(client):
    response = client.patch(
        "/customers/7590-VHVEG/outreach", json={"status": "RESOLVED"}
    )

    assert response.status_code == 409
    detail = client.get("/customers/7590-VHVEG").json()
    assert detail["outreach_status"] == "NOT_CONTACTED"
    assert detail["allowed_next_status"] == "IN_PROGRESS"


@pytest.mark.parametrize("body", [{}, {"status": "UNKNOWN"}, {"status": 3}])
def test_malformed_outreach_update_returns_422(client, body):
    assert client.patch("/customers/7590-VHVEG/outreach", json=body).status_code == 422


def test_model_info_matches_the_configuration_used_for_scoring(client):
    info = client.get("/model/info")
    customer = client.get("/customers/7590-VHVEG").json()

    assert info.status_code == 200
    payload = info.json()
    assert payload["thresholds"] == [
        {"tier": "LOW", "min_score": 0, "max_score": 34},
        {"tier": "MEDIUM", "min_score": 35, "max_score": 64},
        {"tier": "HIGH", "min_score": 65, "max_score": 100},
    ]
    configured = {rule["name"]: rule["points"] for rule in payload["rules"]}
    assert configured
    assert customer["risk_score"] == sum(
        configured[factor["name"]] for factor in customer["risk_factors"]
    )


def test_unexpected_failure_is_generic_and_logs_request_fields(caplog):
    api = create_app()

    @api.get("/unexpected-test-error")
    async def unexpected_test_error():
        raise RuntimeError("sensitive internal detail")

    with TestClient(api, raise_server_exceptions=False) as test_client:
        with caplog.at_level("ERROR", logger="backend.app.main"):
            response = test_client.get("/unexpected-test-error")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    failure_log = "\n".join(record.getMessage() for record in caplog.records)
    assert "method=GET" in failure_log
    assert "path=/unexpected-test-error" in failure_log
    assert "status_code=500" in failure_log
    assert "duration_ms=" in failure_log


def test_successful_request_log_contains_required_fields(client, caplog):
    with caplog.at_level("INFO", logger="backend.app.main"):
        response = client.get("/model/info")

    assert response.status_code == 200
    request_log = "\n".join(record.getMessage() for record in caplog.records)
    assert "method=GET" in request_log
    assert "path=/model/info" in request_log
    assert "status_code=200" in request_log
    assert "duration_ms=" in request_log


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:5173", "https://retention.usamakelani.com"],
)
def test_cors_allows_configured_frontend_origins(client, origin):
    response = client.options(
        "/customers",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_default_dataset_path_is_independent_of_working_directory(
    tmp_path, monkeypatch
):
    monkeypatch.chdir(tmp_path)

    with TestClient(create_app()) as test_client:
        response = test_client.get("/customers", params={"page_size": 1})

    assert response.status_code == 200
    assert response.json()["total"] == 7043


def test_customer_data_loads_once_when_lifespan_starts(monkeypatch):
    from backend.app import main as main_module

    real_load_customers = main_module.load_customers
    load_calls = 0

    def counted_load(path):
        nonlocal load_calls
        load_calls += 1
        return real_load_customers(path)

    monkeypatch.setattr(main_module, "load_customers", counted_load)
    api = create_app()
    assert load_calls == 0

    with TestClient(api) as test_client:
        assert test_client.get("/customers").status_code == 200
        assert test_client.get("/model/info").status_code == 200
        assert load_calls == 1

    assert load_calls == 1


def test_startup_rejects_missing_required_column(tmp_path):
    csv_path = tmp_path / "customers.csv"
    csv_path.write_text(
        "customerID,SeniorCitizen,tenure,MonthlyCharges,TotalCharges,Contract,"
        "TechSupport,OnlineSecurity\n"
        "TEST-001,0,1,10,10,Month-to-month,No,No\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="missing required columns"):
        with TestClient(create_app(csv_path)):
            pass


@pytest.mark.parametrize("monthly_charges", ["not-a-number", "nan", "inf"])
def test_startup_rejects_invalid_or_non_finite_numeric_values(
    tmp_path, monthly_charges
):
    csv_path = tmp_path / "customers.csv"
    csv_path.write_text(
        "customerID,SeniorCitizen,tenure,MonthlyCharges,TotalCharges,Contract,"
        "TechSupport,OnlineSecurity,PaymentMethod\n"
        f"TEST-001,0,1,{monthly_charges},10,Month-to-month,No,No,Electronic check\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="unusable data"):
        with TestClient(create_app(csv_path)):
            pass


def test_startup_rejects_blank_required_categorical_value(tmp_path):
    csv_path = tmp_path / "customers.csv"
    csv_path.write_text(
        "customerID,SeniorCitizen,tenure,MonthlyCharges,TotalCharges,Contract,"
        "TechSupport,OnlineSecurity,PaymentMethod\n"
        "TEST-001,0,1,10,10,Month-to-month,,No,Electronic check\n",
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="unusable data"):
        with TestClient(create_app(csv_path)):
            pass


def test_startup_rejects_structurally_malformed_csv(tmp_path):
    csv_path = tmp_path / "customers.csv"
    csv_path.write_text(
        "customerID,SeniorCitizen,tenure,MonthlyCharges,TotalCharges,Contract,"
        "TechSupport,OnlineSecurity,PaymentMethod\n"
        'TEST-001,0,1,10,10,Month-to-month,No,No,"Electronic check\n',
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="unusable data"):
        with TestClient(create_app(csv_path)):
            pass
