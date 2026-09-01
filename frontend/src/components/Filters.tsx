import { useEffect, useState, type FormEvent } from "react";
import type { CustomerQuery, OutreachStatus, RiskTier } from "../types";

interface FiltersProps {
  query: CustomerQuery;
  disabled: boolean;
  onFilterChange: (field: "riskTier" | "contract" | "outreachStatus", value: string) => void;
  onSearch: (value: string) => void;
  onClear: () => void;
}

export function Filters({ query, disabled, onFilterChange, onSearch, onClear }: FiltersProps) {
  const [draftSearch, setDraftSearch] = useState(query.search);

  useEffect(() => setDraftSearch(query.search), [query.search]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(draftSearch.trim());
  }

  const hasFilters = Boolean(query.riskTier || query.contract || query.outreachStatus || query.search);

  return (
    <form className="filter-panel" onSubmit={submitSearch} aria-label="Customer filters">
      <div className="filter-panel__head">
        <div>
          <p className="eyebrow">Queue controls</p>
          <h2>Focus the book</h2>
        </div>
        {hasFilters && (
          <button className="text-button" type="button" onClick={onClear} disabled={disabled}>
            Clear all
          </button>
        )}
      </div>

      <div className="filter-grid">
        <label className="field-label">
          Risk tier
          <select
            value={query.riskTier}
            onChange={(event) => onFilterChange("riskTier", event.target.value as RiskTier | "")}
            disabled={disabled}
          >
            <option value="">All tiers</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>

        <label className="field-label">
          Contract
          <select value={query.contract} onChange={(event) => onFilterChange("contract", event.target.value)} disabled={disabled}>
            <option value="">All contracts</option>
            <option value="Month-to-month">Month-to-month</option>
            <option value="One year">One year</option>
            <option value="Two year">Two year</option>
          </select>
        </label>

        <label className="field-label">
          Outreach
          <select
            value={query.outreachStatus}
            onChange={(event) => onFilterChange("outreachStatus", event.target.value as OutreachStatus | "")}
            disabled={disabled}
          >
            <option value="">All statuses</option>
            <option value="NOT_CONTACTED">Not contacted</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>

        <div className="field-label field-label--search">
          <label htmlFor="customer-search">Customer ID</label>
          <span className="search-control">
            <input
              id="customer-search"
              type="search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSearch(draftSearch.trim());
                }
              }}
              placeholder="e.g. 7590-VHVEG"
              autoComplete="off"
              disabled={disabled}
            />
            <button className="primary-button search-button" type="submit" disabled={disabled}>
              Search
            </button>
          </span>
        </div>
      </div>
    </form>
  );
}
