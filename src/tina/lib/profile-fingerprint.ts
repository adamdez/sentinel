import type { TinaBusinessTaxProfile } from "@/tina/types";

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable profile fingerprint used to invalidate stale review runs when organizer inputs change.
 * This is not a security hash; it is a deterministic change token for Tina freshness checks.
 */
export function buildTinaProfileFingerprint(profile: TinaBusinessTaxProfile): string {
  const parts = [
    normalizeText(profile.businessName),
    normalizeText(profile.taxYear),
    profile.entityType,
    normalizeText(profile.formationState),
    normalizeText(profile.formationDate),
    profile.accountingMethod,
    normalizeText(profile.naicsCode),
    profile.hasPayroll ? "1" : "0",
    profile.paysContractors ? "1" : "0",
    profile.hasInventory ? "1" : "0",
    profile.hasFixedAssets ? "1" : "0",
    profile.collectsSalesTax ? "1" : "0",
    profile.hasIdahoActivity ? "1" : "0",
    normalizeText(profile.notes),
  ];

  return parts.join("|");
}

