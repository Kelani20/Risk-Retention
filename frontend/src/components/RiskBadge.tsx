import type { RiskTier } from "../types";

export function RiskBadge({ tier, score }: { tier: RiskTier; score?: number }) {
  return (
    <span className={`risk-badge risk-badge--${tier.toLowerCase()}`}>
      <span aria-hidden="true" className="risk-badge__dot" />
      <span>{tier}</span>
      {score !== undefined && <span className="risk-badge__score">{score}</span>}
    </span>
  );
}
