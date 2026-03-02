/**
 * Sentinel Enrichment Engine v1.0
 *
 * Automatic property enrichment pipeline for staging leads.
 * Called by the enrichment batch cron and the agent cycle.
 *
 * Pipeline per property:
 *   1. PropertyRadar lookup (address → full property data + distress signals)
 *   2. ATTOM valuation fallback (if PR returns no AVM)
 *   3. Skip-trace for phone/email (PR Persons endpoint)
 *   4. Full scoring (deterministic v2.1 + predictive v2.1 + blend)
 *   5. Promote lead from "staging" → "prospect"
 *
 * Safety net: After MAX_ATTEMPTS failures, promotes anyway with partial data.
 *
 * Domain: Enrichment Pipeline — reads properties, writes enriched data,
 * promotes leads. Respects all golden key and dedup invariants.
 */

import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, getScoreLabel, type ScoringInput } from "@/lib/scoring";
import {
  computePredictiveScore,
  buildPredictionRecord,
  blendHeatScore,
  buildPredictiveInput,
  type PredictiveInput,
} from "@/lib/scoring-predictive";
import { distressFingerprint, isDuplicateError, normalizeCounty } from "@/lib/dedup";
import type { DistressType } from "@/lib/types";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API_BASE = "https://api.propertyradar.com/v1/properties";
const MAX_ATTEMPTS = 3;

// ── Result Types ─────────────────────────────────────────────────────

export interface EnrichmentResult {
  propertyId: string;
  leadId: string;
  success: boolean;
  enrichmentSource: "propertyradar" | "attom" | "partial" | "failed";
  score: number | null;
  label: string | null;
  signalsDetected: number;
  error?: string;
  elapsed_ms: number;
}

export interface BatchResult {
  processed: number;
  enriched: number;
  partial: number;
  failed: number;
  remaining: number;
  results: EnrichmentResult[];
  elapsed_ms: number;
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

function toInt(val: unknown): number | undefined {
  const n = toNumber(val);
  return n != null ? Math.round(n) : undefined;
}

// ── Address Parser ───────────────────────────────────────────────────

interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
}

const US_STATES: Record<string, string> = {
  AL: "AL", AK: "AK", AZ: "AZ", AR: "AR", CA: "CA", CO: "CO", CT: "CT",
  DE: "DE", DC: "DC", FL: "FL", GA: "GA", HI: "HI", ID: "ID", IL: "IL",
  IN: "IN", IA: "IA", KS: "KS", KY: "KY", LA: "LA", ME: "ME", MD: "MD",
  MA: "MA", MI: "MI", MN: "MN", MS: "MS", MO: "MO", MT: "MT", NE: "NE",
  NV: "NV", NH: "NH", NJ: "NJ", NM: "NM", NY: "NY", NC: "NC", ND: "ND",
  OH: "OH", OK: "OK", OR: "OR", PA: "PA", RI: "RI", SC: "SC", SD: "SD",
  TN: "TN", TX: "TX", UT: "UT", VT: "VT", VA: "VA", WA: "WA", WV: "WV",
  WI: "WI", WY: "WY",
};

function parseAddress(raw: string): ParsedAddress {
  const result: ParsedAddress = { street: "", city: "", state: "", zip: "" };
  const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  if (zipMatch) {
    result.zip = zipMatch[1];
    raw = raw.slice(0, zipMatch.index).trim();
  }
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    result.street = parts[0];
    const rest = parts.slice(1).join(" ").trim();
    const stateMatch = rest.match(/\b([A-Z]{2})\s*$/i);
    if (stateMatch && US_STATES[stateMatch[1].toUpperCase()]) {
      result.state = US_STATES[stateMatch[1].toUpperCase()];
      result.city = rest.slice(0, stateMatch.index).trim();
    } else {
      result.city = rest;
    }
  } else {
    result.street = raw;
  }
  return result;
}

// ── Distress Signal Detection ────────────────────────────────────────

