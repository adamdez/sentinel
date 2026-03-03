/**
 * Sentinel Enrichment Engine v1.1
 *
 * Automatic property enrichment pipeline for staging leads.
 * Called by the enrichment batch cron and the agent cycle.
 *
 * Pipeline per property:
 *   1. PropertyRadar lookup (address → full property data + distress signals)
 *   2. ATTOM valuation fallback (if PR returns no AVM)
 *   3. Skip-trace for phone/email (PR Persons endpoint)
 *   4. Full scoring (deterministic v2.1 + predictive v2.1 + blend)
 *   5. Finalize lead — set score, tags, notes but KEEP status "staging"
 *
 * Staging acts as a RESERVOIR. Leads are enriched & scored but stay invisible.
 * Admins pull leads into "prospect" on demand via POST /api/enrichment/promote.
 *
 * Safety net: After MAX_ATTEMPTS failures, marks as enriched with partial data
 * (still in staging — admin decides when to promote).
 *
 * Domain: Enrichment Pipeline — reads properties, writes enriched data,
 * scores leads. Respects all golden key and dedup invariants.
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
import { dualSkipTrace, skipTraceResultToOwnerFlags, type SkipTraceResult } from "@/lib/skip-trace";
import type { DistressType } from "@/lib/types";

const AUTO_SKIPTRACE_THRESHOLD = 65;

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
      // ── Step 2: Detect distress signals ────────────────────────
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

      // ── Step 3: Full scoring pipeline (BEFORE skip-trace) ──────
      const score = await runScoringPipeline(sb, propertyId, property, prResult.pr, signals);

      // ── Step 4: Conditional dual skip-trace (Gold+ only) ───────
      // Only spend money on phone/email lookups for leads scoring >= 65
      if (score.blended >= AUTO_SKIPTRACE_THRESHOLD) {
        const radarId = prResult.pr.RadarID as string | undefined;
        await runDualSkipTrace(sb, propertyId, property, radarId);
        console.log(`[Enrich] Auto skip-trace triggered for ${propertyId} (score ${score.blended} >= ${AUTO_SKIPTRACE_THRESHOLD})`);
      } else {
        console.log(`[Enrich] Skip-trace skipped for ${propertyId} (score ${score.blended} < ${AUTO_SKIPTRACE_THRESHOLD})`);
      }

      // ── Step 5: Finalize lead (score + tag, keep in staging) ────
      await finalizeEnrichment(sb, leadId, propertyId, score.blended, signals, "propertyradar", attempts);

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

      // Conditional dual skip-trace for ATTOM path too (Gold+ only)
      if (score.blended >= AUTO_SKIPTRACE_THRESHOLD) {
        await runDualSkipTrace(sb, propertyId, property);
        console.log(`[Enrich] Auto skip-trace (ATTOM path) for ${propertyId} (score ${score.blended})`);
      }

      await finalizeEnrichment(sb, leadId, propertyId, score.blended, signals, "attom", attempts);

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

    // Safety net: after MAX_ATTEMPTS, finalize with partial data (stays in staging)
    if (attempts >= MAX_ATTEMPTS) {
      console.log(`[Enrich] Max attempts (${MAX_ATTEMPTS}) reached for ${propertyId} — finalizing with partial data`);
      await finalizeEnrichment(sb, leadId, propertyId, lead.priority ?? 30, [], "partial", attempts);

      return {
        propertyId, leadId, success: false,
        enrichmentSource: "partial",
        score: lead.priority ?? 30,
        label: getScoreLabel(lead.priority ?? 30),
        signalsDetected: 0,
        error: `Failed after ${MAX_ATTEMPTS} attempts — finalized with partial data`,
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
      await finalizeEnrichment(sb, leadId, propertyId, lead.priority ?? 30, [], "partial", attempts);
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

// ── Dual-Source Skip-Trace (PR Persons + BatchData) ──────────────────

/**
 * Run dual skip-trace and persist results to the property record.
 * Called conditionally when score >= AUTO_SKIPTRACE_THRESHOLD.
 */
