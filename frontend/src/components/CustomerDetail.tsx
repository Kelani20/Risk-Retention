import { useEffect, useRef, useState } from "react";
import type { CustomerDetail as CustomerDetailType, ModelInfo, OutreachStatus } from "../types";
import { RiskBadge } from "./RiskBadge";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

interface CustomerDetailProps {
  customerId: string;
  detail: CustomerDetailType | null;
  loading: boolean;
  error: string | null;
  modelInfo: ModelInfo | null;
  modelLoading: boolean;
  modelError: string | null;
  onClose: () => void;
  onRetry: () => void;
  onRetryModel: () => void;
  onUpdateOutreach: (customerId: string, status: OutreachStatus) => Promise<void>;
}

export function CustomerDetail({
  customerId,
  detail,
  loading,
  error,
  modelInfo,
  modelLoading,
  modelError,
  onClose,
  onRetry,
  onRetryModel,
  onUpdateOutreach,
}: CustomerDetailProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeCustomerIdRef = useRef(customerId);
  activeCustomerIdRef.current = customerId;
  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    setMutating(false);
    setMutationError(null);
  }, [customerId]);

  async function advanceOutreach(status: OutreachStatus) {
    const mutationCustomerId = customerId;
    setMutating(true);
    setMutationError(null);
    try {
      await onUpdateOutreach(mutationCustomerId, status);
    } catch (caught) {
      if (activeCustomerIdRef.current === mutationCustomerId) {
        setMutationError(caught instanceof Error ? caught.message : "Outreach could not be updated.");
      }
    } finally {
      if (activeCustomerIdRef.current === mutationCustomerId) setMutating(false);
    }
  }

  const profile = detail
    ? [
        ["Gender", detail.gender], ["Senior citizen", detail.SeniorCitizen ? "Yes" : "No"], ["Partner", detail.Partner],
        ["Dependents", detail.Dependents], ["Phone service", detail.PhoneService], ["Multiple lines", detail.MultipleLines],
        ["Internet service", detail.InternetService], ["Online security", detail.OnlineSecurity], ["Online backup", detail.OnlineBackup],
        ["Device protection", detail.DeviceProtection], ["Tech support", detail.TechSupport], ["Streaming TV", detail.StreamingTV],
        ["Streaming movies", detail.StreamingMovies], ["Paperless billing", detail.PaperlessBilling], ["Payment method", detail.PaymentMethod],
        ["Total charges", detail.TotalCharges === null ? "Unavailable" : money.format(detail.TotalCharges)], ["Observed churn", detail.Churn],
      ]
    : [];

  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="Close customer detail" />
      <aside ref={drawerRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer__header">
          <div>
            <p className="eyebrow">Customer file</p>
            <h2 id="drawer-title">{customerId}</h2>
          </div>
          <button ref={closeRef} className="close-button" type="button" onClick={onClose} aria-label="Close customer detail">×</button>
        </header>

        {loading && <div className="drawer-state" role="status"><span className="loading-mark" />Loading full customer profile…</div>}
        {!loading && error && (
          <div className="drawer-state drawer-state--error" role="alert">
            <strong>Customer file unavailable</strong><p>{error}</p><button className="secondary-button" type="button" onClick={onRetry}>Retry</button>
          </div>
        )}

        {!loading && detail && (
          <div className="drawer__body">
            <section className="detail-lead" aria-label="Risk summary">
              <div className="detail-score"><span>Risk score</span><strong>{detail.risk_score}</strong><small>/ 100</small></div>
              <RiskBadge tier={detail.risk_tier} />
              <dl>
                <div><dt>Contract</dt><dd>{detail.Contract}</dd></div>
                <div><dt>Tenure</dt><dd>{detail.tenure} {detail.tenure === 1 ? "month" : "months"}</dd></div>
                <div><dt>Monthly</dt><dd>{money.format(detail.MonthlyCharges)}</dd></div>
              </dl>
            </section>

            <section className="detail-section outreach-section">
              <div className="section-heading"><div><p className="eyebrow">Retention workflow</p><h3>Outreach</h3></div><span className={`status status--${detail.outreach_status.toLowerCase()}`}>{humanize(detail.outreach_status)}</span></div>
              {detail.allowed_next_status ? (
                <button className="primary-button outreach-button" type="button" disabled={mutating} onClick={() => advanceOutreach(detail.allowed_next_status!)}>
                  {mutating ? "Saving…" : detail.allowed_next_status === "IN_PROGRESS" ? "Start outreach" : "Mark resolved"}
                </button>
              ) : <p className="terminal-note"><span aria-hidden="true">✓</span> Outreach is resolved. No further action is available.</p>}
              {mutationError && <p className="inline-error" role="alert">{mutationError}</p>}
            </section>

            <section className="detail-section">
              <div className="section-heading"><div><p className="eyebrow">Score anatomy</p><h3>Risk factors</h3></div><span className="count-label">{detail.risk_factors.length} active</span></div>
              {detail.risk_factors.length ? (
                <ol className="factor-list">
                  {detail.risk_factors.map((factor) => (
                    <li key={factor.name}><div><strong>{humanize(factor.name)}</strong><p>{factor.explanation}</p></div><span>+{factor.points}</span></li>
                  ))}
                </ol>
              ) : <p className="muted-copy">No risk rules apply to this customer.</p>}
            </section>

            <section className="detail-section">
              <div className="section-heading"><div><p className="eyebrow">Account record</p><h3>Full profile</h3></div></div>
              <dl className="profile-grid">{profile.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            </section>

            <section className="detail-section model-section">
              <div className="section-heading"><div><p className="eyebrow">Transparent scoring</p><h3>Model guide</h3></div></div>
              {modelLoading && <p className="muted-copy" role="status">Loading scoring rules…</p>}
              {!modelLoading && modelError && <div className="inline-error" role="alert">{modelError} <button className="text-button" type="button" onClick={onRetryModel}>Retry</button></div>}
              {!modelLoading && modelInfo && (
                <>
                  <div className="thresholds" aria-label="Risk thresholds">
                    {modelInfo.thresholds.map((threshold) => <div key={threshold.tier}><RiskBadge tier={threshold.tier} /><span>{threshold.min_score}–{threshold.max_score}</span></div>)}
                  </div>
                  <details><summary>View all {modelInfo.rules.length} scoring rules</summary><ul className="rule-list">{modelInfo.rules.map((rule) => <li key={rule.name}><span>+{rule.points}</span><p>{rule.explanation}</p></li>)}</ul></details>
                </>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