interface DetectedSignal {
  type: DistressType;
  severity: number;
  daysSinceEvent: number;
  detectedFrom: string;
}

function daysBetween(dateStr: string): number {
  try {
    const d = new Date(dateStr).getTime();
    if (isNaN(d)) return 90;
    return Math.max(Math.round((Date.now() - d) / 86400000), 1);
  } catch {
    return 90;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectDistressSignals(pr: any): DetectedSignal[] {
  const signals: DetectedSignal[] = [];

  if (isTruthy(pr.isDeceasedProperty)) {
    signals.push({ type: "probate", severity: 9, daysSinceEvent: 30, detectedFrom: "isDeceasedProperty" });
  }
  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure)) {
    const defaultAmt = toNumber(pr.DefaultAmount) ?? 0;
    signals.push({
      type: "pre_foreclosure",
      severity: defaultAmt > 50000 ? 9 : 7,
      daysSinceEvent: pr.ForeclosureRecDate ? daysBetween(pr.ForeclosureRecDate) : 30,
      detectedFrom: isTruthy(pr.isPreforeclosure) ? "isPreforeclosure" : "inForeclosure",
    });
  }
  if (isTruthy(pr.inTaxDelinquency)) {
    const delAmt = toNumber(pr.DelinquentAmount) ?? 0;
    signals.push({
      type: "tax_lien",
      severity: delAmt > 10000 ? 8 : 6,
      daysSinceEvent: pr.DelinquentYear ? Math.max(365 * (new Date().getFullYear() - Number(pr.DelinquentYear)), 30) : 90,
      detectedFrom: "inTaxDelinquency",
    });
  }
  if (isTruthy(pr.inBankruptcyProperty)) {
    signals.push({ type: "bankruptcy", severity: 8, daysSinceEvent: 60, detectedFrom: "inBankruptcyProperty" });
  }
  if (isTruthy(pr.inDivorce)) {
    signals.push({ type: "divorce", severity: 7, daysSinceEvent: 60, detectedFrom: "inDivorce" });
  }
  if (isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant)) {
    signals.push({
      type: "vacant", severity: 5, daysSinceEvent: 60,
      detectedFrom: isTruthy(pr.isSiteVacant) ? "isSiteVacant" : "isMailVacant",
    });
  }
  if (isTruthy(pr.isNotSameMailingOrExempt)) {
    signals.push({ type: "absentee", severity: 4, daysSinceEvent: 90, detectedFrom: "isNotSameMailingOrExempt" });
  }
  if ((isTruthy(pr.PropertyHasOpenLiens) || isTruthy(pr.PropertyHasOpenPersonLiens)) && !signals.some((s) => s.type === "tax_lien")) {
    signals.push({ type: "tax_lien", severity: 5, daysSinceEvent: 90, detectedFrom: "PropertyHasOpenLiens" });
  }

  // No default "vacant" signal — if no distress, property might just be clean.
  return signals;
}

// ── Single Property Enrichment ───────────────────────────────────────

/**
 * Enrich a single property + lead using PropertyRadar → scoring → promote.
 * Returns the result of the enrichment attempt.
 */
