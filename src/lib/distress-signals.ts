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
  if (isTruthy(pr.isDeceasedProperty)) {
    signals.push({
      type: "probate",
      severity: 9,
      daysSinceEvent: pr.DeceasedDate ? daysSince(pr.DeceasedDate) : 730,
      detectedFrom: "isDeceasedProperty",
    });
  }

  // Pre-foreclosure / Foreclosure
  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure)) {
    const defaultAmt = toNumber(pr.DefaultAmount) ?? 0;
    signals.push({
      type: "pre_foreclosure",
      severity: defaultAmt > 50000 ? 9 : 7,
      daysSinceEvent: pr.ForeclosureRecDate ? daysSince(pr.ForeclosureRecDate) : 365,
      detectedFrom: isTruthy(pr.isPreforeclosure) ? "isPreforeclosure" : "inForeclosure",
    });
  }

  // Tax delinquency
  if (isTruthy(pr.inTaxDelinquency)) {
    const delAmt = toNumber(pr.DelinquentAmount) ?? 0;
    signals.push({
      type: "tax_lien",
      severity: delAmt > 10000 ? 8 : 6,
      daysSinceEvent: pr.DelinquentYear
        ? Math.max(365 * (new Date().getFullYear() - Number(pr.DelinquentYear)), 30)
        : 365,
      detectedFrom: "inTaxDelinquency",
    });
  }

  // Bankruptcy
  if (isTruthy(pr.inBankruptcyProperty)) {
    signals.push({
      type: "bankruptcy",
      severity: 8,
      daysSinceEvent: pr.BankruptcyRecDate ? daysSince(pr.BankruptcyRecDate) : 365,
      detectedFrom: "inBankruptcyProperty",
    });
  }

  // Divorce
  if (isTruthy(pr.inDivorce)) {
    signals.push({
      type: "divorce",
      severity: 7,
      daysSinceEvent: pr.DivorceRecDate ? daysSince(pr.DivorceRecDate) : 365,
      detectedFrom: "inDivorce",
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
