import csv
import math
from pathlib import Path
from typing import Any

from .models import OutreachStatus
from .scoring import calculate_risk


DATA_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "WA_Fn-UseC_-Telco-Customer-Churn.csv"
)

TELCO_COLUMNS = (
    "customerID",
    "gender",
    "SeniorCitizen",
    "Partner",
    "Dependents",
    "tenure",
    "PhoneService",
    "MultipleLines",
    "InternetService",
    "OnlineSecurity",
    "OnlineBackup",
    "DeviceProtection",
    "TechSupport",
    "StreamingTV",
    "StreamingMovies",
    "Contract",
    "PaperlessBilling",
    "PaymentMethod",
    "MonthlyCharges",
    "TotalCharges",
    "Churn",
)

REQUIRED_COLUMNS = set(TELCO_COLUMNS)

SCORE_CATEGORY_DOMAINS = {
    "Contract": {"Month-to-month", "One year", "Two year"},
    "TechSupport": {"Yes", "No", "No internet service"},
    "OnlineSecurity": {"Yes", "No", "No internet service"},
    "PaymentMethod": {
        "Electronic check",
        "Mailed check",
        "Bank transfer (automatic)",
        "Credit card (automatic)",
    },
}


class InvalidOutreachTransition(ValueError):
    pass


def next_outreach_status(
    current: OutreachStatus, requested: OutreachStatus | None = None
) -> OutreachStatus | None:
    allowed = {
        OutreachStatus.NOT_CONTACTED: OutreachStatus.IN_PROGRESS,
        OutreachStatus.IN_PROGRESS: OutreachStatus.RESOLVED,
        OutreachStatus.RESOLVED: None,
    }[current]
    if requested is not None and requested is not allowed:
        raise InvalidOutreachTransition(
            f"Cannot transition outreach from {current.value} to {requested.value}"
        )
    return allowed


def _parse_int(value: str | None, field: str, row_number: int) -> int:
    try:
        if value is None or value.strip() == "":
            raise ValueError
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {field} on CSV row {row_number}") from exc
    return parsed


def _parse_float(
    value: str | None, field: str, row_number: int, *, allow_blank: bool = False
) -> float | None:
    if value is not None and value.strip() == "" and allow_blank:
        return None
    try:
        if value is None or value.strip() == "":
            raise ValueError
        parsed = float(value)
        if not math.isfinite(parsed):
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {field} on CSV row {row_number}") from exc
    return parsed


def load_customers(path: Path = DATA_PATH) -> dict[str, dict[str, Any]]:
    try:
        handle = path.open("r", encoding="utf-8-sig", newline="")
    except OSError as exc:
        raise RuntimeError(f"Unable to load customer data from {path}") from exc

    try:
        with handle:
            reader = csv.DictReader(handle, strict=True)
            fieldnames = reader.fieldnames
            if not fieldnames or len(fieldnames) != len(set(fieldnames)):
                raise RuntimeError("Customer CSV has missing or duplicate headers")
            missing = REQUIRED_COLUMNS.difference(fieldnames)
            if missing:
                raise RuntimeError(
                    "Customer CSV is missing required columns: "
                    f"{', '.join(sorted(missing))}"
                )

            customers: dict[str, dict[str, Any]] = {}
            for row_number, row in enumerate(reader, start=2):
                if None in row or any(value is None for value in row.values()):
                    raise ValueError(f"Malformed customer CSV row {row_number}")
                blank_required = sorted(
                    column
                    for column in REQUIRED_COLUMNS - {"TotalCharges"}
                    if not row[column].strip()
                )
                if blank_required:
                    raise ValueError(
                        f"Blank required value on CSV row {row_number}: "
                        f"{', '.join(blank_required)}"
                    )
                for field, allowed_values in SCORE_CATEGORY_DOMAINS.items():
                    if row[field] not in allowed_values:
                        raise ValueError(
                            f"Invalid {field} on CSV row {row_number}: {row[field]}"
                        )
                customer_id = row["customerID"]
                if customer_id in customers:
                    raise ValueError(f"Duplicate customerID on CSV row {row_number}")

                record: dict[str, Any] = dict(row)
                record["SeniorCitizen"] = _parse_int(
                    row["SeniorCitizen"], "SeniorCitizen", row_number
                )
                record["tenure"] = _parse_int(row["tenure"], "tenure", row_number)
                record["MonthlyCharges"] = _parse_float(
                    row["MonthlyCharges"], "MonthlyCharges", row_number
                )
                record["TotalCharges"] = _parse_float(
                    row["TotalCharges"], "TotalCharges", row_number, allow_blank=True
                )
                if record["SeniorCitizen"] not in (0, 1):
                    raise ValueError(f"Invalid SeniorCitizen on CSV row {row_number}")
                if record["tenure"] < 0 or record["MonthlyCharges"] < 0:
                    raise ValueError(f"Negative numeric value on CSV row {row_number}")
                if record["TotalCharges"] is not None and record["TotalCharges"] < 0:
                    raise ValueError(f"Negative TotalCharges on CSV row {row_number}")

                risk = calculate_risk(record)
                record["risk_score"] = risk.score
                record["risk_tier"] = risk.tier
                record["risk_factors"] = risk.factors
                record["outreach_status"] = OutreachStatus.NOT_CONTACTED
                customers[customer_id] = record
    except (csv.Error, UnicodeError, ValueError, KeyError) as exc:
        raise RuntimeError(f"Customer CSV contains unusable data: {exc}") from exc

    if not customers:
        raise RuntimeError("Customer CSV contains no customer records")
    return customers