export async function enrichProperty(
  propertyId: string,
  leadId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lead: Record<string, any>,
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const sb = createServerClient();
  const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
  const attempts = ((ownerFlags.enrichment_attempts as number) ?? 0) + 1;

  console.log(`[Enrich] Starting enrichment for property ${propertyId} (attempt ${attempts})`);

  try {
    // ── Step 1: PropertyRadar Lookup ──────────────────────────────
    const prResult = await enrichFromPropertyRadar(sb, propertyId, property);

    if (prResult.success && prResult.pr) {
      // ── Step 2: Skip-trace for phone/email ─────────────────────
      await enrichContactInfo(sb, propertyId, prResult.pr);

      // ── Step 3: Detect distress signals ────────────────────────
      const signals = detectDistressSignals(prResult.pr);

      // Insert distress events (dedup by fingerprint)
      const apn = prResult.pr.APN ?? property.apn ?? propertyId;
      const county = normalizeCounty(prResult.pr.County ?? property.county ?? "", "Unknown");

      for (const signal of signals) {
        const fp = distressFingerprint(apn, county, signal.type, "propertyradar");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: evtErr } = await (sb.from("distress_events") as any).insert({
          property_id: propertyId,
          event_type: signal.type,
          source: "propertyradar",
          severity: signal.severity,
          fingerprint: fp,
          raw_data: { detected_from: signal.detectedFrom, radar_id: prResult.pr.RadarID },
          confidence: signal.severity >= 7 ? "0.900" : signal.severity >= 4 ? "0.750" : "0.600",
        });
        if (evtErr && !isDuplicateError(evtErr)) {
          console.error(`[Enrich] Event insert error (${signal.type}):`, evtErr.message);
        }
      }

      // ── Step 4: Full scoring pipeline ──────────────────────────
      const score = await runScoringPipeline(sb, propertyId, property, prResult.pr, signals);

      // ── Step 5: Promote lead staging → prospect ────────────────
      await promoteToProspect(sb, leadId, propertyId, score.blended, signals, "propertyradar", attempts);

      return {
        propertyId, leadId, success: true,
        enrichmentSource: "propertyradar",
        score: score.blended,
        label: getScoreLabel(score.blended),
        signalsDetected: signals.length,
        elapsed_ms: Date.now() - startTime,
      };
    }

    // ── PropertyRadar failed — try ATTOM fallback ────────────────
    console.log(`[Enrich] PropertyRadar lookup failed for ${propertyId}: ${prResult.error}`);

    const attomResult = await enrichFromAttom(sb, propertyId, property);

    if (attomResult.success) {
      const signals = attomResult.signals ?? [];
      const score = await runScoringPipelineFromFlags(sb, propertyId, property, signals);

      await promoteToProspect(sb, leadId, propertyId, score.blended, signals, "attom", attempts);

      return {
        propertyId, leadId, success: true,
        enrichmentSource: "attom",
        score: score.blended,
        label: getScoreLabel(score.blended),
        signalsDetected: signals.length,
        elapsed_ms: Date.now() - startTime,
      };
    }

    // ── Both failed ─────────────────────────────────────────────
    console.log(`[Enrich] ATTOM fallback also failed for ${propertyId}: ${attomResult.error}`);

    // Track attempt in owner_flags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update({
      owner_flags: {
        ...ownerFlags,
        enrichment_pending: true,
        enrichment_attempts: attempts,
        enrichment_last_attempt: new Date().toISOString(),
        enrichment_status: "failed",
      },
      updated_at: new Date().toISOString(),
    }).eq("id", propertyId);

    // Safety net: after MAX_ATTEMPTS, promote anyway with partial data
    if (attempts >= MAX_ATTEMPTS) {
      console.log(`[Enrich] Max attempts (${MAX_ATTEMPTS}) reached for ${propertyId} — promoting with partial data`);
      await promoteToProspect(sb, leadId, propertyId, lead.priority ?? 30, [], "partial", attempts);

      return {
        propertyId, leadId, success: false,
        enrichmentSource: "partial",
        score: lead.priority ?? 30,
        label: getScoreLabel(lead.priority ?? 30),
        signalsDetected: 0,
        error: `Failed after ${MAX_ATTEMPTS} attempts — promoted with partial data`,
        elapsed_ms: Date.now() - startTime,
      };
    }

    return {
      propertyId, leadId, success: false,
      enrichmentSource: "failed",
      score: null, label: null, signalsDetected: 0,
      error: `Attempt ${attempts}/${MAX_ATTEMPTS}: ${prResult.error ?? "Unknown error"}`,
      elapsed_ms: Date.now() - startTime,
    };

  } catch (err) {
    console.error(`[Enrich] Unhandled error for ${propertyId}:`, err);

    // Track failure attempt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update({
      owner_flags: {
        ...ownerFlags,
        enrichment_pending: true,
        enrichment_attempts: attempts,
        enrichment_last_attempt: new Date().toISOString(),
        enrichment_status: "error",
        enrichment_error: err instanceof Error ? err.message : String(err),
      },
      updated_at: new Date().toISOString(),
    }).eq("id", propertyId);

    // Safety net
    if (attempts >= MAX_ATTEMPTS) {
      await promoteToProspect(sb, leadId, propertyId, lead.priority ?? 30, [], "partial", attempts);
    }

    return {
      propertyId, leadId, success: false,
      enrichmentSource: "failed",
      score: null, label: null, signalsDetected: 0,
      error: err instanceof Error ? err.message : String(err),
      elapsed_ms: Date.now() - startTime,
    };
  }
}

