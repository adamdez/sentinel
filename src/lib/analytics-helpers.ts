/**
 * Shared analytics helpers
 *
 * Functions used by multiple analytics routes to ensure consistent
 * metric computation across kpi-summary and source-performance.
 */

/**
 * Determines if a deal status represents a contract.
 * Used by both kpi-summary and source-performance routes
 * to ensure consistent contract counting.
 *
 * Canonical statuses: under_contract, contract, contracted, closed, assigned.
 * Note: "negotiating" is NOT a contract status — it precedes contract signing.
 */
export function isContractStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s === "under_contract" ||
    s === "contract" ||
    s === "contracted" ||
    s === "closed" ||
    s === "assigned"
  );
}

/**
 * Determines if a deal is closed (has a closed_at timestamp or status is "closed").
 */
export function isClosedDeal(deal: { status?: string | null; closed_at?: string | null }): boolean {
  const s = (deal.status ?? "").toLowerCase();
  return s === "closed" || Boolean(deal.closed_at);
}
