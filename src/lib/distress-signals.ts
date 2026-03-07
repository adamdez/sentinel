/**
 * Sentinel Distress Signal Detection v2.2
 *
 * Single canonical source for detecting distress signals from PropertyRadar data.
 * Replaces 6 inline copies that had inconsistent phantom injection and severity values.
 *
 * Rules:
 * - NO phantom signals — if a property has no distress, it gets zero signals.
 * - Absentee severity normalized to 5 everywhere.
 * - Uses real event dates where available (ForeclosureRecDate, DelinquentYear).
 * - Detects new signal types: underwater, tired_landlord.
 * - Flags MLS-listed properties for rejection (cannot wholesale listed properties).
 */

import type { DistressType } from "@/lib/types";
import { daysSince } from "@/lib/dedup";

// ── Types ────────────────────────────────────────────────────────────

export interface DetectedSignal {
  type: DistressType;
  severity: number;
  daysSinceEvent: number;
  detectedFrom: string;
  /** Legal stage (e.g. "notice_of_default", "auction_scheduled", "tax_sale_risk") */
  stage?: string;
  /** ISO date when this stage was recorded */
  stageDate?: string;
  /** Human-readable next action (e.g. "Auction scheduled", "Tax sale pending") */
  nextAction?: string;
  /** ISO date of next escalation event */
  nextActionDate?: string;
  /** Dollar amount (default amount, delinquent amount, etc.) */
  amount?: number;
}

export interface SignalDetectionResult {
  signals: DetectedSignal[];
  /** True if isListedForSale — property should be REJECTED, not imported */
  isMLSListed: boolean;
  /** True if owner mailing state differs from property state */
  isOutOfState: boolean;
  /** Estimated owner age from PR data, if available */
  ownerAge: number | null;
  /** Years of ownership computed from LastTransferRecDate/SaleDate */
  ownershipYears: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function isTruthy(val: unknown): boolean {
  return val === true || val === 1 || val === "1" || val === "Yes" || val === "True" || val === "true";
}

function toNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === "") return undefined;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/[$,%]/g, ""));
  return isNaN(n) ? undefined : n;
}

function computeOwnershipYears(pr: Record<string, unknown>): number | null {
  const dateStr = (pr.LastTransferRecDate ?? pr.SaleDate) as string | undefined;
  if (!dateStr) return null;
  const days = daysSince(dateStr, -1);
  if (days < 0) return null; // parse failure
  return days / 365;
}

function parseOwnerAge(pr: Record<string, unknown>): number | null {
  const raw = pr.OwnerAge ?? pr.EstOwnerAge;
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return isNaN(n) ? null : n;
}

// ── Main Detection Function ──────────────────────────────────────────