// ── PropertyRadar Enrichment ─────────────────────────────────────────

interface PREnrichResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pr?: any;
  error?: string;
}

async function enrichFromPropertyRadar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
): Promise<PREnrichResult> {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) return { success: false, error: "PROPERTYRADAR_API_KEY not configured" };

  const address = property.address ?? "";
  const city = property.city ?? "";
  const state = property.state ?? "";
  const zip = property.zip ?? "";

  if (!address || address === "Unknown" || address.startsWith("APN ")) {
    // If no address, try APN lookup
    if (property.apn && !property.apn.startsWith("MANUAL-") && !property.apn.startsWith("CSV-")) {
      return enrichByAPN(apiKey, sb, propertyId, property.apn, property.county);
    }
    return { success: false, error: "No valid address or APN for lookup" };
  }

  // Build criteria from address
  const criteria: { name: string; value: (string | number)[] }[] = [];
  const parsed = parseAddress(address);

  criteria.push({ name: "Address", value: [parsed.street || address.split(",")[0]] });
  if (parsed.city || city) criteria.push({ name: "City", value: [parsed.city || city] });
  if (parsed.state || state) criteria.push({ name: "State", value: [parsed.state || state] });
  if (parsed.zip || zip) criteria.push({ name: "ZipFive", value: [parsed.zip || zip] });

  if (criteria.length < 2) {
    return { success: false, error: "Insufficient address components for PropertyRadar search" };
  }

  try {
    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`;
    const prResponse = await fetch(prUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Criteria: criteria }),
    });

    if (!prResponse.ok) {
      return { success: false, error: `PropertyRadar HTTP ${prResponse.status}` };
    }

    const prData = await prResponse.json();
    const pr = prData.results?.[0];

    if (!pr) {
      return { success: false, error: "No property found in PropertyRadar" };
    }

    // Update property with enriched data
    await updatePropertyFromPR(sb, propertyId, pr, property);

    return { success: true, pr };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function enrichByAPN(
  apiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  apn: string,
  county?: string,
): Promise<PREnrichResult> {
  try {
    const criteria: { name: string; value: (string | number)[] }[] = [
      { name: "APN", value: [apn] },
    ];
    if (county) {
      criteria.push({ name: "State", value: [county.toLowerCase().includes("kootenai") ? "ID" : "WA"] });
    }

    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`;
    const prResponse = await fetch(prUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ Criteria: criteria }),
    });

    if (!prResponse.ok) {
      return { success: false, error: `PropertyRadar APN lookup HTTP ${prResponse.status}` };
    }

    const prData = await prResponse.json();
    const pr = prData.results?.[0];

    if (!pr) {
      return { success: false, error: "No property found by APN" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updatePropertyFromPR(sb, propertyId, pr, {} as any);
    return { success: true, pr };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updatePropertyFromPR(sb: any, propertyId: string, pr: any, existingProperty: Record<string, any>): Promise<void> {
  const existingFlags = (existingProperty.owner_flags ?? {}) as Record<string, unknown>;

  const ownerFlags: Record<string, unknown> = {
    ...existingFlags,
    source: "propertyradar",
    radar_id: pr.RadarID ?? null,
    last_enriched: new Date().toISOString(),
    enrichment_pending: false,
    enrichment_status: "enriched",
    enrichment_completed_at: new Date().toISOString(),
    pr_raw: pr,
  };

  if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
  if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
  if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
  if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
  if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

  const estimatedValue = toNumber(pr.AVM);
  const equityPercent = toNumber(pr.EquityPercent);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {
    owner_name: pr.Owner ?? pr.Taxpayer ?? existingProperty.owner_name ?? "Unknown",
    estimated_value: estimatedValue != null ? Math.round(estimatedValue) : null,
    equity_percent: equityPercent ?? null,
    bedrooms: toInt(pr.Beds) ?? null,
    bathrooms: toNumber(pr.Baths) ?? null,
    sqft: toInt(pr.SqFt) ?? null,
    year_built: toInt(pr.YearBuilt) ?? null,
    lot_size: toInt(pr.LotSize) ?? null,
    property_type: pr.PType ?? null,
    owner_flags: ownerFlags,
    updated_at: new Date().toISOString(),
  };

  // Only overwrite address/city/state/zip if PR has real data
  if (pr.Address) {
    update.address = [pr.Address, pr.City, pr.State, pr.ZipFive].filter(Boolean).join(", ");
  }
  if (pr.City) update.city = pr.City;
  if (pr.State) update.state = pr.State;
  if (pr.ZipFive) update.zip = pr.ZipFive;
  if (pr.APN) update.apn = pr.APN;
  if (pr.County) update.county = normalizeCounty(pr.County, existingProperty.county ?? "Unknown");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("properties") as any).update(update).eq("id", propertyId);
  if (error) {
    console.error(`[Enrich] Property update failed for ${propertyId}:`, error.message);
  } else {
    console.log(`[Enrich] Property ${propertyId} enriched from PropertyRadar (${pr.RadarID})`);
  }
}

// ── Contact Info Enrichment (Skip-Trace Lite) ────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichContactInfo(sb: any, propertyId: string, pr: any): Promise<void> {
  try {
    // PropertyRadar Persons endpoint contains phone/email when available
    const persons = pr.Persons;
    if (!persons || !Array.isArray(persons) || persons.length === 0) return;

    const primary = persons[0];
    const phone = primary?.Phones?.[0]?.Number ?? null;
    const email = primary?.Emails?.[0]?.Email ?? null;

    if (!phone && !email) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (phone) update.owner_phone = phone;
    if (email) update.owner_email = email;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update(update).eq("id", propertyId);
    console.log(`[Enrich] Contact info added for ${propertyId}: phone=${!!phone}, email=${!!email}`);
  } catch (err) {
    // Non-fatal — skip-trace failure shouldn't block enrichment
    console.error(`[Enrich] Contact enrichment error for ${propertyId}:`, err);
  }
}

