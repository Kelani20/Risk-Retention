import { useCallback, useEffect, useRef, useState } from "react";
import { getCustomer, getCustomers, getModelInfo, updateOutreach } from "./api";
import { CustomerDetail } from "./components/CustomerDetail";
import { CustomerTable } from "./components/CustomerTable";
import { Filters } from "./components/Filters";
import type { CustomerDetail as CustomerDetailType, CustomerQuery, CustomersResponse, ModelInfo, OutreachStatus } from "./types";

const initialQuery: CustomerQuery = { page: 1, pageSize: 25, riskTier: "", contract: "", outreachStatus: "", search: "" };

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function App() {
  const [query, setQuery] = useState<CustomerQuery>(initialQuery);
  const [customers, setCustomers] = useState<CustomersResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardInitialized, setDashboardInitialized] = useState(false);
  const [dashboardRequest, setDashboardRequest] = useState(0);
  const dashboardController = useRef<AbortController | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetailType | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRequest, setDetailRequest] = useState(0);
  const detailController = useRef<AbortController | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);

  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const modelController = useRef<AbortController | null>(null);

  const loadDashboard = useCallback(async (currentQuery: CustomerQuery) => {
    dashboardController.current?.abort();
    const controller = new AbortController();
    let redirectingPage = false;
    dashboardController.current = controller;
    setDashboardLoading(true);
    setDashboardError(null);
    setCustomers(null);
    try {
      const response = await getCustomers(currentQuery, controller.signal);
      if (!controller.signal.aborted && response.total > 0 && response.total_pages > 0 && currentQuery.page > response.total_pages) {
        redirectingPage = true;
        setQuery((latestQuery) => latestQuery === currentQuery ? { ...latestQuery, page: response.total_pages } : latestQuery);
      } else if (!controller.signal.aborted) {
        setCustomers(response);
      }
    } catch (error) {
      if (!isAbort(error)) setDashboardError(messageFrom(error, "The customer queue could not be loaded."));
    } finally {
      if (!controller.signal.aborted && !redirectingPage) {
        setDashboardLoading(false);
        setDashboardInitialized(true);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard(query);
    return () => dashboardController.current?.abort();
  }, [query, dashboardRequest, loadDashboard]);

  const loadModel = useCallback(async () => {
    modelController.current?.abort();
    const controller = new AbortController();
    modelController.current = controller;
    setModelLoading(true);
    setModelError(null);
    try {
      const response = await getModelInfo(controller.signal);
      if (!controller.signal.aborted) setModelInfo(response);
    } catch (error) {
      if (!isAbort(error)) {
        setModelInfo(null);
        setModelError(messageFrom(error, "Model information could not be loaded."));
      }
    } finally {
      if (!controller.signal.aborted) setModelLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModel();
    return () => modelController.current?.abort();
  }, [loadModel]);

  const loadDetail = useCallback(async (customerId: string) => {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await getCustomer(customerId, controller.signal);
      if (!controller.signal.aborted) setDetail(response);
    } catch (error) {
      if (!isAbort(error)) setDetailError(messageFrom(error, "The full customer profile could not be loaded."));
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      detailController.current?.abort();
      return;
    }
    void loadDetail(selectedId);
    return () => detailController.current?.abort();
  }, [selectedId, detailRequest, loadDetail]);

  function updateFilter(field: "riskTier" | "contract" | "outreachStatus", value: string) {
    setQuery((current) => ({ ...current, [field]: value, page: 1 }));
  }

  function openDetail(customerId: string, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    setSelectedId(customerId);
  }

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, []);

  async function advanceOutreach(status: OutreachStatus) {
    if (!selectedId || !detail) return;
    const response = await updateOutreach(selectedId, status);
    setDetail((current) => current ? { ...current, outreach_status: response.outreach_status, allowed_next_status: response.allowed_next_status } : current);
    await loadDashboard(query);
  }

  const firstItem = customers && customers.total ? (customers.page - 1) * customers.page_size + 1 : 0;
  const lastItem = customers ? Math.min(customers.page * customers.page_size, customers.total) : 0;

  return (
    <main>
      <header className="masthead">
        <div className="brand-mark" aria-hidden="true"><span>R</span></div>
        <div className="masthead__copy">
          <p className="eyebrow">Retention operations / Live queue</p>
          <h1>Accounts that need<br /><em>human attention.</em></h1>
          <p>Server-ranked churn risk, transparent scoring, and a deliberate outreach workflow.</p>
        </div>
        <div className="masthead__note"><span>Priority order</span><strong>Highest risk first</strong><small>Live from the scoring service</small></div>
      </header>

      <div className="workspace">
        <Filters
          query={query}
          disabled={dashboardLoading}
          onFilterChange={updateFilter}
          onSearch={(search) => setQuery((current) => ({ ...current, search, page: 1 }))}
          onClear={() => setQuery(initialQuery)}
        />

        <section className="queue" aria-labelledby="queue-title" aria-busy={dashboardLoading}>
          <div className="queue__header">
            <div><p className="eyebrow">Ranked customer queue</p><h2 id="queue-title">Retention book</h2></div>
            {customers && <div className="record-count" aria-live="polite"><strong>{customers.total.toLocaleString()}</strong><span>matching accounts</span></div>}
          </div>

          {dashboardLoading && <div className="dashboard-state" role="status"><span className="loading-mark" /><div><strong>{dashboardInitialized ? "Updating the queue" : "Opening the retention book"}</strong><p>Requesting this page from the risk service…</p></div></div>}
          {!dashboardLoading && dashboardError && <div className="dashboard-state dashboard-state--error" role="alert"><div><strong>Queue unavailable</strong><p>{dashboardError}</p></div><button className="secondary-button" type="button" onClick={() => setDashboardRequest((value) => value + 1)}>Retry</button></div>}
          {!dashboardLoading && customers?.items.length === 0 && <div className="dashboard-state dashboard-state--empty"><div><strong>No accounts match this view</strong><p>Adjust or clear the filters to widen the queue.</p></div><button className="secondary-button" type="button" onClick={() => setQuery(initialQuery)}>Clear filters</button></div>}
          {!dashboardLoading && customers && customers.items.length > 0 && <CustomerTable customers={customers.items} onOpen={openDetail} />}

          {!dashboardLoading && customers && customers.items.length > 0 && (
            <nav className="pagination" aria-label="Customer pages">
              <p>Showing <strong>{firstItem}–{lastItem}</strong> of <strong>{customers.total.toLocaleString()}</strong></p>
              <div>
                <button className="page-button" type="button" disabled={query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))} aria-label="Previous page">←</button>
                <span>Page <strong>{customers.page}</strong> / {customers.total_pages}</span>
                <button className="page-button" type="button" disabled={query.page >= customers.total_pages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))} aria-label="Next page">→</button>
              </div>
            </nav>
          )}
        </section>
      </div>

      <footer><span>Retention Desk</span><span>Operational scoring, not a prediction guarantee.</span></footer>

      {selectedId && (
        <CustomerDetail
          customerId={selectedId}
          detail={detail}
          loading={detailLoading}
          error={detailError}
          modelInfo={modelInfo}
          modelLoading={modelLoading}
          modelError={modelError}
          onClose={closeDetail}
          onRetry={() => setDetailRequest((value) => value + 1)}
          onRetryModel={() => void loadModel()}
          onUpdateOutreach={advanceOutreach}
        />
      )}
    </main>
  );
}
