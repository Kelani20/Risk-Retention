import type { CustomerSummary } from "../types";
import { RiskBadge } from "./RiskBadge";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function statusLabel(status: CustomerSummary["outreach_status"]) {
  return status === "NOT_CONTACTED" ? "Not contacted" : status === "IN_PROGRESS" ? "In progress" : "Resolved";
}

interface CustomerTableProps {
  customers: CustomerSummary[];
  onOpen: (customerId: string, trigger: HTMLButtonElement) => void;
}

export function CustomerTable({ customers, onOpen }: CustomerTableProps) {
  return (
    <div className="table-scroll">
      <table>
        <caption className="sr-only">Customers ranked by highest churn risk</caption>
        <thead>
          <tr>
            <th scope="col">Customer ID</th>
            <th scope="col">Risk</th>
            <th scope="col">Contract</th>
            <th scope="col" className="numeric-cell">Tenure</th>
            <th scope="col" className="numeric-cell">Monthly charges</th>
            <th scope="col">Outreach</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.customerID} className={`customer-row customer-row--${customer.risk_tier.toLowerCase()}`}>
              <td className="customer-id-cell">
                <button type="button" onClick={(event) => onOpen(customer.customerID, event.currentTarget)}>
                  {customer.customerID}
                  <span aria-hidden="true">↗</span>
                </button>
              </td>
              <td><RiskBadge tier={customer.risk_tier} score={customer.risk_score} /></td>
              <td>{customer.Contract}</td>
              <td className="numeric-cell"><span>{customer.tenure}</span> mo</td>
              <td className="numeric-cell money-cell">{money.format(customer.MonthlyCharges)}</td>
              <td><span className={`status status--${customer.outreach_status.toLowerCase()}`}>{statusLabel(customer.outreach_status)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
