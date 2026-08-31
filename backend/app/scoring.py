from dataclasses import asdict, dataclass
from typing import Any

from .models import RiskTier


@dataclass(frozen=True)
class RiskFactor:
    name: str
    points: int
    explanation: str


@dataclass(frozen=True)
class RiskResult:
    score: int
    tier: RiskTier
    factors: list[RiskFactor]


@dataclass(frozen=True)
class RiskRule:
    name: str
    field: str
    operator: str
    value: str | int | float
    points: int
    explanation: str

    def matches(self, customer: dict[str, Any]) -> bool:
        actual = customer[self.field]
        if self.operator == "equals":
            return actual == self.value
        if self.operator == "less_than":
            return actual < self.value
        if self.operator == "greater_than":
            return actual > self.value
        raise ValueError(f"Unsupported rule operator: {self.operator}")

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class TierThreshold:
    tier: RiskTier
    min_score: int
    max_score: int

    def public_dict(self) -> dict[str, Any]:
        return {
            "tier": self.tier.value,
            "min_score": self.min_score,
            "max_score": self.max_score,
        }


RISK_RULES = (
    RiskRule(
        "month_to_month_contract",
        "Contract",
        "equals",
        "Month-to-month",
        30,
        "Month-to-month contracts are easier to cancel.",
    ),
    RiskRule(
        "new_customer",
        "tenure",
        "less_than",
        12,
        20,
        "Tenure under 12 months indicates an early customer relationship.",
    ),
    RiskRule(
        "high_monthly_charges",
        "MonthlyCharges",
        "greater_than",
        80.0,
        15,
        "Monthly charges above $80 increase price sensitivity.",
    ),
    RiskRule(
        "no_tech_support",
        "TechSupport",
        "equals",
        "No",
        15,
        "The customer does not have tech support.",
    ),
    RiskRule(
        "no_online_security",
        "OnlineSecurity",
        "equals",
        "No",
        10,
        "The customer does not have online security.",
    ),
    RiskRule(
        "electronic_check",
        "PaymentMethod",
        "equals",
        "Electronic check",
        10,
        "Electronic check payments are associated with higher churn risk.",
    ),
)

TIER_THRESHOLDS = (
    TierThreshold(RiskTier.LOW, 0, 34),
    TierThreshold(RiskTier.MEDIUM, 35, 64),
    TierThreshold(RiskTier.HIGH, 65, 100),
)


def tier_for_score(score: int) -> RiskTier:
    for threshold in TIER_THRESHOLDS:
        if threshold.min_score <= score <= threshold.max_score:
            return threshold.tier
    raise ValueError("Risk score must be between 0 and 100")


def calculate_risk(customer: dict[str, Any]) -> RiskResult:
    matched = [rule for rule in RISK_RULES if rule.matches(customer)]
    factors = [RiskFactor(rule.name, rule.points, rule.explanation) for rule in matched]
    score = sum(factor.points for factor in factors)
    return RiskResult(score=score, tier=tier_for_score(score), factors=factors)


def model_info() -> dict[str, list[dict[str, Any]]]:
    return {
        "rules": [rule.public_dict() for rule in RISK_RULES],
        "thresholds": [threshold.public_dict() for threshold in TIER_THRESHOLDS],
    }
