/**
 * Enrichment Data Sufficiency Gate
 *
 * Pure function — no database calls, no imports with side effects.
 * Determines if a property has enough enriched data to promote from staging → prospect.
 *
 * BUSINESS RULES (from Adam, March 7 2026):
 * 1. Required for promotion: owner name + property address + verified distress signal(s)
 * 2. Phone/email are NOT required — agents use Deep Skip button after promotion
 * 3. Mailing address is NOT a hard gate requirement — enrichment should fill it when
 *    available, but missing it should not block promotion. Many data sources don't
 *    return mailing address, and blocking on it creates the same bottleneck.
 *    If mailing address is missing, the system should USE the property address as
 *    the mailing address (many owners are owner-occupied) until enrichment fills it.
 * 4. Estimated value is nice-to-have but NOT a blocker for promotion
 * 5. Distress signals must be verified through actual data sources (PR, county, court, ATTOM)
 * 6. The entire point of staging is to ENRICH until we have enough data to act
 *
 * PHILOSOPHY: The gate should answer "can an agent DO something with this lead?"
 * If yes → promote. If the agent can't even identify who owns the property or
 * where it is → stay in staging for more enrichment.
 *
 * What an agent CAN'T work without: owner name, property address, some distress reason
 * What an agent CAN work without: phone (deep skip), email, mailing address, exact value
 */

export interface SufficiencyInput {
  ownerName: string | null | undefined;
  address: string | null | undefined;
  mailingAddress: string | null | undefined;
  estimatedValue: number | null | undefined;
  signalCount: number;
  /** True if at least one signal came from a verified data source (PR flag, county record, court filing, ATTOM) */
  hasVerifiedSignal: boolean;
}

export interface SufficiencyResult {
  isSufficient: boolean;
  missingFields: string[];
  /** Fields that are present but could be better — for follow-up enrichment */
  warnings: string[];
}

/**
 * Pure function: determines if a property has enough enriched data to promote
 * from staging → prospect.
 *
 * REQUIRED (hard gate): owner name + valid address + verified distress signal(s)
 * NOT REQUIRED (soft — warns but doesn't block): phone, email, mailing address, value
 */
export function checkDataSufficiency(input: SufficiencyInput): SufficiencyResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // ── HARD REQUIREMENTS (block promotion if missing) ──

  // Owner name — must be a real name, not placeholder
  const owner = (input.ownerName ?? "").trim();
  const hasOwner = owner !== "" && owner !== "Unknown" && owner !== "Unknown Owner" && owner !== "N/A";
  if (!hasOwner) missing.push("owner_name");

  // Property address — must start with a street number (not "Unknown", not blank)
  const addr = (input.address ?? "").trim();
  const hasAddress = addr !== "" && addr !== "Unknown" && /^\d/.test(addr);
  if (!hasAddress) missing.push("property_address");

  // Verified distress signal — at least one signal confirmed by a real data source
  // (PR flags, county tax records, court filings, ATTOM foreclosure data, etc.)
  const hasSignal = input.signalCount > 0 && input.hasVerifiedSignal;
  if (!hasSignal) missing.push("verified_distress_signal");

  // ── SOFT REQUIREMENTS (warn but do NOT block promotion) ──

  // Mailing address — agents want this but missing it shouldn't block promotion.
  // If missing, UI should default to property address as mailing address.
  const mail = (input.mailingAddress ?? "").trim();
  if (!mail) warnings.push("mailing_address");

  // Estimated value — helps with offer calc but agents can research it
  if (!input.estimatedValue || input.estimatedValue <= 0) warnings.push("estimated_value");

  // ── DECISION ──

  const isSufficient = hasOwner && hasAddress && hasSignal;

  return { isSufficient, missingFields: missing, warnings };
}
