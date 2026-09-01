export type RiskTier = "LOW" | "MEDIUM" | "HIGH";
export type OutreachStatus = "NOT_CONTACTED" | "IN_PROGRESS" | "RESOLVED";

export interface CustomerSummary {
  customerID: string;
  Contract: string;
  tenure: number;
  MonthlyCharges: number;
  TotalCharges: number | null;
  risk_score: number;
  risk_tier: RiskTier;
  outreach_status: OutreachStatus;
}

export interface RiskFactor {
  name: string;
  points: number;
  explanation: string;
}

export interface CustomerDetail extends CustomerSummary {
  gender: string;
  SeniorCitizen: number;
  Partner: string;
  Dependents: string;
  PhoneService: string;
  MultipleLines: string;
  InternetService: string;
  OnlineSecurity: string;
  OnlineBackup: string;
  DeviceProtection: string;
  TechSupport: string;
  StreamingTV: string;
  StreamingMovies: string;
  PaperlessBilling: string;
  PaymentMethod: string;
  Churn: string;
  risk_factors: RiskFactor[];
  allowed_next_status: OutreachStatus | null;
}

export interface CustomersResponse {
  items: CustomerSummary[];
  total: number;
  total_pages: number;
  page: number;
  page_size: number;
}

export interface CustomerQuery {
  page: number;
  pageSize: number;
  riskTier: RiskTier | "";
  contract: string;
  outreachStatus: OutreachStatus | "";
  search: string;
}

export interface RiskRule {
  name: string;
  field: string;
  operator: string;
  value: string | number;
  points: number;
  explanation: string;
}

export interface TierThreshold {
  tier: RiskTier;
  min_score: number;
  max_score: number;
}

export interface ModelInfo {
  rules: RiskRule[];
  thresholds: TierThreshold[];
}

export interface OutreachUpdateResponse {
  customerID: string;
  outreach_status: OutreachStatus;
  allowed_next_status: OutreachStatus | null;
}