/**
 * Detect distress signals from PropertyRadar response data.
 *
 * This is the ONLY place distress signals should be detected from PR data.
 * All API routes and enrichment paths import from here.
 *
 * @param pr - PropertyRadar property record (any shape, uses known field names)
 * @returns SignalDetectionResult with signals, MLS flag, and metadata
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function detectDistressSignals(pr: any): SignalDetectionResult {
  const signals: DetectedSignal[] = [];

  // ── Core distress signals ─────────────────────────────────────────

  // Probate / Deceased
  // NOTE: DeceasedDate is NOT a valid PropertyRadar field — PR only provides boolean
  if (isTruthy(pr.isDeceasedProperty)) {
    signals.push({
      type: "probate",
      severity: 9,
      daysSinceEvent: 730, // PR doesn't provide DeceasedDate — default to ~2 years
      detectedFrom: "pr_probate_active",
      stage: "estate_in_probate",
      nextAction: "Deceased owner — estate likely in probate",
    });
  }

  // Pre-foreclosure / Foreclosure — with full stage tracking
  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure)) {
    const defaultAmt = toNumber(pr.DefaultAmount) ?? 0;
    const foreclosureStage = pr.ForeclosureStage as string | undefined;
    const isAuction = isTruthy(pr.isAuction);

    // Map PR ForeclosureStage to escalation stages
    let stage = "pre_foreclosure";
    let nextAction = "Foreclosure proceedings active";
    let severity = defaultAmt > 50_000 ? 9 : defaultAmt > 20_000 ? 8 : 7;

    if (isAuction || foreclosureStage?.toLowerCase().includes("auction")) {
      stage = "auction_scheduled";
      nextAction = "Property going to auction";
      severity = 10; // Maximum urgency — auction imminent
    } else if (foreclosureStage?.toLowerCase().includes("notice of sale") ||
               foreclosureStage?.toLowerCase().includes("nos")) {
      stage = "notice_of_sale";
      nextAction = "Notice of Sale filed — auction upcoming";
      severity = 9;
    } else if (foreclosureStage?.toLowerCase().includes("notice of default") ||
               foreclosureStage?.toLowerCase().includes("nod")) {
      stage = "notice_of_default";
      nextAction = "Notice of Default filed — 90-day cure period";
      severity = Math.max(severity, 7);
    } else if (isTruthy(pr.isBankOwned)) {
      stage = "bank_owned";
      nextAction = "Bank-owned (REO) — may accept discount offers";
      severity = 6; // Lower urgency, bank already owns it
    }

    signals.push({
      type: "pre_foreclosure",
      severity,
      daysSinceEvent: pr.ForeclosureRecDate ? daysSince(pr.ForeclosureRecDate) : 365,
      detectedFrom: `pr_foreclosure_${stage}`,
      stage,
      stageDate: pr.ForeclosureRecDate ?? pr.DefaultAsOf ?? undefined,
      nextAction,
      amount: defaultAmt || undefined,
    });
  }

  // Tax delinquency — with installment escalation tracking
  if (isTruthy(pr.inTaxDelinquency)) {
    const delAmt = toNumber(pr.DelinquentAmount) ?? 0;
    const installments = toNumber(pr.NumberDelinquentInstallments) ?? 0;
    const delinquentYear = toNumber(pr.DelinquentYear);
    const yearsSinceDelinquent = delinquentYear ? (new Date().getFullYear() - delinquentYear) : 0;

    let stage = "delinquent";
    let nextAction = "Tax delinquent";
    let severity = delAmt > 10_000 ? 8 : delAmt > 3_000 ? 7 : 6;

    if (installments >= 4 || yearsSinceDelinquent >= 3) {
      stage = "tax_sale_risk";
      nextAction = installments > 0
        ? `${installments} delinquent installments — tax sale risk`
        : `${yearsSinceDelinquent}+ years delinquent — tax sale risk`;
      severity = Math.max(severity, 9);
    } else if (installments >= 2) {
      stage = "escalating";
      nextAction = `${installments} delinquent installments — escalating`;
      severity = Math.max(severity, 7);
    }

    signals.push({
      type: "tax_lien",
      severity,
      daysSinceEvent: delinquentYear
        ? Math.max(365 * yearsSinceDelinquent, 30)
        : 365,
      detectedFrom: `pr_tax_${stage}`,
      stage,
      stageDate: delinquentYear ? `${delinquentYear}-01-01` : undefined,
      nextAction,
      amount: delAmt || undefined,
    });
  }

  // Bankruptcy
  // NOTE: BankruptcyRecDate is NOT a valid PropertyRadar field — PR only provides boolean
  if (isTruthy(pr.inBankruptcyProperty)) {
    signals.push({
      type: "bankruptcy",
      severity: 8,
      daysSinceEvent: 365, // PR doesn't provide BankruptcyRecDate
      detectedFrom: "pr_bankruptcy_active",
      stage: "active_filing",
      nextAction: "Active bankruptcy — automatic stay may apply",
    });
  }

  // Divorce
  // NOTE: DivorceRecDate is NOT a valid PropertyRadar field — PR only provides boolean
  if (isTruthy(pr.inDivorce)) {
    signals.push({
      type: "divorce",
      severity: 7,
      daysSinceEvent: 365, // PR doesn't provide DivorceRecDate
      detectedFrom: "pr_divorce_active",
      stage: "active_proceedings",
      nextAction: "Divorce proceedings — property may need to be sold for settlement",
    });
  }

  // Vacant
  if (isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant)) {
    signals.push({
      type: "vacant",
      severity: 5,
      daysSinceEvent: 60,
      detectedFrom: isTruthy(pr.isSiteVacant) ? "isSiteVacant" : "isMailVacant",
    });
  }

  // Absentee — normalized severity 5 (was 4 in enrichment, 6 in bulk-seed)
  if (isTruthy(pr.isNotSameMailingOrExempt)) {
    signals.push({
      type: "absentee",
      severity: 5,
      daysSinceEvent: 90,
      detectedFrom: "isNotSameMailingOrExempt",
    });
  }

  // Open liens (only if no tax_lien already detected)
  if (
    (isTruthy(pr.PropertyHasOpenLiens) || isTruthy(pr.PropertyHasOpenPersonLiens)) &&
    !signals.some((s) => s.type === "tax_lien")
  ) {
    signals.push({
      type: "tax_lien",
      severity: 5,
      daysSinceEvent: 90,
      detectedFrom: "PropertyHasOpenLiens",
      stage: "lien_active",
      nextAction: "Open lien(s) on property — may escalate to foreclosure",
    });
  }

  // ── New signal types (v2.2) ────────────────────────────────────────

  // Underwater mortgage — negative equity, owes more than property is worth
  if (isTruthy(pr.isUnderwater)) {
    signals.push({
      type: "underwater",
      severity: 8,
      daysSinceEvent: 30, // current state, treat as recent
      detectedFrom: "isUnderwater",
    });
  }

  // Tired landlord — composite: absentee + multi-unit + long ownership + optional code violations
  const ownershipYears = computeOwnershipYears(pr);
  const units = toNumber(pr.Units) ?? toNumber(pr.AdvancedPropertyType === "Duplex" ? 2 : pr.AdvancedPropertyType === "Triplex" ? 3 : pr.AdvancedPropertyType === "Fourplex" ? 4 : undefined) ?? 1;
  const isAbsentee = isTruthy(pr.isNotSameMailingOrExempt);
  const isMultiUnit = units >= 2;

  if (isAbsentee && isMultiUnit && ownershipYears !== null && ownershipYears > 10) {
    // Severity scales with ownership duration: 10-15yr=5, 15-20yr=6, 20-25yr=7, 25+=8
    const tireSeverity = Math.min(Math.floor(ownershipYears / 5), 8);
    signals.push({
      type: "tired_landlord",
      severity: Math.max(tireSeverity, 5),
      daysSinceEvent: 30, // ongoing situation
      detectedFrom: `absentee+units(${units})+ownership(${Math.round(ownershipYears)}yr)`,
    });
  }

  // ── Metadata extraction ────────────────────────────────────────────

  // MLS listing check — properties with active listings CANNOT be wholesaled
  const isMLSListed = isTruthy(pr.isListedForSale);

  // Out-of-state check — mailing state differs from property state
  const mailState = (pr.MailState ?? "").toString().toUpperCase().trim();
  const propState = (pr.State ?? "").toString().toUpperCase().trim();
  const isOutOfState = !!(mailState && propState && mailState !== propState);

  const ownerAge = parseOwnerAge(pr);

  // NO phantom signals — if nothing detected, return empty array.
  // Clean properties should score near zero, not get fake signals.

  return {
    signals,
    isMLSListed,
    isOutOfState,
    ownerAge,
    ownershipYears: ownershipYears !== null ? Math.round(ownershipYears * 10) / 10 : null,
  };
}
