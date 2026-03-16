/**
 * buyer-fit.ts
 *
 * Deterministic, read-only buyer-to-lead fit scorer.
 *
 * Rules:
 * - Pure function. No async. No AI. No external calls.
 * - Hard gates eliminate candidates before scoring (DNC, inactive, price floor miss).
 * - Soft signals produce a 0–100 score for ranking.
 * - score_inputs is returned alongside every entry so operators can see exactly
 *   why a buyer ranked where they did.
 * - Staleness is flagged but does NOT reduce the score — hiding a buyer because
 *   they haven't been contacted recently is worse than surfacing them with a warning.
 */

import type { BuyerRow } from "@/lib/buyer-types";

// ── Lead context shape passed to the scorer ────────────────────────────────

export interface LeadContext {
  market: string | null;          // e.g. "spokane_county"
  zip: string | null;
  propertyType: string | null;    // e.g. "sfr", "multi"
  estimatedValue: number | null;  // estimated ARV proxy
  isVacant: boolean;
  conditionLevel: number | null;  // 1–5 scale from lead qualification
  priceExpectation: number | null; // seller's ask — our assignment price proxy
}

// ── Buyer with SLAUD Phase 1 fields (runtime shape from DB) ───────────────

export interface BuyerWithPhase1 extends BuyerRow {
  arv_max: number | null;
  close_speed_days: number | null;
  reliability_score: number | null;  // 1–5, manual
  deals_closed: number;
  last_contacted_at: string | null;
  do_not_contact: boolean;
}

// ── Score inputs — transparent, one per check ─────────────────────────────

export interface ScoreInputs {
  market_match: boolean;
  price_in_range: boolean | null;       // null = buyer has no price range set
  arv_ok: boolean | null;               // null = no arv_max set
  asset_type_match: boolean | null;     // null = buyer accepts any
  rehab_ok: boolean | null;             // null = no condition info
  occupancy_ok: boolean;
  pof_verified: boolean;
  reliability_score: number | null;
  deals_closed: number;
  stale: boolean;                       // last_contacted_at > 90 days or null
}

// ── Radar entry — one per buyer that passes hard gates ────────────────────

export interface RadarEntry {
  buyer: BuyerWithPhase1;
  score: number;          // 0–100, for ranking only
  score_inputs: ScoreInputs;
  flags: string[];        // human-readable flag strings shown to Logan
  stale: boolean;
  eliminated: false;
}

export interface EliminatedEntry {
  buyer: BuyerWithPhase1;
  eliminated: true;
  reason: string;
}

export type ScorerResult = RadarEntry | EliminatedEntry;

// ── Staleness threshold ────────────────────────────────────────────────────

const STALE_DAYS = 90;

function isStale(lastContactedAt: string | null): boolean {
  if (!lastContactedAt) return true;
  const ms = Date.now() - new Date(lastContactedAt).getTime();
  return ms > STALE_DAYS * 24 * 60 * 60 * 1000;
}

// ── Rehab mapping — buyer tolerance vs condition level ────────────────────
// conditionLevel 1 = gut / needs everything, 5 = turnkey

const REHAB_MIN_CONDITION: Record<string, number> = {
  none: 5,
  light: 4,
  moderate: 3,
  heavy: 2,
  gut: 1,
};

function rehabOk(buyerTolerance: string | null, conditionLevel: number | null): boolean | null {
  if (!buyerTolerance || conditionLevel == null) return null;
  const minCondition = REHAB_MIN_CONDITION[buyerTolerance] ?? 1;
  return conditionLevel >= minCondition;
}

// ── Occupancy check ───────────────────────────────────────────────────────

function occupancyOk(buyerPref: string, isVacant: boolean): boolean {
  if (buyerPref === "either") return true;
  if (buyerPref === "vacant") return isVacant;
  if (buyerPref === "occupied") return !isVacant;
  return true;
}

// ── Asset type check ──────────────────────────────────────────────────────
// Maps property_type strings to buyer asset_types values

const PROPERTY_TO_ASSET: Record<string, string> = {
  sfr: "sfr",
  "single family": "sfr",
  "single-family": "sfr",
  multi: "multi",
  "multi-family": "multi",
  multifamily: "multi",
  land: "land",
  mobile: "mobile",
  "mobile home": "mobile",
  commercial: "commercial",
};

function assetTypeMatch(buyerTypes: string[], propertyType: string | null): boolean | null {
  if (!buyerTypes || buyerTypes.length === 0) return null;
  if (!propertyType) return null;
  const mapped = PROPERTY_TO_ASSET[propertyType.toLowerCase()] ?? propertyType.toLowerCase();
  return buyerTypes.includes(mapped);
}

// ── Main scorer ───────────────────────────────────────────────────────────