// ── ATTOM Fallback Enrichment ────────────────────────────────────────

interface AttomEnrichResult {
  success: boolean;
  signals?: DetectedSignal[];
  error?: string;
}

async function enrichFromAttom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
): Promise<AttomEnrichResult> {
  const attomKey = process.env.ATTOM_API_KEY;
  if (!attomKey) return { success: false, error: "ATTOM_API_KEY not configured" };

  const address = property.address ?? "";
  if (!address || address === "Unknown") {
    return { success: false, error: "No address for ATTOM lookup" };
  }

  try {
    // Dynamic import to avoid issues if attom module isn't fully configured
    const { getPropertyDetailByAddress } = await import("@/lib/attom");

    // Call ATTOM property detail by address
    // ATTOM expects address1 (street) and address2 (city, state, zip)
    const parts = address.split(",").map((s: string) => s.trim());
    const address1 = parts[0] ?? address;
    const address2 = parts.slice(1).join(", ") || `${property.city ?? ""} ${property.state ?? ""} ${property.zip ?? ""}`.trim();
    const detail = await getPropertyDetailByAddress(address1, address2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prop = (detail as any)?.property?.[0];

    if (!prop) return { success: false, error: "No ATTOM result for address" };

    // Extract key valuation data
    const avm = prop.avm?.amount?.value ?? prop.assessment?.market?.mktTtlValue ?? null;
    const assessed = prop.assessment?.assessed?.assdTtlValue ?? null;
    const loanAmt = prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0;
    const equityPercent = avm && loanAmt < avm ? Math.round(((avm - loanAmt) / avm) * 100) : null;

    const ownerFlags = (property.owner_flags ?? {}) as Record<string, unknown>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      estimated_value: avm ? Math.round(avm) : null,
      equity_percent: equityPercent,
      bedrooms: prop.building?.rooms?.beds ?? null,
      bathrooms: prop.building?.rooms?.bathsTotal ?? null,
      sqft: prop.building?.size?.livingSize ?? prop.building?.size?.bldgSize ?? null,
      year_built: prop.summary?.yearBuilt ?? null,
      lot_size: prop.lot?.lotSize1 ?? null,
      property_type: prop.summary?.propType ?? null,
      owner_flags: {
        ...ownerFlags,
        enrichment_pending: false,
        enrichment_status: "enriched",
        enrichment_source: "attom",
        enrichment_completed_at: new Date().toISOString(),
        attom_id: prop.identifier?.attomId,
      },
      updated_at: new Date().toISOString(),
    };

    // Update owner name if ATTOM has it and current is Unknown
    const attomOwner = prop.assessment?.owner?.owner1?.fullName;
    if (attomOwner && (property.owner_name === "Unknown" || property.owner_name === "Unknown Owner")) {
      update.owner_name = attomOwner;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update(update).eq("id", propertyId);

    // Detect signals from ATTOM data
    const signals: DetectedSignal[] = [];
    if (prop.summary?.absenteeInd === "Y") {
      signals.push({ type: "absentee", severity: 5, daysSinceEvent: 60, detectedFrom: "attom_absentee" });
    }
    if (assessed && avm && (assessed / avm) > 1.5) {
      signals.push({ type: "tax_lien", severity: 5, daysSinceEvent: 90, detectedFrom: "attom_tax_inference" });
    }

    console.log(`[Enrich] Property ${propertyId} enriched from ATTOM (${prop.identifier?.attomId})`);
    return { success: true, signals };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Scoring Pipeline ─────────────────────────────────────────────────

interface ScoreResult {
  composite: number;
  predictive: number;
  blended: number;
}

async function runScoringPipeline(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pr: any,
  signals: DetectedSignal[],
): Promise<ScoreResult> {
  // Deterministic scoring
  const equityPct = toNumber(pr.EquityPercent) ?? 50;
  const avm = toNumber(pr.AVM) ?? 0;
  const loanBal = toNumber(pr.TotalLoanBalance) ?? 0;
  const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

  const scoringInput: ScoringInput = {
    signals: signals.map((s) => ({ type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent })),
    ownerFlags: {
      absentee: isTruthy(pr.isNotSameMailingOrExempt),
      corporate: false,
      inherited: isTruthy(pr.isDeceasedProperty),
      elderly: false,
      outOfState: isTruthy(pr.isNotSameMailingOrExempt),
    },
    equityPercent: equityPct,
    compRatio: Math.min(compRatio, 3.0),
    historicalConversionRate: 0.5,
  };

  const score = computeScore(scoringInput);

  // Insert scoring record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: propertyId,
    model_version: SCORING_MODEL_VERSION,
    composite_score: score.composite,
    motivation_score: score.motivationScore,
    deal_score: score.dealScore,
    severity_multiplier: score.severityMultiplier,
    recency_decay: score.recencyDecay,
    stacking_bonus: score.stackingBonus,
    owner_factor_score: score.ownerFactorScore,
    equity_factor_score: score.equityFactorScore,
    ai_boost: score.aiBoost,
    factors: score.factors,
  });

  // Predictive scoring — fetch events & historical scores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (sb.from("distress_events") as any)
    .select("event_type, severity, created_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(20);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scores } = await (sb.from("scoring_records") as any)
    .select("composite_score, created_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Re-read the freshly updated property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: freshProp } = await (sb.from("properties") as any)
    .select("*")
    .eq("id", propertyId)
    .single();

  const predInput = buildPredictiveInput(
    propertyId,
    freshProp ?? property,
    (events ?? []) as { event_type: string; severity: number; created_at: string }[],
    (scores ?? []) as { composite_score: number; created_at: string }[],
  );

  const predOutput = computePredictiveScore(predInput);
  const blended = blendHeatScore(score.composite, predOutput.predictiveScore, predOutput.confidence);

  // Insert prediction record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_predictions") as any).insert(buildPredictionRecord(propertyId, predOutput));

  return { composite: score.composite, predictive: predOutput.predictiveScore, blended };
}

async function runScoringPipelineFromFlags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
  signals: DetectedSignal[],
): Promise<ScoreResult> {
  const equityPct = toNumber(property.equity_percent) ?? 50;

  const scoringInput: ScoringInput = {
    signals: signals.map((s) => ({ type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent })),
    ownerFlags: {
      absentee: (property.owner_flags as Record<string, unknown>)?.absentee === true,
      corporate: false,
      inherited: false,
      elderly: false,
      outOfState: false,
    },
    equityPercent: equityPct,
    compRatio: 1.0,
    historicalConversionRate: 0,
  };

  const score = computeScore(scoringInput);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: propertyId,
    model_version: SCORING_MODEL_VERSION,
    composite_score: score.composite,
    motivation_score: score.motivationScore,
    deal_score: score.dealScore,
    severity_multiplier: score.severityMultiplier,
    recency_decay: score.recencyDecay,
    stacking_bonus: score.stackingBonus,
    owner_factor_score: score.ownerFactorScore,
    equity_factor_score: score.equityFactorScore,
    ai_boost: score.aiBoost,
    factors: score.factors,
  });

  // Simple predictive with what we have
  const predInput: PredictiveInput = {
    propertyId,
    ownerName: property.owner_name ?? "Unknown",
    ownershipYears: null,
    lastSaleDate: null,
    lastSalePrice: null,
    estimatedValue: property.estimated_value ?? null,
    equityPercent: equityPct,
    previousEquityPercent: null,
    equityDeltaMonths: null,
    totalLoanBalance: null,
    isAbsentee: signals.some((s) => s.type === "absentee"),
    absenteeSinceDate: null,
    isVacant: signals.some((s) => s.type === "vacant"),
    isCorporateOwner: false,
    isFreeClear: false,
    ownerAgeKnown: null,
    delinquentAmount: null,
    previousDelinquentAmount: null,
    delinquentYears: 0,
    taxAssessedValue: null,
    activeSignals: signals.map((s) => ({ type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent })),
    historicalScores: [],
    foreclosureStage: null,
    defaultAmount: null,
    hasPhone: !!property.owner_phone,
    hasEmail: !!property.owner_email,
    hasProbateSignal: signals.some((s) => s.type === "probate"),
    hasInheritedSignal: signals.some((s) => s.type === "inherited"),
  };

  const predOutput = computePredictiveScore(predInput);
  const blended = blendHeatScore(score.composite, predOutput.predictiveScore, predOutput.confidence);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_predictions") as any).insert(buildPredictionRecord(propertyId, predOutput));

  return { composite: score.composite, predictive: predOutput.predictiveScore, blended };
}

