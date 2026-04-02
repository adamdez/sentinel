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

/**
 * Parse founder IDs from env-like comma-separated input.
 */
export function parseFounderUserIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const piece of raw.split(",")) {
    const id = piece.trim();
    if (!id) continue;
    seen.add(id);
  }
  return Array.from(seen);
}

export interface FounderEffortCallRow {
  duration_sec?: number | null;
  durationSec?: number | null;
}

export interface FounderEffortSummary {
  callCount: number;
  talkMinutes: number;
  wrapMinutes: number;
  founderHours: number;
}

/**
 * Estimate founder effort from call rows using talk time + fixed wrap time per call.
 * This is intentionally conservative and marked as estimated in UI copy.
 */
export function computeFounderEffortFromCalls(
  rows: FounderEffortCallRow[],
  wrapMinutesPerCall = 2,
): FounderEffortSummary {
  const callCount = rows.length;
  const talkMinutes = rows.reduce((sum, row) => {
    const durationSec = Number(row.duration_sec ?? row.durationSec ?? 0);
    if (!Number.isFinite(durationSec) || durationSec <= 0) return sum;
    return sum + (durationSec / 60);
  }, 0);
  const wrapMinutes = Math.max(0, wrapMinutesPerCall) * callCount;
  const founderHoursRaw = (talkMinutes + wrapMinutes) / 60;
  const founderHours = Math.round(founderHoursRaw * 10) / 10;

  return {
    callCount,
    talkMinutes: Math.round(talkMinutes * 10) / 10,
    wrapMinutes: Math.round(wrapMinutes * 10) / 10,
    founderHours,
  };
}
