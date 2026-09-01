import type {
  CustomerDetail,
  CustomerQuery,
  CustomerSummary,
  CustomersResponse,
  ModelInfo,
  OutreachStatus,
  OutreachUpdateResponse,
  RiskFactor,
  RiskRule,
  RiskTier,
  TierThreshold,
} from "./types";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const riskTiers: RiskTier[] = ["LOW", "MEDIUM", "HIGH"];
const outreachStatuses: OutreachStatus[] = ["NOT_CONTACTED", "IN_PROGRESS", "RESOLVED"];

type JsonObject = Record<string, unknown>;

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: JsonObject, key: string): string {
  if (typeof value[key] !== "string") throw new ApiError(`Unexpected response: ${key} is missing.`);
  return value[key];
}

function numberField(value: JsonObject, key: string): number {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
    throw new ApiError(`Unexpected response: ${key} is invalid.`);
  }
  return value[key];
}

function nullableNumberField(value: JsonObject, key: string): number | null {
  if (value[key] === null) return null;
  return numberField(value, key);
}

function riskTierField(value: unknown): RiskTier {
  if (typeof value !== "string" || !riskTiers.includes(value as RiskTier)) {
    throw new ApiError("Unexpected response: risk tier is invalid.");
  }
  return value as RiskTier;
}

function outreachField(value: unknown): OutreachStatus {
  if (typeof value !== "string" || !outreachStatuses.includes(value as OutreachStatus)) {
    throw new ApiError("Unexpected response: outreach status is invalid.");
  }
  return value as OutreachStatus;
}

async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.ok ? "The server returned an unreadable response." : `Request failed (${response.status}).`, response.status);
  }

  if (!response.ok) {
    const detail = isObject(payload) && typeof payload.detail === "string" ? payload.detail : `Request failed (${response.status}).`;
    throw new ApiError(detail, response.status);
  }
  return payload;
}

function parseSummary(payload: unknown): CustomerSummary {
  if (!isObject(payload)) throw new ApiError("Unexpected customer response.");
  return {
    customerID: stringField(payload, "customerID"),
    Contract: stringField(payload, "Contract"),
    tenure: numberField(payload, "tenure"),
    MonthlyCharges: numberField(payload, "MonthlyCharges"),
    TotalCharges: nullableNumberField(payload, "TotalCharges"),
    risk_score: numberField(payload, "risk_score"),
    risk_tier: riskTierField(payload.risk_tier),
    outreach_status: outreachField(payload.outreach_status),
  };
}

function parseRiskFactor(payload: unknown): RiskFactor {
  if (!isObject(payload)) throw new ApiError("Unexpected risk factor response.");
  return {
    name: stringField(payload, "name"),
    points: numberField(payload, "points"),
    explanation: stringField(payload, "explanation"),
  };
}

export async function getCustomers(query: CustomerQuery, signal?: AbortSignal): Promise<CustomersResponse> {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) });
  if (query.riskTier) params.set("risk_tier", query.riskTier);
  if (query.contract) params.set("contract", query.contract);
  if (query.outreachStatus) params.set("outreach_status", query.outreachStatus);
  if (query.search) params.set("search", query.search);
  const payload = await requestJson(`/customers?${params}`, { signal });
  if (!isObject(payload) || !Array.isArray(payload.items)) throw new ApiError("Unexpected customer list response.");
  return {
    items: payload.items.map(parseSummary),
    total: numberField(payload, "total"),
    total_pages: numberField(payload, "total_pages"),
    page: numberField(payload, "page"),
    page_size: numberField(payload, "page_size"),
  };
}

export async function getCustomer(customerId: string, signal?: AbortSignal): Promise<CustomerDetail> {
  const payload = await requestJson(`/customers/${encodeURIComponent(customerId)}`, { signal });
  if (!isObject(payload) || !Array.isArray(payload.risk_factors)) throw new ApiError("Unexpected customer detail response.");
  const nextStatus = payload.allowed_next_status;
  if (nextStatus !== null && (typeof nextStatus !== "string" || !outreachStatuses.includes(nextStatus as OutreachStatus))) {
    throw new ApiError("Unexpected response: next outreach status is invalid.");
  }
  return {
    ...parseSummary(payload),
    gender: stringField(payload, "gender"),
    SeniorCitizen: numberField(payload, "SeniorCitizen"),
    Partner: stringField(payload, "Partner"),
    Dependents: stringField(payload, "Dependents"),
    PhoneService: stringField(payload, "PhoneService"),
    MultipleLines: stringField(payload, "MultipleLines"),
    InternetService: stringField(payload, "InternetService"),
    OnlineSecurity: stringField(payload, "OnlineSecurity"),
    OnlineBackup: stringField(payload, "OnlineBackup"),
    DeviceProtection: stringField(payload, "DeviceProtection"),
    TechSupport: stringField(payload, "TechSupport"),
    StreamingTV: stringField(payload, "StreamingTV"),
    StreamingMovies: stringField(payload, "StreamingMovies"),
    PaperlessBilling: stringField(payload, "PaperlessBilling"),
    PaymentMethod: stringField(payload, "PaymentMethod"),
    Churn: stringField(payload, "Churn"),
    risk_factors: payload.risk_factors.map(parseRiskFactor),
    allowed_next_status: nextStatus as OutreachStatus | null,
  };
}

function parseRule(payload: unknown): RiskRule {
  if (!isObject(payload)) throw new ApiError("Unexpected model rule response.");
  const value = payload.value;
  if (typeof value !== "string" && typeof value !== "number") throw new ApiError("Unexpected model rule value.");
  return {
    name: stringField(payload, "name"),
    field: stringField(payload, "field"),
    operator: stringField(payload, "operator"),
    value,
    points: numberField(payload, "points"),
    explanation: stringField(payload, "explanation"),
  };
}

function parseThreshold(payload: unknown): TierThreshold {
  if (!isObject(payload)) throw new ApiError("Unexpected threshold response.");
  return {
    tier: riskTierField(payload.tier),
    min_score: numberField(payload, "min_score"),
    max_score: numberField(payload, "max_score"),
  };
}

export async function getModelInfo(signal?: AbortSignal): Promise<ModelInfo> {
  const payload = await requestJson("/model/info", { signal });
  if (!isObject(payload) || !Array.isArray(payload.rules) || !Array.isArray(payload.thresholds)) {
    throw new ApiError("Unexpected model information response.");
  }
  return { rules: payload.rules.map(parseRule), thresholds: payload.thresholds.map(parseThreshold) };
}

export async function updateOutreach(customerId: string, status: OutreachStatus): Promise<OutreachUpdateResponse> {
  const payload = await requestJson(`/customers/${encodeURIComponent(customerId)}/outreach`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!isObject(payload)) throw new ApiError("Unexpected outreach response.");
  const nextStatus = payload.allowed_next_status;
  if (nextStatus !== null && (typeof nextStatus !== "string" || !outreachStatuses.includes(nextStatus as OutreachStatus))) {
    throw new ApiError("Unexpected response: next outreach status is invalid.");
  }
  return {
    customerID: stringField(payload, "customerID"),
    outreach_status: outreachField(payload.outreach_status),
    allowed_next_status: nextStatus as OutreachStatus | null,
  };
}