// ── Promote Lead ─────────────────────────────────────────────────────

async function promoteToProspect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  leadId: string,
  propertyId: string,
  blendedScore: number,
  signals: DetectedSignal[],
  source: string,
  attempts: number,
): Promise<void> {
  const label = getScoreLabel(blendedScore);
  const scoreLabelTag = `score-${label}`;
  const signalTags = signals.map((s) => s.type);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .update({
      status: "prospect",
      priority: blendedScore,
      tags: [scoreLabelTag, ...signalTags],
      notes: `Enriched [${source}] — Heat ${blendedScore} (${label}). ${signals.length} signal(s). Attempts: ${attempts}`,
      promoted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "enrichment.promoted",
    entity_type: "lead",
    entity_id: leadId,
    details: {
      property_id: propertyId,
      source,
      blended_score: blendedScore,
      label,
      signals: signals.length,
      attempts,
    },
  });

  console.log(`[Enrich] Lead ${leadId} promoted: staging → prospect (score: ${blendedScore}, source: ${source})`);
}

// ── Batch Processor ──────────────────────────────────────────────────

/**
 * Process a batch of staging leads through the enrichment pipeline.
 * Called by the cron endpoint and the agent cycle.
 *
 * @param limit Max leads to process in this batch (default 10)
 * @param delayMs Delay between API calls in ms (default 1000)
 */
