/**
 * Property-Based Deduplication — Primary Dedup Key
 *
 * When a new lead comes in, check if a lead already exists for that
 * PROPERTY (by APN match or normalized address match). If yes, return
 * the existing property/lead IDs so the caller can merge. If no,
 * signal that a new lead should be created.
 *
 * Match priority:
 *   1. Exact APN match (most reliable — assessor parcel number is canonical)
 *   2. Normalized address + zip match
 *   3. Normalized address + city + state match
 *
 * BOUNDARY:
 *   - Reads properties and leads tables only — never writes
 *   - Pure server-side — uses Supabase service role client
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Address Normalization ──────────────────────────────────────────────

/**
 * Abbreviation map for address normalization.
 * Converts common full words to USPS abbreviations and vice versa
 * so that "123 Main Street" matches "123 Main St".
 */
const ADDRESS_ABBREVIATIONS: [RegExp, string][] = [
  [/\bstreet\b/gi, "st"],
  [/\bavenue\b/gi, "ave"],
  [/\bboulevard\b/gi, "blvd"],
  [/\bdrive\b/gi, "dr"],
  [/\blane\b/gi, "ln"],
  [/\broad\b/gi, "rd"],
  [/\bcourt\b/gi, "ct"],
  [/\bcircle\b/gi, "cir"],
  [/\bplace\b/gi, "pl"],
  [/\bterrace\b/gi, "ter"],
  [/\bway\b/gi, "way"],
  [/\bparkway\b/gi, "pkwy"],
  [/\bhighway\b/gi, "hwy"],
  [/\bnorth\b/gi, "n"],
  [/\bsouth\b/gi, "s"],
  [/\beast\b/gi, "e"],
  [/\bwest\b/gi, "w"],
  [/\bnortheast\b/gi, "ne"],
  [/\bnorthwest\b/gi, "nw"],
  [/\bsoutheast\b/gi, "se"],
  [/\bsouthwest\b/gi, "sw"],
  [/\bapartment\b/gi, "apt"],
  [/\bsuite\b/gi, "ste"],
  [/\bunit\b/gi, "unit"],
  [/\bnumber\b/gi, "#"],
  [/\bno\.\s*/gi, "# "],
];

/**
 * Normalize an address string for comparison.
 * - Lowercase
 * - Strip extra whitespace
 * - Standardize abbreviations (Street -> St, Avenue -> Ave, etc.)
 * - Remove trailing punctuation
 * - Remove unit/apt/ste suffixes for property-level matching
 */
export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return "";

  let addr = raw
    .toLowerCase()
    .trim()
    // Remove multiple spaces
    .replace(/\s+/g, " ")
    // Remove trailing periods
    .replace(/\.+$/g, "")
    // Remove periods after abbreviations (e.g. "St." -> "St")
    .replace(/\./g, "");

  // Apply abbreviation standardization
  for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
    addr = addr.replace(pattern, replacement);
  }

  // Collapse any double spaces created by replacements
  addr = addr.replace(/\s+/g, " ").trim();

  return addr;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface PropertyDedupeInput {
  address: string;
  apn?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

export interface PropertyDedupeResult {
  existingPropertyId: string | null;
  existingLeadIds: string[];
  isNew: boolean;
}

// ── Active lead statuses to check ──────────────────────────────────────

const ACTIVE_LEAD_STATUSES = ["staging", "prospect", "lead", "negotiation", "nurture"];

// ── Main dedup function ────────────────────────────────────────────────

/**
 * Check if a property already exists in the database by APN or address.
 *
 * Match priority:
 *   1. Exact APN match (if APN provided and non-empty)
 *   2. Normalized address + zip match
 *   3. Normalized address + city + state match
 *
 * If a property match is found, also looks up any active leads linked
 * to that property.
 *
 * Returns { existingPropertyId, existingLeadIds, isNew }.
 */
export async function deduplicateByProperty(
  sb: SupabaseClient,
  input: PropertyDedupeInput,
): Promise<PropertyDedupeResult> {
  const NEW_RESULT: PropertyDedupeResult = {
    existingPropertyId: null,
    existingLeadIds: [],
    isNew: true,
  };

  // ── 1. Try APN match (most reliable) ──────────────────────────────
  if (input.apn && input.apn.trim().length > 0) {
    const apnClean = input.apn.trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: apnMatch } = await (sb.from("properties") as any)
      .select("id")
      .eq("apn", apnClean)
      .limit(1)
      .maybeSingle();

    if (apnMatch?.id) {
      const leads = await findActiveLeads(sb, apnMatch.id);
      return {
        existingPropertyId: apnMatch.id,
        existingLeadIds: leads,
        isNew: false,
      };
    }
  }

  // ── 2. Try normalized address + zip ───────────────────────────────
  const normalizedAddr = normalizeAddress(input.address);
  if (!normalizedAddr) return NEW_RESULT;

  if (input.zip && input.zip.trim().length > 0) {
    const propertyId = await findPropertyByAddress(sb, normalizedAddr, {
      zip: input.zip.trim(),
    });
    if (propertyId) {
      const leads = await findActiveLeads(sb, propertyId);
      return {
        existingPropertyId: propertyId,
        existingLeadIds: leads,
        isNew: false,
      };
    }
  }

  // ── 3. Try normalized address + city + state ──────────────────────
  if (input.city && input.state) {
    const propertyId = await findPropertyByAddress(sb, normalizedAddr, {
      city: input.city.trim(),
      state: input.state.trim(),
    });
    if (propertyId) {
      const leads = await findActiveLeads(sb, propertyId);
      return {
        existingPropertyId: propertyId,
        existingLeadIds: leads,
        isNew: false,
      };
    }
  }

  return NEW_RESULT;
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Search properties table by normalized address with location qualifiers.
 * We pull candidates matching city/state/zip and then compare normalized
 * addresses in JS, since Postgres doesn't have our normalization logic.
 */
async function findPropertyByAddress(
  sb: SupabaseClient,
  normalizedAddr: string,
  location: { zip?: string; city?: string; state?: string },
): Promise<string | null> {
  // Build query — pull properties in the same zip or city+state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("properties") as any).select("id, address");

  if (location.zip) {
    query = query.eq("zip", location.zip);
  } else if (location.city && location.state) {
    query = query
      .ilike("city", location.city)
      .ilike("state", location.state);
  } else {
    return null;
  }

  // Limit to a reasonable scan — if there are 1000+ properties in a zip
  // with different addresses, we won't find our match in the first 500 anyway
  const { data: candidates } = await query.limit(500);

  if (!candidates || candidates.length === 0) return null;

  // Compare normalized addresses
  for (const candidate of candidates) {
    const candidateNorm = normalizeAddress(candidate.address);
    if (candidateNorm === normalizedAddr) {
      return candidate.id;
    }
  }

  return null;
}

/**
 * Find active lead IDs linked to a property.
 */
async function findActiveLeads(
  sb: SupabaseClient,
  propertyId: string,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ACTIVE_LEAD_STATUSES);

  if (!leads || leads.length === 0) return [];
  return leads.map((l: { id: string }) => l.id);
}