export function scoreBuyers(
  buyers: BuyerWithPhase1[],
  lead: LeadContext,
  alreadyActioned: Set<string>,  // buyer IDs already in deal_buyers for this deal (any status)
): ScorerResult[] {
  const results: ScorerResult[] = [];

  for (const buyer of buyers) {
    // ── Hard gates ──

    if (buyer.do_not_contact) {
      results.push({ buyer, eliminated: true, reason: "Do Not Contact" });
      continue;
    }

    if (buyer.status !== "active") {
      results.push({ buyer, eliminated: true, reason: "Inactive" });
      continue;
    }

    if (alreadyActioned.has(buyer.id)) {
      results.push({ buyer, eliminated: true, reason: "Already actioned on this deal" });
      continue;
    }

    // Price floor hard gate: if buyer has price_range_high and our estimated value
    // is above it by more than 20%, eliminate. (Being 20% over max is disqualifying.)
    if (
      buyer.price_range_high != null &&
      lead.estimatedValue != null &&
      lead.estimatedValue > buyer.price_range_high * 1.2
    ) {
      results.push({ buyer, eliminated: true, reason: "Over price ceiling" });
      continue;
    }

    // ARV gate: if buyer has arv_max and our estimated value exceeds it
    if (
      buyer.arv_max != null &&
      lead.estimatedValue != null &&
      lead.estimatedValue > buyer.arv_max
    ) {
      results.push({ buyer, eliminated: true, reason: "Over ARV max" });
      continue;
    }

    // ── Soft scoring ──

    const marketMatch = !!lead.market && buyer.markets.includes(lead.market);
    const priceInRange =
      buyer.price_range_low != null || buyer.price_range_high != null
        ? (() => {
            const v = lead.priceExpectation ?? lead.estimatedValue;
            if (v == null) return null;
            const aboveFloor = buyer.price_range_low == null || v >= buyer.price_range_low * 0.8;
            const belowCeil = buyer.price_range_high == null || v <= buyer.price_range_high * 1.1;
            return aboveFloor && belowCeil;
          })()
        : null;
    const arvOk =
      buyer.arv_max != null && lead.estimatedValue != null
        ? lead.estimatedValue <= buyer.arv_max
        : null;
    const atMatch = assetTypeMatch(buyer.asset_types, lead.propertyType);
    const rehab = rehabOk(buyer.rehab_tolerance, lead.conditionLevel);
    const occOk = occupancyOk(buyer.occupancy_pref, lead.isVacant);
    const pofVerified = buyer.proof_of_funds === "verified";
    const stale = isStale(buyer.last_contacted_at);

    const inputs: ScoreInputs = {
      market_match: marketMatch,
      price_in_range: priceInRange,
      arv_ok: arvOk,
      asset_type_match: atMatch,
      rehab_ok: rehab,
      occupancy_ok: occOk,
      pof_verified: pofVerified,
      reliability_score: buyer.reliability_score,
      deals_closed: buyer.deals_closed,
      stale,
    };

    // ── Score computation (0–100) ──

    let score = 0;

    // Market match is the strongest signal — 35 pts
    if (marketMatch) score += 35;

    // Price fit — 20 pts
    if (priceInRange === true) score += 20;
    else if (priceInRange === null) score += 10; // no price data = neutral, not a penalty

    // Asset type — 15 pts
    if (atMatch === true) score += 15;
    else if (atMatch === null) score += 8;  // no type data = neutral

    // Rehab tolerance — 10 pts
    if (rehab === true) score += 10;
    else if (rehab === null) score += 5;

    // Occupancy — 5 pts
    if (occOk) score += 5;

    // Reliability — up to 10 pts (manual score 1–5)
    if (buyer.reliability_score != null) {
      score += Math.round((buyer.reliability_score / 5) * 10);
    }

    // POF — 5 pts
    if (pofVerified) score += 5;

    // ── Flags for Logan ──

    const flags: string[] = [];
    if (!marketMatch) flags.push("Outside preferred markets");
    if (priceInRange === false) flags.push("Price range mismatch");
    if (atMatch === false) flags.push("Asset type mismatch");
    if (rehab === false) flags.push("Rehab tolerance mismatch");
    if (!occOk) flags.push("Occupancy preference mismatch");
    if (!pofVerified) {
      if (buyer.proof_of_funds === "submitted") flags.push("POF submitted, not verified");
      else flags.push("No POF on file");
    }
    if (buyer.tags.includes("ghosts")) flags.push("Known to ghost");
    if (buyer.tags.includes("retrades")) flags.push("Known to retrade");

    results.push({
      buyer,
      score,
      score_inputs: inputs,
      flags,
      stale,
      eliminated: false,
    });
  }

  // Sort: non-eliminated only, highest score first
  // (eliminated entries are filtered out by the caller before sending to Logan)
  results.sort((a, b) => {
    if (a.eliminated && !b.eliminated) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    if (!a.eliminated && !b.eliminated) return b.score - a.score;
    return 0;
  });

  return results;
}

// ── Convenience: return only the ranked radar entries ─────────────────────

export function rankedRadarEntries(results: ScorerResult[]): RadarEntry[] {
  return results.filter((r): r is RadarEntry => !r.eliminated);
}

// ── Monetizability score — gated at 10 active buyers ─────────────────────
// Returns null when buyer pool is too thin. Adam-only display.

export const MONETIZABILITY_GATE = 10;

export function computeMonetizabilityScore(
  results: ScorerResult[],
  activeBuyerCount: number
): number | null {
  if (activeBuyerCount < MONETIZABILITY_GATE) return null;

  const nonEliminated = results.filter((r): r is RadarEntry => !r.eliminated);
  const goodFit = nonEliminated.filter((r) => r.score >= 50).length;
  const strongFit = nonEliminated.filter((r) => r.score >= 70).length;
  const hasVerifiedPof = nonEliminated.some((r) => r.buyer.proof_of_funds === "verified");
  const hasFastCloser = nonEliminated.some(
    (r) => r.buyer.close_speed_days !== null && r.buyer.close_speed_days <= 14
  );

  let raw = Math.min(goodFit, 10);
  raw += Math.min(strongFit, 3);
  if (hasVerifiedPof) raw += 1;
  if (hasFastCloser) raw += 1;

  return Math.min(Math.round((raw / 15) * 10 * 10) / 10, 10);
}