export async function processEnrichmentBatch(
  limit: number = 10,
  delayMs: number = 1000,
): Promise<BatchResult> {
  const startTime = Date.now();
  const sb = createServerClient();

  // Fetch staging leads with their property data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stagingLeads, error: queryErr } = await (sb.from("leads") as any)
    .select("id, property_id, priority, source, tags, notes")
    .eq("status", "staging")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (queryErr) {
    console.error("[Enrich/Batch] Query error:", queryErr.message);
    return { processed: 0, enriched: 0, partial: 0, failed: 0, remaining: 0, results: [], elapsed_ms: Date.now() - startTime };
  }

  if (!stagingLeads || stagingLeads.length === 0) {
    console.log("[Enrich/Batch] No staging leads to process");
    return { processed: 0, enriched: 0, partial: 0, failed: 0, remaining: 0, results: [], elapsed_ms: Date.now() - startTime };
  }

  console.log(`[Enrich/Batch] Processing ${stagingLeads.length} staging leads`);

  // Fetch properties for these leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propertyIds = (stagingLeads as any[]).map((l) => l.property_id).filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: properties } = await (sb.from("properties") as any)
    .select("*")
    .in("id", propertyIds);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propMap: Record<string, any> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (properties ?? []) as any[]) {
    propMap[p.id] = p;
  }

  const results: EnrichmentResult[] = [];
  let enriched = 0;
  let partial = 0;
  let failed = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const lead of stagingLeads as any[]) {
    const property = propMap[lead.property_id];
    if (!property) {
      console.error(`[Enrich/Batch] No property found for lead ${lead.id}`);
      failed++;
      results.push({
        propertyId: lead.property_id, leadId: lead.id,
        success: false, enrichmentSource: "failed",
        score: null, label: null, signalsDetected: 0,
        error: "Property not found in database",
        elapsed_ms: 0,
      });
      continue;
    }

    const result = await enrichProperty(lead.property_id, lead.id, property, lead);
    results.push(result);

    if (result.success) enriched++;
    else if (result.enrichmentSource === "partial") partial++;
    else failed++;

    // Rate-limit between API calls
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Count remaining staging leads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: remaining } = await (sb.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "staging");

  const elapsed = Date.now() - startTime;
  console.log(`[Enrich/Batch] Complete: ${enriched} enriched, ${partial} partial, ${failed} failed, ${remaining ?? "?"} remaining (${elapsed}ms)`);

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "enrichment.batch_complete",
    entity_type: "system",
    entity_id: "enrichment_batch",
    details: {
      processed: stagingLeads.length,
      enriched,
      partial,
      failed,
      remaining: remaining ?? 0,
      elapsed_ms: elapsed,
    },
  });

  return {
    processed: stagingLeads.length,
    enriched, partial, failed,
    remaining: remaining ?? 0,
    results,
    elapsed_ms: elapsed,
  };
}