export async function runDualSkipTrace(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
  radarId?: string,
): Promise<SkipTraceResult | null> {
  try {
    const result = await dualSkipTrace(
      {
        id: propertyId,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        owner_name: property.owner_name,
      },
      radarId,
    );

    if (result.totalPhoneCount === 0 && result.totalEmailCount === 0) {
      console.log(`[Enrich] Dual skip-trace returned no contacts for ${propertyId}`);
      return result;
    }

    // Read current flags, merge skip-trace data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentProp } = await (sb.from("properties") as any)
      .select("owner_flags").eq("id", propertyId).single();
    const existingFlags = (currentProp?.owner_flags ?? {}) as Record<string, unknown>;

    const skipFlags = skipTraceResultToOwnerFlags(result);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {
      owner_flags: { ...existingFlags, ...skipFlags },
      updated_at: new Date().toISOString(),
    };

    if (result.primaryPhone) update.owner_phone = result.primaryPhone;
    if (result.primaryEmail) update.owner_email = result.primaryEmail;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update(update).eq("id", propertyId);

    console.log(`[Enrich] Dual skip-trace stored for ${propertyId}: ${result.totalPhoneCount} phones, ${result.totalEmailCount} emails [${result.providers.join("+")}]`);
    return result;
  } catch (err) {
    console.error(`[Enrich] Dual skip-trace error for ${propertyId}:`, err);
    return null;
  }
}

// ── Legacy Contact Info Enrichment (Smart Heir Extraction) ───────────

