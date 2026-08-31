import pytest

from backend.app.models import RiskTier
from backend.app.scoring import calculate_risk


def customer(**overrides):
    record = {
        "Contract": "Two year",
        "tenure": 24,
        "MonthlyCharges": 50.0,
        "TechSupport": "Yes",
        "OnlineSecurity": "Yes",
        "PaymentMethod": "Mailed check",
        "Churn": "No",
    }
    record.update(overrides)
    return record


def test_customer_with_no_matching_rules_scores_zero():
    result = calculate_risk(customer())

    assert result.score == 0
    assert result.tier is RiskTier.LOW
    assert result.factors == []


def test_customer_matching_every_rule_scores_one_hundred():
    result = calculate_risk(
        customer(
            Contract="Month-to-month",
            tenure=1,
            MonthlyCharges=100.0,
            TechSupport="No",
            OnlineSecurity="No",
            PaymentMethod="Electronic check",
        )
    )

    assert result.score == 100
    assert result.tier is RiskTier.HIGH
    assert {factor.points for factor in result.factors} == {10, 15, 20, 30}


@pytest.mark.parametrize(
    ("score", "expected_tier"),
    [
        (0, RiskTier.LOW),
        (34, RiskTier.LOW),
        (35, RiskTier.MEDIUM),
        (64, RiskTier.MEDIUM),
        (65, RiskTier.HIGH),
        (100, RiskTier.HIGH),
    ],
)
def test_tier_boundaries(score, expected_tier):
    from backend.app.scoring import tier_for_score

    assert tier_for_score(score) is expected_tier


def test_score_is_sum_of_reported_factor_points():
    result = calculate_risk(
        customer(Contract="Month-to-month", tenure=5, TechSupport="No")
    )

    assert result.score == sum(factor.points for factor in result.factors)
    assert all(factor.name and factor.explanation for factor in result.factors)


def test_churn_target_does_not_change_score_or_factors():
    retained = calculate_risk(customer(Contract="Month-to-month", Churn="No"))
    churned = calculate_risk(customer(Contract="Month-to-month", Churn="Yes"))

    assert churned == retained


@pytest.mark.parametrize("value", ["No internet service", "no", "NO", "No "])
def test_no_internet_service_and_inexact_no_values_do_not_match(value):
    result = calculate_risk(customer(TechSupport=value, OnlineSecurity=value))

    assert result.score == 0
    assert result.factors == []


@pytest.mark.parametrize(
    "value", ["electronic check", "Electronic Check", "Electronic check "]
)
def test_inexact_electronic_check_values_do_not_match(value):
    result = calculate_risk(customer(PaymentMethod=value))

    assert result.score == 0
