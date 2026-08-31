import logging
import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from time import perf_counter
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import OutreachStatus, OutreachUpdate, RiskTier
from .scoring import model_info
from .store import (
    DATA_PATH,
    InvalidOutreachTransition,
    load_customers,
    next_outreach_status,
)


logger = logging.getLogger(__name__)

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "https://retention.usamakelani.com",
]


def _serialize_customer(
    customer: dict[str, Any], *, include_detail: bool
) -> dict[str, Any]:
    serialized = {
        key: value for key, value in customer.items() if key != "risk_factors"
    }
    serialized["risk_tier"] = customer["risk_tier"].value
    serialized["outreach_status"] = customer["outreach_status"].value
    if include_detail:
        serialized["risk_factors"] = [
            asdict(factor) for factor in customer["risk_factors"]
        ]
        allowed = next_outreach_status(customer["outreach_status"])
        serialized["allowed_next_status"] = allowed.value if allowed else None
    return serialized


def create_app(data_path: Path | None = None) -> FastAPI:
    source_path = data_path or DATA_PATH

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.customers = load_customers(source_path)
        yield

    api = FastAPI(lifespan=lifespan)

    origins = list(DEFAULT_CORS_ORIGINS)
    for origin in os.getenv("RETENTION_CORS_ORIGINS", "").split(","):
        if origin.strip() and origin.strip() not in origins:
            origins.append(origin.strip())
    api.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.middleware("http")
    async def log_request(request: Request, call_next):
        started = perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled request failure method=%s path=%s status_code=500 duration_ms=%.2f",
                request.method,
                request.url.path,
                (perf_counter() - started) * 1000,
            )
            raise
        duration_ms = (perf_counter() - started) * 1000
        log = logger.error if response.status_code >= 500 else logger.info
        log(
            "request method=%s path=%s status_code=%d duration_ms=%.2f",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    @api.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500, content={"detail": "Internal server error"}
        )

    @api.get("/customers")
    async def list_customers(
        request: Request,
        page: int = 1,
        page_size: int = 25,
        risk_tier: RiskTier | None = None,
        contract: str | None = None,
        outreach_status: OutreachStatus | None = None,
        search: str | None = Query(default=None),
    ):
        if page < 1 or not 1 <= page_size <= 100:
            raise HTTPException(status_code=400, detail="Invalid pagination parameters")

        customers = list(request.app.state.customers.values())
        if risk_tier is not None:
            customers = [c for c in customers if c["risk_tier"] is risk_tier]
        if contract is not None:
            customers = [c for c in customers if c["Contract"] == contract]
        if outreach_status is not None:
            customers = [
                c for c in customers if c["outreach_status"] is outreach_status
            ]
        if search is not None:
            needle = search.lower()
            customers = [c for c in customers if needle in c["customerID"].lower()]

        customers.sort(key=lambda c: (-c["risk_score"], c["customerID"]))
        total = len(customers)
        start = (page - 1) * page_size
        selected = customers[start : start + page_size]
        return {
            "items": [
                _serialize_customer(customer, include_detail=False)
                for customer in selected
            ],
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
            "page": page,
            "page_size": page_size,
        }

    @api.get("/customers/{customer_id}")
    async def customer_detail(customer_id: str, request: Request):
        customer = request.app.state.customers.get(customer_id)
        if customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        return _serialize_customer(customer, include_detail=True)

    @api.patch("/customers/{customer_id}/outreach")
    async def update_outreach(
        customer_id: str, update: OutreachUpdate, request: Request
    ):
        customer = request.app.state.customers.get(customer_id)
        if customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        try:
            next_outreach_status(customer["outreach_status"], update.status)
        except InvalidOutreachTransition as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        customer["outreach_status"] = update.status
        allowed = next_outreach_status(update.status)
        return {
            "customerID": customer_id,
            "outreach_status": update.status.value,
            "allowed_next_status": allowed.value if allowed else None,
        }

    @api.get("/model/info")
    async def get_model_info():
        return model_info()

    return api


app = create_app()