interface PersonContact {
  name: string;
  role: string; // "Owner", "Heir", "Executor", "Beneficiary", etc.
  phone: string | null;
  email: string | null;
  mailingAddress: string | null;
  isPrimary: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrichContactInfo(sb: any, propertyId: string, pr: any): Promise<void> {
  try {
    const persons = pr.Persons;
    if (!persons || !Array.isArray(persons) || persons.length === 0) return;

    // Extract all persons with their roles
    const contacts: PersonContact[] = [];
    for (const person of persons) {
      const name = [person.FirstName, person.LastName].filter(Boolean).join(" ")
        || person.EntityName || person.Name || "Unknown";
      const role = person.OwnershipRole ?? person.PersonType ?? "Owner";
      const phone = person.Phones?.[0]?.Number ?? null;
      const email = person.Emails?.[0]?.Email ?? null;
      const mailParts = person.MailAddress?.[0];
      const mailingAddress = mailParts
        ? [mailParts.Address, mailParts.City, mailParts.State, mailParts.Zip].filter(Boolean).join(", ")
        : null;

      contacts.push({
        name,
        role,
        phone,
        email,
        mailingAddress,
        isPrimary: person.isPrimaryContact === 1,
      });
    }

    // Smart priority: prefer heir/executor contacts over the deceased owner
    const HEIR_ROLES = ["heir", "executor", "beneficiary", "trustee", "successor"];
    const isDeceased = isTruthy(pr.isDeceasedProperty);

    // Sort: heirs/executors first, then primary contact, then others
    const sorted = [...contacts].sort((a, b) => {
      const aIsHeir = HEIR_ROLES.some((r) => a.role.toLowerCase().includes(r));
      const bIsHeir = HEIR_ROLES.some((r) => b.role.toLowerCase().includes(r));
      if (aIsHeir && !bIsHeir) return -1;
      if (!aIsHeir && bIsHeir) return 1;
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return 0;
    });

    // Find the best contact with phone/email
    const bestWithPhone = sorted.find((c) => c.phone);
    const bestWithEmail = sorted.find((c) => c.email);
    const bestContact = bestWithPhone ?? bestWithEmail ?? sorted[0];

    if (!bestContact?.phone && !bestContact?.email) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (bestContact.phone) update.owner_phone = bestContact.phone;
    if (bestContact.email) update.owner_email = bestContact.email;

    // Store all heir contacts in owner_flags for the MCF modal
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentProp } = await (sb.from("properties") as any)
      .select("owner_flags").eq("id", propertyId).single();
    const flags = (currentProp?.owner_flags ?? {}) as Record<string, unknown>;

    const heirContacts = sorted
      .filter((c) => HEIR_ROLES.some((r) => c.role.toLowerCase().includes(r)) || (isDeceased && c.role !== "Owner"))
      .map((c) => ({ name: c.name, role: c.role, phone: c.phone, email: c.email, mailing: c.mailingAddress }));

    if (heirContacts.length > 0) {
      update.owner_flags = {
        ...flags,
        heir_contacts: heirContacts,
        heir_count: heirContacts.length,
        best_contact_role: bestContact.role,
        best_contact_name: bestContact.name,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update(update).eq("id", propertyId);

    const heirLog = heirContacts.length > 0
      ? ` | ${heirContacts.length} heir(s): ${heirContacts.map((h) => `${h.name} (${h.role})`).join(", ")}`
      : "";
    console.log(`[Enrich] Contact info for ${propertyId}: ${bestContact.name} (${bestContact.role}), phone=${!!bestContact.phone}, email=${!!bestContact.email}${heirLog}`);
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

// ── Finalize Lead (score + tag but KEEP in staging) ──────────────────

async function finalizeEnrichment(
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

  // Keep status as "staging" — lead stays in the reservoir until admin pulls it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .update({
      priority: blendedScore,
      tags: [scoreLabelTag, ...signalTags],
      notes: `Enriched [${source}] — Heat ${blendedScore} (${label}). ${signals.length} signal(s). Attempts: ${attempts}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "enrichment.finalized",
    entity_type: "lead",
    entity_id: leadId,
    details: {
      property_id: propertyId,
      source,
      blended_score: blendedScore,
      label,
      signals: signals.length,
      attempts,
      status: "staging",
    },
  });

  console.log(`[Enrich] Lead ${leadId} enriched (staying in staging): score ${blendedScore} (${label}), source: ${source}`);
}

// ── Promote Leads from Staging → Prospect (admin pull) ───────────────

export interface PromoteFilter {
  tier?: "platinum" | "gold" | "silver" | "bronze" | "all";
  minScore?: number;
  maxScore?: number;
  limit?: number;
}

export interface PromoteResult {
  promoted: number;
  tier: string;
  scoreRange: { min: number; max: number };
  leads: { id: string; score: number; label: string }[];
}

const TIER_RANGES: Record<string, { min: number; max: number }> = {
  platinum: { min: 85, max: 100 },
  gold: { min: 65, max: 84 },
  silver: { min: 40, max: 64 },
  bronze: { min: 0, max: 39 },
  all: { min: 0, max: 100 },
};

/**
 * Pull enriched leads from staging into "prospect" by score tier.
 * Called by admin via POST /api/enrichment/promote.
 *
 * Only promotes leads that have been enriched (enrichment_status != "pending").
 */
export async function promoteByTier(filter: PromoteFilter): Promise<PromoteResult> {
  const sb = createServerClient();
  const tier = filter.tier ?? "all";
  const range = TIER_RANGES[tier] ?? TIER_RANGES.all;
  const minScore = filter.minScore ?? range.min;
  const maxScore = filter.maxScore ?? range.max;
  const limit = filter.limit ?? 500;

  // Query enriched staging leads in the score range
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("leads") as any)
    .select("id, property_id, priority, tags, notes, properties!inner(owner_flags, address, owner_name)")
    .eq("status", "staging")
    .gte("priority", minScore)
    .lte("priority", maxScore)
    .order("priority", { ascending: false })
    .limit(limit);

  const { data: leads, error: queryErr } = await query;

  if (queryErr) {
    console.error("[Promote] Query error:", queryErr.message);
    return { promoted: 0, tier, scoreRange: { min: minScore, max: maxScore }, leads: [] };
  }

  if (!leads || leads.length === 0) {
    return { promoted: 0, tier, scoreRange: { min: minScore, max: maxScore }, leads: [] };
  }

  // Filter to only enriched leads (not still pending enrichment)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrichedLeads = (leads as any[]).filter((l) => {
    const flags = l.properties?.owner_flags ?? {};
    const status = flags.enrichment_status;
    // Accept: enriched, partial, or any lead with a real score (priority > 0)
    return status === "enriched" || status === "partial" || l.priority > 0;
  });

  // ── Data quality gate ─────────────────────────────────────────────
  // Reject leads whose property has no real address or owner name.
  // These are garbage records from bulk-seed where PropertyRadar
  // returned empty/null Address fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualityFiltered = enrichedLeads.filter((l) => {
    const addr = (l.properties?.address ?? "").trim();
    const owner = (l.properties?.owner_name ?? "").trim();

    // Address must be > 5 chars and not just a state code
    const hasAddress = addr.length > 5 && !/^\s*[A-Z]{2}\s*,?\s*\d{0,5}\s*$/.test(addr);
    // Owner must not be "Unknown" or empty
    const hasOwner = owner.length > 0
      && owner.toLowerCase() !== "unknown"
      && owner.toLowerCase() !== "unknown owner"
      && owner.toLowerCase() !== "n/a";

    if (!hasAddress || !hasOwner) {
      console.log(`[Promote] BLOCKED garbage lead ${l.id}: addr="${addr}", owner="${owner}"`);
      return false;
    }
    return true;
  });

  const garbageCount = enrichedLeads.length - qualityFiltered.length;
  if (garbageCount > 0) {
    console.log(`[Promote] Data quality gate blocked ${garbageCount} garbage leads (no address or owner)`);
  }

  // ── Absentee-first gate ───────────────────────────────────────────
  // Only promote leads where the owner does NOT live in the property,
  // OR the owner is deceased (functionally absentee — heirs don't live there).
  // Non-absentee, non-deceased leads stay in the reservoir as backup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promotable = qualityFiltered.filter((l) => {
    const flags = l.properties?.owner_flags ?? {};
    const prRaw = flags.pr_raw ?? {};
    const tags: string[] = l.tags ?? [];

    // Deceased / probate leads are always promotable (owner is dead)
    const isDeceased =
      tags.includes("probate") ||
      tags.includes("inherited") ||
      prRaw.isDeceasedProperty === "Yes" ||
      prRaw.isDeceasedProperty === 1 ||
      prRaw.isDeceasedProperty === true;
    if (isDeceased) return true;

    // Absentee owners are promotable (mailing address differs from property)
    const isAbsentee =
      tags.includes("absentee") ||
      prRaw.isNotSameMailingOrExempt === "Yes" ||
      prRaw.isNotSameMailingOrExempt === 1 ||
      prRaw.isNotSameMailingOrExempt === true;
    if (isAbsentee) return true;

    // Non-absentee, non-deceased → stays in reservoir
    return false;
  });

  console.log(`[Promote] ${enrichedLeads.length} enriched, ${garbageCount} blocked (bad data), ${promotable.length} promotable (absentee/deceased), ${qualityFiltered.length - promotable.length} held in reservoir`);

  if (promotable.length === 0) {
    return { promoted: 0, tier, scoreRange: { min: minScore, max: maxScore }, leads: [] };
  }

  // Batch promote
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promotedLeads: { id: string; score: number; label: string }[] = [];

  for (let i = 0; i < promotable.length; i += 100) {
    const batch = promotable.slice(i, i + 100);
    const ids = batch.map((l: { id: string }) => l.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (sb.from("leads") as any)
      .update({
        status: "prospect",
        promoted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (updateErr) {
      console.error(`[Promote] Batch update error:`, updateErr.message);
    } else {
      for (const l of batch) {
        promotedLeads.push({
          id: l.id,
          score: l.priority,
          label: getScoreLabel(l.priority),
        });
      }
    }
  }

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "enrichment.bulk_promote",
    entity_type: "system",
    entity_id: "enrichment_promote",
    details: {
      tier,
      scoreRange: { min: minScore, max: maxScore },
      promoted: promotedLeads.length,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`[Promote] ${promotedLeads.length} leads promoted: staging → prospect (tier: ${tier}, range: ${minScore}-${maxScore})`);

  return {
    promoted: promotedLeads.length,
    tier,
    scoreRange: { min: minScore, max: maxScore },
    leads: promotedLeads,
  };
}

/**
 * Get a summary of enriched staging leads by tier.
 * Used by the UI to show what's available in the reservoir.
 */
export async function getStagingSummary(): Promise<{
  total: number;
  enriched: number;
  pending: number;
  tiers: { tier: string; count: number; min: number; max: number }[];
}> {
  const sb = createServerClient();

  // Get all staging leads with their scores
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staging, error } = await (sb.from("leads") as any)
    .select("id, priority, property_id, properties!inner(owner_flags)")
    .eq("status", "staging");

  if (error || !staging) {
    return { total: 0, enriched: 0, pending: 0, tiers: [] };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = staging as any[];
  const enriched = all.filter((l) => {
    const flags = l.properties?.owner_flags ?? {};
    return flags.enrichment_status === "enriched" || flags.enrichment_status === "partial" || l.priority > 0;
  });
  const pending = all.length - enriched.length;

  const tiers = [
    { tier: "platinum", count: enriched.filter((l) => l.priority >= 85).length, min: 85, max: 100 },
    { tier: "gold", count: enriched.filter((l) => l.priority >= 65 && l.priority < 85).length, min: 65, max: 84 },
    { tier: "silver", count: enriched.filter((l) => l.priority >= 40 && l.priority < 65).length, min: 40, max: 64 },
    { tier: "bronze", count: enriched.filter((l) => l.priority < 40).length, min: 0, max: 39 },
  ];

  return { total: all.length, enriched: enriched.length, pending, tiers };
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

  // Fetch staging leads that NEED enrichment (skip pre-enriched PR/ATTOM/crawler leads)
  // Pre-enriched leads have priority > 0 and their property has enrichment_status = "enriched"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stagingLeads, error: queryErr } = await (sb.from("leads") as any)
    .select("id, property_id, priority, source, tags, notes")
    .eq("status", "staging")
    .order("created_at", { ascending: true })
    .limit(1000); // Fetch all staging leads — filter pre-enriched in memory

  if (queryErr) {
    console.error("[Enrich/Batch] Query error:", queryErr.message);
    return { processed: 0, enriched: 0, partial: 0, failed: 0, remaining: 0, results: [], elapsed_ms: Date.now() - startTime };
  }

  if (!stagingLeads || stagingLeads.length === 0) {
    console.log("[Enrich/Batch] No staging leads to process");
    return { processed: 0, enriched: 0, partial: 0, failed: 0, remaining: 0, results: [], elapsed_ms: Date.now() - startTime };
  }

  console.log(`[Enrich/Batch] Found ${stagingLeads.length} staging leads, filtering...`);

  // Fetch properties for these leads (batch in chunks of 100 to avoid URL length limits)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propertyIds = [...new Set((stagingLeads as any[]).map((l) => l.property_id).filter(Boolean))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propMap: Record<string, any> = {};
  for (let i = 0; i < propertyIds.length; i += 100) {
    const chunk = propertyIds.slice(i, i + 100);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: props } = await (sb.from("properties") as any)
      .select("*")
      .in("id", chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (props ?? []) as any[]) {
      propMap[p.id] = p;
    }
  }
  console.log(`[Enrich/Batch] Loaded ${Object.keys(propMap).length} properties for ${propertyIds.length} unique IDs`);

  // ── Separate pre-enriched leads from those needing enrichment ──
  // Pre-enriched leads (from PR Elite Seed, ATTOM Daily, Crawlers) already have
  // scores, distress events, and property data. They just need finalization.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const needsEnrichment: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alreadyEnriched: any[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const lead of stagingLeads as any[]) {
    const prop = propMap[lead.property_id];
    if (!prop) {
      needsEnrichment.push(lead); // no property = definitely needs work
      continue;
    }
    const flags = prop.owner_flags ?? {};
    // A lead is pre-enriched ONLY if it still has a score (priority > 0).
    // Flushed leads get priority reset to 0, forcing re-enrichment even if
    // the property still has enrichment_status = "enriched".
    const isPreEnriched =
      lead.priority > 0 && (
        flags.enrichment_status === "enriched" ||
        flags.crawler_source || // crawler leads arrive scored
        flags.pr_data_version   // PR leads arrive scored
      );
    if (isPreEnriched) {
      alreadyEnriched.push(lead);
    } else {
      needsEnrichment.push(lead);
    }
  }

  console.log(`[Enrich/Batch] ${alreadyEnriched.length} pre-enriched (skip), ${needsEnrichment.length} need enrichment`);

  // Take only `limit` leads that actually need enrichment
  const toProcess = needsEnrichment.slice(0, limit);

  const results: EnrichmentResult[] = [];
  let enriched = 0;
  let partial = 0;
  let failed = 0;

  for (const lead of toProcess) {
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
      processed: toProcess.length,
      skipped_pre_enriched: alreadyEnriched.length,
      enriched,
      partial,
      failed,
      remaining: remaining ?? 0,
      elapsed_ms: elapsed,
    },
  });

  return {
    processed: toProcess.length,
    enriched, partial, failed,
    remaining: remaining ?? 0,
    results,
    elapsed_ms: elapsed,
  };
}
