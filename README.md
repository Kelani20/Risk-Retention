# Churn Risk & Retention Console

A small retention-operations console for the bundled IBM Telco Customer Churn sample. It gives an evaluator one clear flow: **find high-risk accounts -> understand the transparent score -> record outreach progress**.

## Live demo

- Console: [retention.usamakelani.com](https://retention.usamakelani.com)
- API model contract: [retention-api.usamakelani.com/model/info](https://retention-api.usamakelani.com/model/info)

The API runs on Render's free tier, so the first request after an idle period can take longer while the service wakes up.

## Why this stack

- **FastAPI** provides typed query/body validation, a compact API, lifecycle-managed data loading, and automatic local API docs.
- **React + TypeScript + Vite** keep the operational UI fast, typed, and easy to build as static assets.
- **Tailwind CSS** supplies the styling pipeline while the application stylesheet owns the visual system.
- A deterministic rule model makes every point explainable; it is intentionally not presented as a predictive ML model.

## Architecture and data model

```text
Browser (React/TypeScript)
  |-- GET /customers                 paged, ranked, filtered queue
  |-- GET /customers/{customerID}    profile, score factors, next action
  |-- PATCH /customers/{customerID}/outreach
  `-- GET /model/info                shared scoring rules and thresholds
                    |
              FastAPI service
                    |
       CSV -> validated startup load -> dict[customerID, customer]
```

The API loads all 7,043 CSV rows once at process startup into an in-memory Python dictionary keyed by `customerID`. Source attributes and computed scores are read-only; only `outreach_status` mutates. State is process-local, is reset by a restart/redeploy, and is deliberately served by exactly **one production worker** so requests see one consistent dictionary.

The bundled source is the [Kaggle Telco Customer Churn dataset](https://www.kaggle.com/datasets/blastchar/telco-customer-churn). The `Churn` column is retained for display but excluded from scoring because it is the outcome/target; using it would leak the answer into the risk score.

## Run locally

Prerequisites: Python 3.12 and Node.js 22 LTS. Run the backend and frontend in separate terminals from the repository root.

### Windows PowerShell

Backend:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload
```

Frontend:

```powershell
Copy-Item frontend\.env.example frontend\.env
Set-Location frontend
npm ci
npm run dev
```

### macOS/Linux

Backend:

```bash
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The UI uses `VITE_API_BASE_URL` from `frontend/.env` and defaults to `http://localhost:8000`; FastAPI's local API docs are at `http://localhost:8000/docs`.

## Scoring contract

Scores are the sum of six independent rules:

| Rule | Points |
| --- | ---: |
| Contract is `Month-to-month` | +30 |
| Tenure is under 12 months | +20 |
| Monthly charges are over $80 | +15 |
| Tech support is `No` | +15 |
| Online security is `No` | +10 |
| Payment method is `Electronic check` | +10 |

Risk tiers are **LOW 0-34**, **MEDIUM 35-64**, and **HIGH 65-100**. `/model/info` is generated from the same rule and threshold objects used to calculate customer scores, so the UI's model guide cannot drift from backend scoring configuration.

## API and workflow behavior

`GET /customers` performs pagination, highest-score-first ordering, exact risk/contract/outreach filters, and case-insensitive customer-ID search on the server. Page size is limited to 1-100. The detail endpoint supplies matched factors and the allowed next outreach state.

Outreach is a forward-only state machine:

```text
NOT_CONTACTED -> IN_PROGRESS -> RESOLVED
```

Skipping or reversing a state returns `409 Conflict`; malformed statuses return `422`, and missing customers return `404`. Out-of-range pagination integers (`page` below 1 or `page_size` outside 1-100) return `400`, while malformed pagination query types are rejected by FastAPI/Pydantic with `422`. The frontend validates response shapes, aborts superseded reads, and presents loading, empty, retryable error, and mutation-error states.

At startup, missing, malformed, duplicate, or invalid CSV data fails closed instead of serving partial results. Unexpected server failures return only `{"detail":"Internal server error"}`. Request logs contain method, route template, status, and duration; they omit customer IDs, exception text, and tracebacks to avoid leaking record or internal details.

## Tests and CI

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
Set-Location frontend
npm ci
npm run build
```

Backend coverage exercises scoring and boundary rules, target-leakage exclusion, CSV validation, pagination/filter/search, detail serialization, outreach transitions, CORS, startup lifecycle, and sanitized logging. The frontend build performs TypeScript project compilation before Vite's production bundle. GitHub Actions runs both checks on pull requests to `main` and pushes to `main`.

## Deployment and tradeoffs

`render.yaml` defines the native-Python Render web service with `/model/info` health checks and one Uvicorn worker. It runs from the repository root because the backend depends on the repository-level bundled dataset. Render serves the API through the verified `retention-api.usamakelani.com` custom domain, with a DNS-only Cloudflare CNAME to the Render service.

Cloudflare Workers Static Assets serves the production Vite bundle at `retention.usamakelani.com`. The bundle is built with `VITE_API_BASE_URL=https://retention-api.usamakelani.com`, and Cloudflare manages the frontend custom-domain DNS and TLS configuration.

This design favors transparent evaluation and zero infrastructure over durability. Filtering and sorting scan the in-memory collection on each request, and outreach state does not survive process replacement. Horizontal scaling or multiple workers would create divergent copies.

For scale, move customers and outreach events to a database, add durable user/audit identity and idempotent writes, push filtering/sorting/pagination into indexed queries, and replace or calibrate the heuristic only after establishing an offline evaluation and monitoring process.

## With more time

- Move customer and outreach state to persistent storage, with indexed queries and outreach history including timestamps, notes, and audit metadata.
- Add authentication and role-based authorization for retention agents and team leads.
- Replace the heuristic with a versioned model service, with offline evaluation, calibration, cohort monitoring, and production monitoring.
- Add frontend component and end-to-end tests, including automated accessibility checks.
