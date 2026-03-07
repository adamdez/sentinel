/**
 * Sentinel Enrichment Engine v2.2
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
import { distressFingerprint, isDuplicateError, normalizeCounty, daysSince } from "@/lib/dedup";
import { dualSkipTrace, skipTraceResultToOwnerFlags, type SkipTraceResult } from "@/lib/skip-trace";
import { detectDistressSignals, type DetectedSignal } from "@/lib/distress-signals";
import { COUNTY_FIPS } from "@/lib/attom";
import { checkDataSufficiency } from "@/lib/enrichment-gate";
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

// ── Data sufficiency gate is in src/lib/enrichment-gate.ts (pure, testable) ──

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

// ── Signal Verification (Phase 1d) ──────────────────────────────────

/**
 * Maps distress event types to PropertyRadar flags that indicate
 * the signal is still active. Used during re-enrichment to verify
 * or resolve existing signals.
 */
const SIGNAL_PR_FLAGS: Record<string, string[]> = {
  probate: ["isDeceasedProperty"],
  pre_foreclosure: ["isPreforeclosure", "inForeclosure"],
  tax_lien: ["inTaxDelinquency", "PropertyHasOpenLiens", "PropertyHasOpenPersonLiens"],
  bankruptcy: ["inBankruptcyProperty"],
  divorce: ["inDivorce"],
  vacant: ["isSiteVacant", "isMailVacant"],
  absentee: ["isNotSameMailingOrExempt"],
  underwater: ["isUnderwater"],
  // tired_landlord is composite — checked separately
};

/**
 * Extract the real event date from PR data for a given signal type.
 * Returns ISO date string or null if no date available.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEventDate(pr: any, signalType: string): string | null {
  switch (signalType) {
    case "probate": return null; // DeceasedDate is NOT a valid PR field
    case "pre_foreclosure": return pr.ForeclosureRecDate ?? pr.DefaultAsOf ?? null;
    case "tax_lien":
      if (pr.DelinquentYear) return `${pr.DelinquentYear}-01-01`;
      return null;
    case "bankruptcy": return null; // BankruptcyRecDate is NOT a valid PR field
    case "divorce": return null; // DivorceRecDate is NOT a valid PR field
    default: return null;
  }
}

/**
 * Check if a signal type is still active based on current PR data.
 * For composite signals (tired_landlord), checks component conditions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSignalStillActive(pr: any, signalType: string): boolean {
  if (signalType === "tired_landlord") {
    const isAbsentee = isTruthy(pr.isNotSameMailingOrExempt);
    const units = toNumber(pr.Units) ?? 1;
    const dateStr = (pr.LastTransferRecDate ?? pr.SaleDate) as string | undefined;
    let ownershipYears: number | null = null;
    if (dateStr) {
      const days = daysSince(dateStr, -1);
      if (days >= 0) ownershipYears = days / 365;
    }
    return isAbsentee && units >= 2 && ownershipYears !== null && ownershipYears > 10;
  }

  const flags = SIGNAL_PR_FLAGS[signalType];
  if (!flags) return false; // unknown type, can't verify
  return flags.some((flag) => isTruthy(pr[flag]));
}

/**
 * Verify existing distress signals against fresh PropertyRadar data.
 *
 * Called during re-enrichment to update signal lifecycle:
 * - Still active → status = 'active', last_verified_at = now()
 * - No longer active → status = 'resolved', resolved_at = now()
 * - Backfill event_date from PR if not yet set
 */
async function verifyExistingSignals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pr: any,
): Promise<{ verified: number; resolved: number }> {
  // Fetch existing non-resolved events for this property.
  // Only verify signals from data providers (PR, ATTOM, CSV) — NOT OpenClaw/deep_crawl
  // signals, which PR wouldn't know about and would incorrectly resolve.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("distress_events") as any)
    .select("id, event_type, status, event_date, source")
    .eq("property_id", propertyId)
    .in("status", ["active", "unknown"])
    .in("source", ["propertyradar", "attom", "csv", "bulk_seed"]);

  if (!existing || existing.length === 0) {
    return { verified: 0, resolved: 0 };
  }

  const now = new Date().toISOString();
  let verified = 0;
  let resolved = 0;

  for (const evt of existing) {
    const stillActive = isSignalStillActive(pr, evt.event_type);

    if (stillActive) {
      // Signal confirmed active — update verification timestamp
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: Record<string, any> = {
        status: "active",
        last_verified_at: now,
      };
      // Backfill event_date if we didn't have one before
      if (!evt.event_date) {
        const realDate = extractEventDate(pr, evt.event_type);
        if (realDate) update.event_date = realDate;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("distress_events") as any).update(update).eq("id", evt.id);
      verified++;
    } else {
      // Signal no longer present in PR data — mark as resolved
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("distress_events") as any)
        .update({ status: "resolved", resolved_at: now, last_verified_at: now })
        .eq("id", evt.id);
      resolved++;
    }
  }

  if (verified > 0 || resolved > 0) {
    console.log(`[Enrich] Signal verification for ${propertyId}: ${verified} verified active, ${resolved} resolved`);
  }

  return { verified, resolved };
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

// ── Data Quality Gates (Phase 0a) ────────────────────────────────────

/**
 * Fuzzy name match — normalize and compare two names.
 * Returns confidence 0–100. Used to verify crawler findings against property owner.
 */
function fuzzyNameMatch(nameA: string, nameB: string): number {
  if (!nameA || !nameB) return 0;
  // Normalize: lowercase, strip suffixes, remove punctuation
  const normalize = (n: string) =>
    n.toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv|v|esq|md|phd|dds|inc|llc|trust|estate)\b\.?/gi, "")
      .replace(/[^a-z\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const a = normalize(nameA);
  const b = normalize(nameB);

  if (a === b) return 100;

  // Check if one contains the other (e.g. "John Smith" vs "John A Smith")
  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);

  // Match first + last name (most common format)
  const aFirst = aParts[0] ?? "";
  const aLast = aParts[aParts.length - 1] ?? "";
  const bFirst = bParts[0] ?? "";
  const bLast = bParts[bParts.length - 1] ?? "";

  if (aFirst === bFirst && aLast === bLast) return 90;
  if (aLast === bLast) return 60;  // Same last name
  if (aFirst === bFirst) return 40; // Same first name only

  // Check overlap of all name parts
  const overlap = aParts.filter((p) => bParts.includes(p)).length;
  const maxParts = Math.max(aParts.length, bParts.length);
  return maxParts > 0 ? Math.round((overlap / maxParts) * 80) : 0;
}

/**
 * Check if property has changed ownership since a distress event.
 * Returns { changed: boolean, transferDate, previousOwner? }
 */
function checkOwnershipChange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prData: Record<string, any>,
  distressEvents: { event_type: string; created_at: string; event_date?: string }[],
): { changed: boolean; transferDate: string | null; note: string | null } {
  const transferDateStr = prData.LastTransferRecDate ?? prData.SaleDate;
  if (!transferDateStr) return { changed: false, transferDate: null, note: null };

  const transferDate = new Date(transferDateStr);
  if (isNaN(transferDate.getTime())) return { changed: false, transferDate: null, note: null };

  // Check if any distress event predates the transfer
  for (const evt of distressEvents) {
    const evtDateStr = evt.event_date ?? evt.created_at;
    const evtDate = new Date(evtDateStr);
    if (isNaN(evtDate.getTime())) continue;

    if (transferDate > evtDate) {
      return {
        changed: true,
        transferDate: transferDateStr,
        note: `Property transferred ${transferDateStr} — after ${evt.event_type} event (${evtDateStr.slice(0, 10)}). Previous distress may not apply to current owner.`,
      };
    }
  }

  return { changed: false, transferDate: transferDateStr, note: null };
}

/**
 * MLS re-check during enrichment — flags properties currently listed for sale.
 * Agents should know if property is on MLS before making contact.
 */
function checkMLSStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prData: Record<string, any>,
): { isListed: boolean; detectedAt: string | null } {
  const listed = isTruthy(prData.isListedForSale);
  return {
    isListed: listed,
    detectedAt: listed ? new Date().toISOString() : null,
  };
}

/**
 * Run deep crawl for a property during staging enrichment.
 * Queries existing distress_events from all crawlers and adds
 * ownership verification notes. Actual crawlers run on their own
 * schedule via cron — this function verifies/annotates existing findings.
 */
async function runDeepCrawlVerification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  ownerName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prData: Record<string, any>,
): Promise<{ verifiedFindings: number; ownershipChanged: boolean; note: string | null }> {
  // Fetch all existing distress events for this property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events } = await (sb.from("distress_events") as any)
    .select("id, event_type, source, created_at, event_date, raw_data, status")
    .eq("property_id", propertyId)
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!events || events.length === 0) {
    return { verifiedFindings: 0, ownershipChanged: false, note: null };
  }

  // ── Ownership verification gate ──
  const ownership = checkOwnershipChange(prData, events as { event_type: string; created_at: string; event_date?: string }[]);

  let verifiedCount = 0;
  const now = new Date().toISOString();

  for (const evt of events as { id: string; event_type: string; source: string; raw_data: Record<string, unknown> }[]) {
    // ── Name match verification ──
    // If crawler found a person (e.g. obituary), verify name matches current owner
    const crawlerName = (evt.raw_data?.name as string) ?? "";
    let nameVerified = true;
    let nameNote = "";

    if (crawlerName && ownerName) {
      const confidence = fuzzyNameMatch(crawlerName, ownerName);
      if (confidence < 60) {
        nameVerified = false;
        nameNote = `Name mismatch: crawler found "${crawlerName}" but property owner is "${ownerName}" (confidence: ${confidence}%)`;
      }
    }

    // Update event with verification metadata
    const updateData: Record<string, unknown> = {
      last_verified_at: now,
      raw_data: {
        ...(evt.raw_data ?? {}),
        name_verified: nameVerified,
        name_confidence: crawlerName && ownerName ? fuzzyNameMatch(crawlerName, ownerName) : null,
        ownership_changed: ownership.changed,
        ...(nameNote ? { name_mismatch_note: nameNote } : {}),
        ...(ownership.note ? { ownership_note: ownership.note } : {}),
      },
    };

    // If ownership changed AND this is a person-specific event, flag as unverified
    if (ownership.changed && ["probate", "inherited", "bankruptcy", "divorce"].includes(evt.event_type)) {
      updateData.status = "unverified";
      (updateData.raw_data as Record<string, unknown>).unverified_reason =
        "Property ownership changed after this distress event — may apply to previous owner";
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("distress_events") as any).update(updateData).eq("id", evt.id);
    if (nameVerified && !ownership.changed) verifiedCount++;
  }

  return {
    verifiedFindings: verifiedCount,
    ownershipChanged: ownership.changed,
    note: ownership.note,
  };
}

// ── Single Property Enrichment ───────────────────────────────────────

/**
 * Enrich a single property + lead using PropertyRadar → deep crawl verify → scoring → promote.
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
      const detection = detectDistressSignals(prResult.pr);
      const signals = detection.signals;

      // ── Step 2b: Verify existing signals against fresh PR data ──
      // Marks still-active signals as verified, resolves signals no longer in PR
      await verifyExistingSignals(sb, propertyId, prResult.pr);

      // Insert distress events (dedup by fingerprint) with lifecycle fields
      const apn = prResult.pr.APN ?? property.apn ?? propertyId;
      const county = normalizeCounty(prResult.pr.County ?? property.county ?? "", "Unknown");
      const now = new Date().toISOString();

      for (const signal of signals) {
        const fp = distressFingerprint(apn, county, signal.type, "propertyradar");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: evtErr } = await (sb.from("distress_events") as any).insert({
          property_id: propertyId,
          event_type: signal.type,
          source: "propertyradar",
          severity: signal.severity,
          fingerprint: fp,
          raw_data: {
            detected_from: signal.detectedFrom,
            radar_id: prResult.pr.RadarID,
            // Stage tracking data
            ...(signal.stage ? { stage: signal.stage } : {}),
            ...(signal.stageDate ? { stage_date: signal.stageDate } : {}),
            ...(signal.nextAction ? { next_action: signal.nextAction } : {}),
            ...(signal.nextActionDate ? { next_action_date: signal.nextActionDate } : {}),
            ...(signal.amount ? { amount: signal.amount } : {}),
          },
          confidence: signal.severity >= 7 ? "0.900" : signal.severity >= 4 ? "0.750" : "0.600",
          status: "active",
          last_verified_at: now,
          event_date: signal.stageDate ?? extractEventDate(prResult.pr, signal.type),
        });
        if (evtErr && !isDuplicateError(evtErr)) {
          console.error(`[Enrich] Event insert error (${signal.type}):`, evtErr.message);
        }
      }

      // ── Step 2c: ATTOM gap-fill for partial PR matches ────────
      // PR matched the property but may lack owner name or AVM —
      // call ATTOM to fill those gaps without re-running signals.
      const prOwner = prResult.pr.Owner ?? prResult.pr.Taxpayer;
      const prAVM = prResult.pr.AVM;
      const needsGapFill = !prOwner || prOwner === "Unknown" || !prAVM;

      if (needsGapFill) {
        console.log(
          `[Enrich] PR match partial (owner=${prOwner ?? "null"}, AVM=${prAVM ?? "null"}) — trying ATTOM gap-fill for ${propertyId}`
        );
        // Re-fetch property to get latest data after PR update
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: freshProp } = await (sb.from("properties") as any)
          .select("*")
          .eq("id", propertyId)
          .single();

        if (freshProp) {
          const attomGap = await enrichFromAttom(sb, propertyId, freshProp);
          if (attomGap.success) {
            console.log(`[Enrich] ATTOM gap-fill succeeded for ${propertyId}`);
            // Merge any ATTOM-discovered signals into the current batch
            if (attomGap.signals?.length) {
              for (const sig of attomGap.signals) {
                const attomFp = distressFingerprint(apn, county, sig.type, "attom");
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: attomEvtErr } = await (sb.from("distress_events") as any).insert({
                  property_id: propertyId,
                  event_type: sig.type,
                  source: "attom",
                  severity: sig.severity,
                  fingerprint: attomFp,
                  raw_data: { detected_from: sig.detectedFrom },
                  confidence: sig.severity >= 7 ? "0.900" : "0.600",
                  status: "active",
                  last_verified_at: now,
                });
                if (attomEvtErr && !isDuplicateError(attomEvtErr)) {
                  console.error(`[Enrich] ATTOM event insert error (${sig.type}):`, attomEvtErr.message);
                }
                signals.push(sig);
              }
            }
          } else {
            console.log(`[Enrich] ATTOM gap-fill failed for ${propertyId}: ${attomGap.error}`);
          }
        }
      }

      // ── Step 2d: Mailing address owner resolution ──────────────
      // If PR has a mailing address different from site address,
      // the mail recipient is likely the owner (or heir/estate rep).
      // Try ATTOM lookup on the mailing address to resolve owner name.
      const prMailAddr = prResult.pr.MailAddress as string | undefined;
      const prMailCity = prResult.pr.MailCity as string | undefined;
      const prMailState = prResult.pr.MailState as string | undefined;
      const prMailZip = prResult.pr.MailZip as string | undefined;
      const siteAddr = prResult.pr.Address as string | undefined;

      // Re-fetch to check if owner was resolved by ATTOM gap-fill
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: postGapProp } = await (sb.from("properties") as any)
        .select("owner_name, owner_flags")
        .eq("id", propertyId)
        .single();
      const stillUnknown = !postGapProp?.owner_name ||
        postGapProp.owner_name === "Unknown" ||
        postGapProp.owner_name === "Unknown Owner";

      if (stillUnknown && prMailAddr && prMailAddr !== siteAddr) {
        console.log(`[Enrich] Mailing address differs (${prMailAddr}) — trying ATTOM lookup on mail address`);
        try {
          const { getPropertyDetailByAddress } = await import("@/lib/attom");
          const mailAddress2 = [prMailCity, prMailState, prMailZip].filter(Boolean).join(", ");
          const mailProp = await getPropertyDetailByAddress(prMailAddr, mailAddress2);

          if (mailProp) {
            const mailOwner = mailProp.assessment?.owner?.owner1?.fullName;
            if (mailOwner) {
              console.log(`[Enrich] Mailing address ATTOM resolved owner: ${mailOwner}`);
              const existingFlags2 = (postGapProp?.owner_flags ?? {}) as Record<string, unknown>;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sb.from("properties") as any).update({
                owner_name: mailOwner,
                owner_flags: {
                  ...existingFlags2,
                  mail_resolved_owner: mailOwner,
                  mail_address: { address: prMailAddr, city: prMailCity, state: prMailState, zip: prMailZip },
                  owner_resolution_method: "mailing_address_attom",
                },
                updated_at: new Date().toISOString(),
              }).eq("id", propertyId);
            }
          }
        } catch (err) {
          console.log(`[Enrich] Mailing address ATTOM lookup failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      // ── Step 2e: County ArcGIS data (free owner + comp sales) ──
      // For Spokane County: query county ArcGIS REST API for free
      // owner name verification and historical comp sales data.
      // This runs AFTER PR + ATTOM, filling gaps they missed.
      const propertyCounty = (property.county ?? "") as string;
      try {
        const { isCountySupported, getCountyData } = await import("@/lib/county-data");
        if (isCountySupported(propertyCounty)) {
          const countyApn = (property.apn ?? "") as string;
          const isCrawlerApn = countyApn.startsWith("CRAWL-") || countyApn.startsWith("TEMP-");
          if (countyApn && !isCrawlerApn) {
            const countyData = await getCountyData(propertyCounty, countyApn);

            // Re-fetch owner status (may have been resolved by earlier steps)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: preCountyProp } = await (sb.from("properties") as any)
              .select("owner_name, estimated_value, owner_flags")
              .eq("id", propertyId)
              .single();

            const countyFlags: Record<string, unknown> = {};
            let countyUpdates: Record<string, unknown> = {};

            // Owner name from county records (free verification / gap-fill)
            if (countyData.owner && countyData.owner.ownerName) {
              const currentOwner = (preCountyProp?.owner_name ?? "").trim();
              const isUnknownOwner = !currentOwner || currentOwner === "Unknown" ||
                currentOwner === "Unknown Owner" || currentOwner === "N/A";

              if (isUnknownOwner) {
                // Gap-fill: county data resolves owner when PR/ATTOM couldn't
                countyUpdates.owner_name = countyData.owner.ownerName;
                countyFlags.owner_resolution_method = "county_arcgis";
                console.log(`[Enrich] County ArcGIS resolved owner: ${countyData.owner.ownerName}`);
              } else {
                // Verification: store county owner for cross-reference
                countyFlags.county_owner_name = countyData.owner.ownerName;
                countyFlags.county_owner_matches = currentOwner.toUpperCase().includes(
                  countyData.owner.ownerName.split(",")[0]?.trim().toUpperCase() ?? ""
                );
              }

              // Address gap-fill from county records
              if (countyData.owner.siteAddress) {
                const currentAddr = (preCountyProp?.address ?? property.address ?? "").trim();
                const isUnknownAddr = !currentAddr || currentAddr === "Unknown" ||
                  !isRealStreetAddress(currentAddr);
                if (isUnknownAddr && isRealStreetAddress(countyData.owner.siteAddress)) {
                  const countyFullAddr = [
                    countyData.owner.siteAddress,
                    countyData.owner.siteState ?? "",
                    countyData.owner.siteZip ?? "",
                  ].filter(Boolean).join(", ");
                  countyUpdates.address = countyFullAddr;
                  countyFlags.address_resolution_method = "county_arcgis";
                  console.log(`[Enrich] County ArcGIS resolved address: ${countyFullAddr}`);
                }
              }

              countyFlags.county_seg_status = countyData.owner.segStatus;
              countyFlags.county_tax_year = countyData.owner.taxYear;
            }

            // Comp sales from county (free ARV validation)
            if (countyData.sales.length > 0) {
              const latestSale = countyData.sales[0];
              countyFlags.county_last_sale_price = latestSale.grossSalePrice;
              countyFlags.county_last_sale_date = latestSale.documentDate;
              countyFlags.county_sale_count = countyData.sales.length;
              countyFlags.county_sales_summary = countyData.sales.slice(0, 5).map(s => ({
                price: s.grossSalePrice,
                date: s.documentDate,
                vacant: s.vacantLandFlag,
              }));

              // If we have no estimated_value, use latest county sale as estimate
              const currentValue = (preCountyProp?.estimated_value ?? 0) as number;
              if (currentValue <= 0 && latestSale.grossSalePrice > 0) {
                countyUpdates.estimated_value = latestSale.grossSalePrice;
                countyFlags.value_source = "county_last_sale";
                console.log(`[Enrich] County sale data filled value: $${latestSale.grossSalePrice.toLocaleString()}`);
              }
            }

            // Persist county data in owner_flags
            if (Object.keys(countyFlags).length > 0) {
              const preFlags = (preCountyProp?.owner_flags ?? {}) as Record<string, unknown>;
              countyUpdates = {
                ...countyUpdates,
                owner_flags: { ...preFlags, county_data: countyFlags, county_data_at: new Date().toISOString() },
                updated_at: new Date().toISOString(),
              };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sb.from("properties") as any).update(countyUpdates).eq("id", propertyId);
              console.log(`[Enrich] County ArcGIS data persisted for ${countyApn}`);
            }
          }
        }
      } catch (err) {
        console.log(`[Enrich] County data lookup skipped: ${err instanceof Error ? err.message : err}`);
      }

      // ── Step 3: MLS re-check ────────────────────────────────────
      const mlsStatus = checkMLSStatus(prResult.pr);
      if (mlsStatus.isListed) {
        console.log(`[Enrich] MLS LISTED: Property ${propertyId} is currently on MLS`);
      }

      // ── Step 4: Deep crawl verification + ownership gate ───────
      const ownerName = prResult.pr.Owner1 ?? prResult.pr.OwnerFullName ?? property.owner_name ?? "";
      const crawlVerify = await runDeepCrawlVerification(sb, propertyId, ownerName, prResult.pr);

      if (crawlVerify.ownershipChanged) {
        console.log(`[Enrich] OWNERSHIP CHANGED for ${propertyId}: ${crawlVerify.note}`);
      }
      if (crawlVerify.verifiedFindings > 0) {
        console.log(`[Enrich] Verified ${crawlVerify.verifiedFindings} crawler findings for ${propertyId}`);
      }

      // Update owner_flags with quality gate results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingFlags = ((await (sb.from("properties") as any).select("owner_flags").eq("id", propertyId).single()).data?.owner_flags ?? {}) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("properties") as any).update({
        owner_flags: {
          ...existingFlags,
          mls_listed: mlsStatus.isListed,
          ...(mlsStatus.detectedAt ? { mls_detected_at: mlsStatus.detectedAt } : {}),
          ownership_verified: !crawlVerify.ownershipChanged,
          ...(crawlVerify.ownershipChanged ? { ownership_change_note: crawlVerify.note } : {}),
          deep_crawl_verified_at: new Date().toISOString(),
          deep_crawl_verified_count: crawlVerify.verifiedFindings,
        },
        updated_at: new Date().toISOString(),
      }).eq("id", propertyId);

      // ── Step 5: Full scoring pipeline ──────────────────────────
      const score = await runScoringPipeline(sb, propertyId, property, prResult.pr, signals);

      // ── Step 6: Skip-trace deferred to manual agent action ───────
      // Auto skip-trace disabled to conserve BatchData/PR credits.
      // Agents trigger skip-trace manually via "Enrich" button in prospect folder.
      console.log(`[Enrich] Skip-trace deferred to manual agent action for ${propertyId} (score ${score.blended})`);

      // ── Step 7: Finalize lead (score + tag → auto-promote) ─────
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

    // ── PropertyRadar failed — aggressive fallback chain ────────
    // Order: County ArcGIS (FREE) → ATTOM (paid) → existing DB signals
    // The philosophy: exhaust every source before giving up.
    console.log(`[Enrich] PropertyRadar lookup failed for ${propertyId}: ${prResult.error}`);

    // ── Fallback Step A: County ArcGIS (FREE — try first) ──────
    // If property has a real APN in a supported county, county records
    // can resolve owner name + address that PR/ATTOM need.
    const propertyCountyFB = (property.county ?? "") as string;
    let countyFilled = false;
    try {
      const { isCountySupported, getCountyData } = await import("@/lib/county-data");
      if (isCountySupported(propertyCountyFB)) {
        const countyApnFB = (property.apn ?? "") as string;
        const isCrawlerApnFB = countyApnFB.startsWith("CRAWL-") || countyApnFB.startsWith("TEMP-");
        if (countyApnFB && !isCrawlerApnFB) {
          console.log(`[Enrich] Trying county ArcGIS fallback for APN ${countyApnFB}`);
          const countyData = await getCountyData(propertyCountyFB, countyApnFB);

          const countyFlagsFB: Record<string, unknown> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let countyUpdatesFB: Record<string, any> = {};

          // Owner name from county (free gap-fill)
          if (countyData.owner && countyData.owner.ownerName) {
            const currentOwner = (property.owner_name ?? "").trim();
            const isUnknownOwner = !currentOwner || currentOwner === "Unknown" ||
              currentOwner === "Unknown Owner" || currentOwner === "N/A";

            if (isUnknownOwner) {
              countyUpdatesFB.owner_name = countyData.owner.ownerName;
              countyFlagsFB.owner_resolution_method = "county_arcgis_fallback";
              countyFilled = true;
              console.log(`[Enrich] County ArcGIS fallback resolved owner: ${countyData.owner.ownerName}`);
            }

            // Site address from county records (gap-fill for Unknown addresses)
            if (countyData.owner.siteAddress) {
              const currentAddr = (property.address ?? "").trim();
              const isUnknownAddr = !currentAddr || currentAddr === "Unknown" ||
                !isRealStreetAddress(currentAddr);
              if (isUnknownAddr) {
                // Build full address from county fields
                const countyFullAddr = [
                  countyData.owner.siteAddress,
                  countyData.owner.siteState ? `${countyData.owner.siteState}` : "",
                  countyData.owner.siteZip ?? "",
                ].filter(Boolean).join(", ");
                if (isRealStreetAddress(countyData.owner.siteAddress)) {
                  countyUpdatesFB.address = countyFullAddr;
                  countyFlagsFB.address_resolution_method = "county_arcgis_fallback";
                  countyFilled = true;
                  console.log(`[Enrich] County ArcGIS fallback resolved address: ${countyFullAddr}`);
                }
              }
            }

            countyFlagsFB.county_seg_status = countyData.owner.segStatus;
            countyFlagsFB.county_tax_year = countyData.owner.taxYear;
          }

          // Comp sales for value gap-fill
          if (countyData.sales.length > 0) {
            const latestSale = countyData.sales[0];
            countyFlagsFB.county_last_sale_price = latestSale.grossSalePrice;
            countyFlagsFB.county_last_sale_date = latestSale.documentDate;
            countyFlagsFB.county_sale_count = countyData.sales.length;
            countyFlagsFB.county_sales_summary = countyData.sales.slice(0, 5).map(s => ({
              price: s.grossSalePrice,
              date: s.documentDate,
              vacant: s.vacantLandFlag,
            }));

            const currentValue = (property.estimated_value ?? 0) as number;
            if (currentValue <= 0 && latestSale.grossSalePrice > 0) {
              countyUpdatesFB.estimated_value = latestSale.grossSalePrice;
              countyFlagsFB.value_source = "county_last_sale_fallback";
              countyFilled = true;
              console.log(`[Enrich] County fallback filled value: $${latestSale.grossSalePrice.toLocaleString()}`);
            }
          }

          // Persist county data
          if (Object.keys(countyFlagsFB).length > 0) {
            const preFlagsFB = (property.owner_flags ?? {}) as Record<string, unknown>;
            countyUpdatesFB = {
              ...countyUpdatesFB,
              owner_flags: { ...preFlagsFB, county_data: countyFlagsFB, county_data_at: new Date().toISOString() },
              updated_at: new Date().toISOString(),
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("properties") as any).update(countyUpdatesFB).eq("id", propertyId);
            console.log(`[Enrich] County ArcGIS fallback data persisted for ${countyApnFB}`);
          }
        }
      }
    } catch (err) {
      console.log(`[Enrich] County fallback skipped: ${err instanceof Error ? err.message : err}`);
    }

    // ── Fallback Step A.2: Detect signals from existing property data ──
    // County fills names/addresses but doesn't detect distress. However, we
    // can infer distress from data already in the DB (mailing address mismatch,
    // long ownership, tax flags, etc.).
    const inferredSignals: DetectedSignal[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propForSignals = countyFilled
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? ((await (sb.from("properties") as any).select("*").eq("id", propertyId).single()).data ?? property)
        : property;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flagsForSignals = (propForSignals.owner_flags ?? {}) as Record<string, any>;

      // Absentee: mailing address differs from site address
      const siteAddr = ((propForSignals.address ?? "") as string).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
      const mailRaw = flagsForSignals.mailing_address;
      const mailAddr = (typeof mailRaw === "string" ? mailRaw : typeof mailRaw === "object" && mailRaw?.address ? String(mailRaw.address) : "")
        .toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
      if (siteAddr && mailAddr && siteAddr !== mailAddr) {
        inferredSignals.push({ type: "absentee" as DistressType, severity: 5, daysSinceEvent: 90, detectedFrom: "data_inference" });
      }

      // Absentee: county has zero homeowner exemption in a county that offers it
      const countyDataFlags = flagsForSignals.county_data as Record<string, unknown> | undefined;
      if (countyDataFlags && typeof countyDataFlags.county_seg_status === "string") {
        // Some seg statuses indicate issues (e.g., "Inactive", "Exempt")
        const seg = (countyDataFlags.county_seg_status as string).toLowerCase();
        if (seg.includes("inactive") || seg.includes("exempt")) {
          console.log(`[Enrich] County seg_status "${countyDataFlags.county_seg_status}" noted for ${propertyId}`);
        }
      }

      // Long ownership → potential tired landlord (only if multi-unit or absentee)
      const lastSaleDate = flagsForSignals.last_sale_date as string | undefined ??
        (countyDataFlags?.county_last_sale_date as string | undefined);
      if (lastSaleDate) {
        const yearsSinceSale = (Date.now() - new Date(lastSaleDate).getTime()) / (365.25 * 86400000);
        if (yearsSinceSale >= 15 && inferredSignals.some(s => s.type === "absentee")) {
          inferredSignals.push({ type: "tired_landlord" as DistressType, severity: 5, daysSinceEvent: 30, detectedFrom: "data_inference" });
        }
      }

      // Persist inferred signals to distress_events
      for (const sig of inferredSignals) {
        const fp = distressFingerprint(
          (propForSignals.apn ?? "") as string,
          (propForSignals.county ?? "") as string,
          sig.type,
          "data_inference"
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: sigErr } = await (sb.from("distress_events") as any).insert({
          property_id: propertyId,
          lead_id: leadId ?? null,
          event_type: sig.type,
          source: "data_inference",
          status: "unknown",
          severity: sig.severity,
          fingerprint: fp,
          confidence: "0.600",
          raw_data: { detected_from: "data_inference", method: sig.type === "absentee" ? "mailing_mismatch" : "long_ownership" },
        });
        if (sigErr && !isDuplicateError(sigErr)) {
          console.error(`[Enrich] Inferred signal insert error (${sig.type}):`, sigErr.message);
        }
      }
      if (inferredSignals.length > 0) {
        console.log(`[Enrich] Detected ${inferredSignals.length} signals from existing data for ${propertyId}: ${inferredSignals.map(s => s.type).join(", ")}`);
      }
    } catch (err) {
      console.log(`[Enrich] Inferred signal detection error: ${err instanceof Error ? err.message : err}`);
    }

    // ── Fallback Step B: ATTOM (with potentially county-updated data) ──
    // Re-fetch property if county filled gaps — ATTOM needs updated address
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attomProperty = countyFilled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((await (sb.from("properties") as any).select("*").eq("id", propertyId).single()).data ?? property)
      : property;

    const attomResult = await enrichFromAttom(sb, propertyId, attomProperty);

    if (attomResult.success) {
      const signals = [...(attomResult.signals ?? []), ...inferredSignals];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freshForScore = (await (sb.from("properties") as any).select("*").eq("id", propertyId).single()).data ?? attomProperty;
      const score = await runScoringPipelineFromFlags(sb, propertyId, freshForScore, signals);

      console.log(`[Enrich] Skip-trace deferred to manual agent action for ${propertyId} (ATTOM path, score ${score.blended})`);

      await finalizeEnrichment(sb, leadId, propertyId, score.blended, signals, countyFilled ? "county+attom" : "attom", attempts);

      return {
        propertyId, leadId, success: true,
        enrichmentSource: "attom",
        score: score.blended,
        label: getScoreLabel(score.blended),
        signalsDetected: signals.length,
        elapsed_ms: Date.now() - startTime,
      };
    }

    // ── Fallback Step C: County-only path ─────────────────────────
    // Both PR and ATTOM failed, but county may have given us enough data.
    // Check if we now have owner + address + existing DB signals + inferred signals.
    console.log(`[Enrich] ATTOM fallback also failed for ${propertyId}: ${attomResult.error}`);

    // Query existing distress events from crawlers/imports/inferred (they count as verified)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingSignals } = await (sb.from("distress_events") as any)
      .select("event_type, severity, created_at, source")
      .eq("property_id", propertyId)
      .in("status", ["active", "unknown"])
      .order("severity", { ascending: false })
      .limit(20);

    const dbSignals: DetectedSignal[] = (existingSignals ?? []).map((e: { event_type: string; severity: number; created_at: string }) => ({
      type: e.event_type as DistressType,
      severity: e.severity,
      daysSinceEvent: Math.max(1, Math.round((Date.now() - new Date(e.created_at).getTime()) / 86400000)),
      detectedFrom: "existing_db",
    }));

    if (countyFilled && dbSignals.length > 0) {
      // County gave us data AND we have existing signals — try to finalize!
      console.log(`[Enrich] County-only path: ${dbSignals.length} existing signals found — attempting to score and finalize`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freshForCountyScore = (await (sb.from("properties") as any).select("*").eq("id", propertyId).single()).data ?? attomProperty;
      const score = await runScoringPipelineFromFlags(sb, propertyId, freshForCountyScore, dbSignals);
      await finalizeEnrichment(sb, leadId, propertyId, score.blended, dbSignals, "county_only", attempts);

      return {
        propertyId, leadId, success: true,
        enrichmentSource: "partial" as const,
        score: score.blended,
        label: getScoreLabel(score.blended),
        signalsDetected: dbSignals.length,
        elapsed_ms: Date.now() - startTime,
      };
    }

    // Track attempt in owner_flags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update({
      owner_flags: {
        ...ownerFlags,
        enrichment_pending: true,
        enrichment_attempts: attempts,
        enrichment_last_attempt: new Date().toISOString(),
        enrichment_status: countyFilled ? "county_partial" : "failed",
        ...(countyFilled ? { county_fallback_used: true } : {}),
      },
      updated_at: new Date().toISOString(),
    }).eq("id", propertyId);

    // Safety net: after MAX_ATTEMPTS, finalize with whatever we have
    if (attempts >= MAX_ATTEMPTS) {
      console.log(`[Enrich] Max attempts (${MAX_ATTEMPTS}) reached for ${propertyId} — finalizing with partial data (${dbSignals.length} DB signals)`);
      await finalizeEnrichment(sb, leadId, propertyId, lead.priority ?? 30, dbSignals, "partial", attempts);

      return {
        propertyId, leadId, success: false,
        enrichmentSource: "partial",
        score: lead.priority ?? 30,
        label: getScoreLabel(lead.priority ?? 30),
        signalsDetected: dbSignals.length,
        error: `Failed after ${MAX_ATTEMPTS} attempts — finalized with partial data (${dbSignals.length} DB signals)`,
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

  const isCrawlerRecord = property.apn?.startsWith("CRAWL-");
  const hasPlaceholderAddress = !isRealStreetAddress(address);

  // ── Obituary / Crawler records: deceased owner search ──────────
  // When the record came from a crawler (CRAWL-* APN) and has no real
  // street address, try to find the property by searching PropertyRadar
  // for deceased properties in the same county and matching by owner name.
  if (isCrawlerRecord && hasPlaceholderAddress) {
    const ownerName = property.owner_name ?? "";
    const county = property.county ?? "";
    const st = property.state ?? "WA";

    if (!ownerName || ownerName === "Unknown") {
      return { success: false, error: "Crawler record has no owner name for deceased search" };
    }

    console.log(`[Enrich] Crawler record detected (${property.apn}) — routing to deceased owner search for "${ownerName}" in ${county}`);

    const deceasedResult = await enrichByDeceasedSearch(apiKey, sb, propertyId, ownerName, county, st);

    if (deceasedResult.success && deceasedResult.pr) {
      // Store match confidence and extract next-of-kin from obituary snippet
      const flags = (property.owner_flags ?? {}) as Record<string, unknown>;
      const snippet = (flags.snippet as string) ?? "";
      const nextOfKin = extractNextOfKin(snippet);

      // Extract mailing address from PR match (heir mailing address)
      const pr = deceasedResult.pr;
      const mailAddress = pr.MailAddress ? {
        address: pr.MailAddress,
        city: pr.MailCity ?? "",
        state: pr.MailState ?? "",
        zip: pr.MailZip ?? "",
      } : null;

      // Persist obituary-specific enrichment data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentFlags = ((await (sb.from("properties") as any).select("owner_flags").eq("id", propertyId).single())?.data?.owner_flags ?? {}) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("properties") as any).update({
        owner_flags: {
          ...currentFlags,
          obit_match_confidence: deceasedResult.matchConfidence,
          obit_match_method: "deceased_county_search",
          obit_next_of_kin: nextOfKin.length > 0 ? nextOfKin : undefined,
          obit_mail_address: mailAddress,
          obit_matched_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq("id", propertyId);

      console.log(`[Enrich] Obituary enrichment complete for "${ownerName}": confidence=${deceasedResult.matchConfidence?.toFixed(2)}, kin=${nextOfKin.length}, mail=${mailAddress ? "yes" : "no"}`);
    }

    return deceasedResult;
  }

  if (!address || address === "Unknown" || address.startsWith("APN ")) {
    // If no address, try APN lookup
    if (property.apn && !property.apn.startsWith("MANUAL-") && !property.apn.startsWith("CSV-") && !isCrawlerRecord) {
      return enrichByAPN(apiKey, sb, propertyId, property.apn, property.county, property);
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
      // Address not found — fall back to APN if available
      const hasRealAPN = property.apn && !property.apn.startsWith("MANUAL-") && !property.apn.startsWith("CSV-") && !isCrawlerRecord;
      if (hasRealAPN) {
        console.log(`[Enrich] PR address miss — falling back to APN ${property.apn}`);
        return enrichByAPN(apiKey, sb, propertyId, property.apn, property.county, property);
      }
      return { success: false, error: "No property found in PropertyRadar" };
    }

    // Address found but sparse — try APN supplement if owner is missing
    const hasOwner = pr.Owner || pr.Taxpayer;
    const hasRealAPN = property.apn && !property.apn.startsWith("MANUAL-") && !property.apn.startsWith("CSV-") && !isCrawlerRecord;
    if (!hasOwner && hasRealAPN) {
      console.log(`[Enrich] PR address match has no owner — trying APN supplement for ${property.apn}`);
      const apnResult = await enrichByAPN(apiKey, sb, propertyId, property.apn, property.county, property);
      if (apnResult.success && apnResult.pr) {
        const apnOwner = apnResult.pr.Owner ?? apnResult.pr.Taxpayer;
        if (apnOwner) {
          console.log(`[Enrich] APN lookup found owner: ${apnOwner}`);
          return apnResult; // Use the richer APN result
        }
      }
      // APN didn't help either — fall through to use the original address result
      console.log(`[Enrich] APN supplement also has no owner — using address result`);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingProperty?: Record<string, any>,
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

    await updatePropertyFromPR(sb, propertyId, pr, existingProperty ?? {});
    return { success: true, pr };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Obituary Property Resolution (Deceased Owner Search) ─────────────

/**
 * Normalize a name for fuzzy matching: lowercase, strip suffixes, collapse whitespace.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|esq|md|phd|dr|mr|mrs|ms|miss)\b\.?/gi, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how well two names match. Returns 0–1.
 * 1.0 = exact match, 0.85+ = last name match + partial first, etc.
 */
function nameMatchScore(crawledName: string, prOwner: string): number {
  const a = normalizeName(crawledName);
  const b = normalizeName(prOwner);

  if (!a || !b) return 0;
  if (a === b) return 1.0;

  const aParts = a.split(" ");
  const bParts = b.split(" ");

  // Last names must match
  const aLast = aParts[aParts.length - 1];
  const bLast = bParts[bParts.length - 1];
  if (aLast !== bLast) return 0;

  // Last name matches — check first name
  const aFirst = aParts[0] ?? "";
  const bFirst = bParts[0] ?? "";

  if (aFirst === bFirst) return 0.95; // Full name match (minor formatting diff)
  if (aFirst && bFirst && (aFirst.startsWith(bFirst) || bFirst.startsWith(aFirst))) return 0.85; // Partial first name
  if (aFirst && bFirst && aFirst[0] === bFirst[0]) return 0.70; // Same initial

  // Only last name matches
  return 0.50;
}

/**
 * Check if an address is a real street address (has a street number).
 * Returns false for placeholders like "Spokane, WA" or "County — pending enrichment".
 */
function isRealStreetAddress(addr: string): boolean {
  if (!addr || addr.length < 8) return false;
  // Must start with a digit (street number) — e.g. "1234 N Main St"
  if (!/^\d/.test(addr.trim())) return false;
  // Must not contain "pending" placeholder text
  if (/pending\s+enrichment/i.test(addr)) return false;
  return true;
}

/**
 * Search PropertyRadar for recently deceased properties in a county,
 * then fuzzy-match the deceased person's name against Owner fields.
 *
 * This is the "army" that goes looking for obituary-sourced properties.
 * Returns the best match with a confidence score.
 */
async function enrichByDeceasedSearch(
  apiKey: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  propertyId: string,
  ownerName: string,
  county: string,
  state: string,
): Promise<PREnrichResult & { matchConfidence?: number }> {
  // Resolve county to FIPS code
  const normalizedCounty = county.charAt(0).toUpperCase() + county.slice(1).toLowerCase();
  const fips = COUNTY_FIPS[normalizedCounty] ?? COUNTY_FIPS[county];
  if (!fips) {
    return { success: false, error: `No FIPS mapping for county "${county}" — cannot search deceased` };
  }

  console.log(`[Enrich/ObitSearch] Searching deceased properties in ${county} (FIPS ${fips}) for "${ownerName}"`);

  try {
    // Pull recent deceased properties from this county
    const criteria = [
      { name: "isDeceasedProperty", value: [1] },
      { name: "County", value: [fips] },
    ];

    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=50&Fields=All`;
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
      return { success: false, error: `PropertyRadar deceased search HTTP ${prResponse.status}` };
    }

    const prData = await prResponse.json();
    const results = prData.results ?? [];

    if (results.length === 0) {
      return { success: false, error: `No deceased properties found in ${county}` };
    }

    console.log(`[Enrich/ObitSearch] Got ${results.length} deceased properties in ${county}, matching against "${ownerName}"`);

    // Score each result against the deceased person's name
    let bestMatch: { pr: Record<string, unknown>; score: number } | null = null;

    for (const pr of results) {
      const prOwner = (pr.Owner ?? pr.Taxpayer ?? "") as string;
      const prOwner2 = (pr.Owner2 ?? "") as string;

      const score1 = nameMatchScore(ownerName, prOwner);
      const score2 = prOwner2 ? nameMatchScore(ownerName, prOwner2) : 0;
      const bestScore = Math.max(score1, score2);

      if (bestScore > (bestMatch?.score ?? 0)) {
        bestMatch = { pr, score: bestScore };
      }
    }

    if (!bestMatch || bestMatch.score < 0.70) {
      console.log(`[Enrich/ObitSearch] No confident match for "${ownerName}" in ${county} (best score: ${bestMatch?.score?.toFixed(2) ?? "none"})`);
      return { success: false, error: `No confident owner name match (best: ${bestMatch?.score?.toFixed(2) ?? "0"})` };
    }

    const matchedPr = bestMatch.pr;
    const matchedOwner = (matchedPr.Owner ?? matchedPr.Taxpayer ?? "unknown") as string;
    console.log(`[Enrich/ObitSearch] MATCHED "${ownerName}" → "${matchedOwner}" (confidence: ${bestMatch.score.toFixed(2)}, RadarID: ${matchedPr.RadarID})`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updatePropertyFromPR(sb, propertyId, matchedPr as any, {} as any);

    return { success: true, pr: matchedPr, matchConfidence: bestMatch.score };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Extract next-of-kin names from obituary text snippet.
 * Parses "survived by" sections for family members.
 */
function extractNextOfKin(snippet: string): { name: string; relationship: string }[] {
  if (!snippet) return [];

  const kin: { name: string; relationship: string }[] = [];

  // Find "survived by" section — this is where living relatives are listed
  const survivedMatch = snippet.match(/survived\s+by\s+([\s\S]*?)(?:\.|preceded|memorial|service|born|was a|in lieu|$)/i);
  if (!survivedMatch) return kin;

  const survivedText = survivedMatch[1];

  // Relationship patterns — extract "relationship Name" pairs
  const relPatterns: { re: RegExp; rel: string }[] = [
    { re: /\b(?:his|her)\s+(?:beloved\s+)?wife\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "spouse" },
    { re: /\b(?:his|her)\s+(?:beloved\s+)?husband\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "spouse" },
    { re: /\bspouse\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "spouse" },
    { re: /\bson(?:s)?\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "child" },
    { re: /\bdaughter(?:s)?\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "child" },
    { re: /\bchildren?\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "child" },
    { re: /\bbrother(?:s)?\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "sibling" },
    { re: /\bsister(?:s)?\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/gi, rel: "sibling" },
  ];

  for (const { re, rel } of relPatterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(survivedText)) !== null) {
      const name = match[1].trim();
      // Skip common false positives
      if (name.length > 2 && !/^(and|the|his|her|of|in|at|on)$/i.test(name)) {
        // Avoid duplicates
        if (!kin.some((k) => k.name === name)) {
          kin.push({ name, relationship: rel });
        }
      }
    }
  }

  return kin;
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

  // ── Extract photos from PR response (zero additional cost) ──────────
  const existingPhotos = Array.isArray(existingFlags.photos) ? existingFlags.photos : [];
  // Re-extract if fewer than 3 photos (old enrichments only had 1 Street View)
  if (existingPhotos.length < 3) {
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractedPhotos: { url: string; source: string; capturedAt: string }[] = [];

    // PR photo arrays
    const prPhotos = pr.Photos || pr.photos;
    if (Array.isArray(prPhotos)) {
      for (const url of prPhotos) {
        if (typeof url === "string" && url.startsWith("http")) {
          extractedPhotos.push({ url, source: "assessor", capturedAt: now });
        }
      }
    }

    // Single property image URL
    if (typeof pr.PropertyImageUrl === "string" && pr.PropertyImageUrl.startsWith("http")) {
      extractedPhotos.push({ url: pr.PropertyImageUrl, source: "assessor", capturedAt: now });
    }

    // Multi-angle Street View from coordinates (proxy URL — no key exposed)
    const lat = toNumber(pr.Latitude);
    const lng = toNumber(pr.Longitude);
    if (lat && lng) {
      // 4 cardinal headings for full property coverage
      for (const heading of ["0", "90", "180", "270"]) {
        extractedPhotos.push({
          url: `/api/street-view?lat=${lat}&lng=${lng}&size=800x400&heading=${heading}`,
          source: "google_street_view",
          capturedAt: now,
        });
      }
      // Satellite / aerial view
      extractedPhotos.push({
        url: `/api/street-view?lat=${lat}&lng=${lng}&size=800x400&type=satellite&zoom=19`,
        source: "satellite",
        capturedAt: now,
      });
    }

    if (extractedPhotos.length > 0) {
      ownerFlags.photos = extractedPhotos;
      ownerFlags.photos_fetched_at = now;
    }
  }

  // Persist mailing address if different from site address (confirms absentee owner)
  if (pr.MailAddress && pr.MailAddress !== pr.Address) {
    ownerFlags.mailing_address = {
      address: pr.MailAddress,
      city: pr.MailCity ?? "",
      state: pr.MailState ?? "",
      zip: pr.MailZip ?? "",
    };
    ownerFlags.is_absentee_confirmed = true;
  }

  if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
  if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
  if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
  if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
  if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

  const estimatedValue = toNumber(pr.AVM);
  const equityPercent = toNumber(pr.EquityPercent);
  const assessedValue = toNumber(pr.AssessedValue);
  if (assessedValue != null) ownerFlags.tax_assessed_value = Math.round(assessedValue);

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
    // Extract mailing address from owner_flags if available
    const flags = (property.owner_flags ?? {}) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prRaw = flags.pr_raw as Record<string, any> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const persons = (flags.persons ?? []) as any[];
    const primaryPerson = persons.find((p: { is_primary?: boolean }) => p.is_primary) ?? persons[0];
    const rawMailAddr = primaryPerson?.mailing_address as string | undefined;

    let mailingAddress: string | undefined;
    let mailingCity: string | undefined;
    let mailingState: string | undefined;
    let mailingZip: string | undefined;

    if (prRaw?.MailAddress) {
      mailingAddress = prRaw.MailAddress;
      mailingCity = prRaw.MailCity;
      mailingState = prRaw.MailState;
      mailingZip = prRaw.MailZip;
    } else if (rawMailAddr) {
      const mailParts = rawMailAddr.split(",").map((s: string) => s.trim());
      mailingAddress = mailParts[0];
      mailingCity = mailParts[1];
      const stateZip = mailParts[2]?.match(/([A-Z]{2})\s*(\d{5})?/);
      mailingState = stateZip?.[1];
      mailingZip = stateZip?.[2];
    }

    const result = await dualSkipTrace(
      {
        id: propertyId,
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        owner_name: property.owner_name,
        mailingAddress,
        mailingCity,
        mailingState,
        mailingZip,
      },
      radarId,
    );

    // Read current flags, merge skip-trace data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: currentProp } = await (sb.from("properties") as any)
      .select("owner_flags").eq("id", propertyId).single();
    const existingFlags = (currentProp?.owner_flags ?? {}) as Record<string, unknown>;

    if (result.totalPhoneCount === 0 && result.totalEmailCount === 0) {
      console.log(`[Enrich] Dual skip-trace returned no contacts for ${propertyId}`);
      // Still mark as attempted so we don't re-try and badge shows correct state
      await (sb.from("properties") as any).update({
        owner_flags: { ...existingFlags, skip_traced: true, skip_trace_attempted_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq("id", propertyId);
      return result;
    }

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
  const hasRealAddress = address && address !== "Unknown" && isRealStreetAddress(address);

  try {
    // Dynamic import to avoid issues if attom module isn't fully configured
    const { getPropertyDetailByAddress, getPropertyDetailByAPN } = await import("@/lib/attom");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prop: any = null;

    // Try address-based lookup first
    if (hasRealAddress) {
      // ATTOM expects address1 (street) and address2 (city, state, zip)
      const parts = address.split(",").map((s: string) => s.trim());
      const address1 = parts[0] ?? address;
      const address2 = parts.slice(1).join(", ") || `${property.city ?? ""} ${property.state ?? ""} ${property.zip ?? ""}`.trim();
      const detail = await getPropertyDetailByAddress(address1, address2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prop = (detail as any)?.property?.[0] ?? detail;
    }

    // If address lookup failed/unavailable, try APN-based lookup
    if (!prop && property.apn && !property.apn.startsWith("CRAWL-") && !property.apn.startsWith("TEMP-") && !property.apn.startsWith("MANUAL-") && !property.apn.startsWith("CSV-")) {
      const fips = COUNTY_FIPS[normalizeCounty(property.county ?? "", "Unknown")] ?? "";
      if (fips) {
        console.log(`[Enrich] ATTOM address lookup ${hasRealAddress ? "failed" : "skipped (no address)"} — trying APN ${property.apn} (FIPS ${fips})`);
        const apnDetail = await getPropertyDetailByAPN(property.apn, fips);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prop = apnDetail as any;
      }
    }

    if (!prop && !hasRealAddress) {
      return { success: false, error: "No address or valid APN for ATTOM lookup" };
    }

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
    if (attomOwner && (!property.owner_name || property.owner_name === "Unknown" || property.owner_name === "Unknown Owner" || property.owner_name === "N/A")) {
      update.owner_name = attomOwner;
    }

    // Address gap-fill from ATTOM when current address is Unknown
    const attomAddr = prop.address?.oneLine ?? prop.address?.line1;
    if (attomAddr && (!hasRealAddress)) {
      update.address = attomAddr;
      if (prop.address?.locality) update.city = prop.address.locality;
      if (prop.address?.countrySubd) update.state = prop.address.countrySubd;
      if (prop.address?.postal1) update.zip = prop.address.postal1;
      console.log(`[Enrich] ATTOM resolved address: ${attomAddr}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("properties") as any).update(update).eq("id", propertyId);

    // Detect signals from ATTOM data using the full detection function
    const { detectAttomDistressSignals } = await import("@/lib/attom");
    const attomSignals = detectAttomDistressSignals(prop);
    const signals: DetectedSignal[] = attomSignals.map(s => ({
      type: s.type as DistressType,
      severity: s.severity,
      daysSinceEvent: 60,
      detectedFrom: s.source,
    }));
    // Also check assessed/AVM ratio for tax stress (not in detectAttomDistressSignals)
    if (assessed && avm && (assessed / avm) > 1.5) {
      signals.push({ type: "tax_lien" as DistressType, severity: 5, daysSinceEvent: 90, detectedFrom: "attom_tax_inference" });
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
  // ── Signal Accumulation ─────────────────────────────────────────────
  // Query ALL active distress_events for this property (not just current enrichment)
  // so signals from multiple PR list imports stack correctly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allEvents } = await (sb.from("distress_events") as any)
    .select("event_type, severity, created_at, status")
    .eq("property_id", propertyId)
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(50);

  // Merge current enrichment signals with all DB signals, deduplicate by type (keep highest severity)
  const signalMap = new Map<string, { type: string; severity: number; daysSinceEvent: number }>();

  // Add current enrichment signals first
  for (const s of signals) {
    const existing = signalMap.get(s.type);
    if (!existing || s.severity > existing.severity) {
      signalMap.set(s.type, { type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent });
    }
  }

  // Add accumulated DB signals (fill gaps from other imports)
  if (allEvents) {
    for (const e of allEvents as { event_type: string; severity: number; created_at: string }[]) {
      const daysSince = Math.max(1, Math.round((Date.now() - new Date(e.created_at).getTime()) / 86400000));
      const existing = signalMap.get(e.event_type);
      if (!existing || e.severity > existing.severity) {
        signalMap.set(e.event_type, { type: e.event_type, severity: e.severity, daysSinceEvent: daysSince });
      }
    }
  }

  const accumulatedSignals = Array.from(signalMap.values()) as { type: DistressType; severity: number; daysSinceEvent: number }[];
  if (accumulatedSignals.length > signals.length) {
    console.log(`[Scoring] Signal accumulation: ${signals.length} current + ${accumulatedSignals.length - signals.length} from DB = ${accumulatedSignals.length} total for property ${propertyId}`);
  }

  // Deterministic scoring
  const equityPct = toNumber(pr.EquityPercent) ?? 50;
  const avm = toNumber(pr.AVM) ?? 0;
  const loanBal = toNumber(pr.TotalLoanBalance) ?? 0;
  const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

  const scoringInput: ScoringInput = {
    signals: accumulatedSignals,
    ownerFlags: {
      absentee: isTruthy(pr.isNotSameMailingOrExempt),
      corporate: false,
      inherited: isTruthy(pr.isDeceasedProperty),
      elderly: false,
      outOfState: isTruthy(pr.isNotSameMailingOrExempt),
    },
    equityPercent: equityPct,
    compRatio: Math.min(compRatio, 3.0),
    historicalConversionRate: 0,
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
  // ── Signal Accumulation (same as runScoringPipeline) ────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allEventsFF } = await (sb.from("distress_events") as any)
    .select("event_type, severity, created_at, status")
    .eq("property_id", propertyId)
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(50);

  const signalMapFF = new Map<string, { type: string; severity: number; daysSinceEvent: number }>();
  for (const s of signals) {
    const existing = signalMapFF.get(s.type);
    if (!existing || s.severity > existing.severity) {
      signalMapFF.set(s.type, { type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent });
    }
  }
  if (allEventsFF) {
    for (const e of allEventsFF as { event_type: string; severity: number; created_at: string }[]) {
      const daysSince = Math.max(1, Math.round((Date.now() - new Date(e.created_at).getTime()) / 86400000));
      const existing = signalMapFF.get(e.event_type);
      if (!existing || e.severity > existing.severity) {
        signalMapFF.set(e.event_type, { type: e.event_type, severity: e.severity, daysSinceEvent: daysSince });
      }
    }
  }
  const accumulatedSignalsFF = Array.from(signalMapFF.values()) as { type: DistressType; severity: number; daysSinceEvent: number }[];

  const equityPct = toNumber(property.equity_percent) ?? 50;

  const scoringInput: ScoringInput = {
    signals: accumulatedSignalsFF,
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
    isUnderwater: false,
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

// ── Finalize Lead (score + tag → promote if sufficient data) ─────────
// Uses the tested gate from src/lib/enrichment-gate.ts
// See src/lib/__tests__/enrichment-gate.test.ts for the business rules.

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

  // ── Fetch property data for sufficiency check ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prop } = await (sb.from("properties") as any)
    .select("owner_name, estimated_value, address, owner_flags")
    .eq("id", propertyId)
    .single();

  // Extract mailing address from owner_flags (set by enrichment pipeline)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerFlags = (prop?.owner_flags ?? {}) as Record<string, any>;
  const mailingAddr = ownerFlags.mailing_address;
  const mailingStr = typeof mailingAddr === "string"
    ? mailingAddr
    : typeof mailingAddr === "object" && mailingAddr !== null
      ? [mailingAddr.address, mailingAddr.city, mailingAddr.state, mailingAddr.zip].filter(Boolean).join(", ")
      : "";

  // All signals from the enrichment pipeline are verified (PR flags, county records, ATTOM data)
  // They come from detectDistressSignals() which checks actual data source flags
  const hasVerifiedSignal = signals.length > 0;

  // ── Run the tested sufficiency gate ──
  const gate = checkDataSufficiency({
    ownerName: prop?.owner_name ?? null,
    address: prop?.address ?? null,
    mailingAddress: mailingStr || null,
    estimatedValue: prop?.estimated_value ?? null,
    signalCount: signals.length,
    hasVerifiedSignal,
  });

  const finalStatus = gate.isSufficient ? "prospect" : "staging";

  const statusNote = gate.isSufficient
    ? `[auto-promoted]`
    : `[kept in staging — missing: ${gate.missingFields.join(", ")}]`;
  const warningNote = gate.warnings.length > 0
    ? ` (soft warnings: ${gate.warnings.join(", ")})`
    : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("leads") as any)
    .update({
      priority: blendedScore,
      status: finalStatus,
      tags: [scoreLabelTag, ...signalTags],
      notes: `Enriched [${source}] — Heat ${blendedScore} (${label}). ${signals.length} signal(s). Attempts: ${attempts} ${statusNote}${warningNote}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: gate.isSufficient ? "enrichment.auto_promoted" : "enrichment.kept_staging",
    entity_type: "lead",
    entity_id: leadId,
    details: {
      property_id: propertyId,
      source,
      blended_score: blendedScore,
      label,
      signals: signals.length,
      attempts,
      status: finalStatus,
      ...(gate.missingFields.length > 0 ? { missing_fields: gate.missingFields } : {}),
      ...(gate.warnings.length > 0 ? { soft_warnings: gate.warnings } : {}),
    },
  });

  console.log(`[Enrich] Lead ${leadId} enriched → ${finalStatus}: score ${blendedScore} (${label}), source: ${source} ${statusNote}${warningNote}`);
}

// ── Promote Leads from Staging → Prospect (admin pull) ───────────────

export interface PromoteFilter {
  tier?: "platinum" | "gold" | "silver" | "bronze" | "all";
  minScore?: number;
  maxScore?: number;
  limit?: number;
  /** If set, only promote leads that have ALL of these tags (e.g. ["probate", "tax_lien"]) */
  requiredTags?: string[];
  /** If set, only promote leads that have at least ONE of these tags (e.g. ["probate", "inherited"]) */
  anyOfTags?: string[];
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
  // Reject leads whose property has no real street address or owner name.
  // Catches garbage records and unresolved obituary placeholders.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualityFiltered = enrichedLeads.filter((l) => {
    const addr = (l.properties?.address ?? "").trim();
    const owner = (l.properties?.owner_name ?? "").trim();

    // Address must be a real street address (starts with a number, not a placeholder)
    const hasAddress = isRealStreetAddress(addr);
    // Owner must not be "Unknown" or empty
    const hasOwner = owner.length > 0
      && owner.toLowerCase() !== "unknown"
      && owner.toLowerCase() !== "unknown owner"
      && owner.toLowerCase() !== "n/a";

    if (!hasAddress || !hasOwner) {
      console.log(`[Promote] BLOCKED lead ${l.id}: addr="${addr.slice(0, 40)}", owner="${owner}" (${!hasAddress ? "bad address" : "bad owner"})`);
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

  // ── Value cap gate ────────────────────────────────────────────────
  // Hard filter: skip properties with AVM above $450K — not viable wholesale deals
  const MAX_AVM_VALUE = 450_000;
  const valueFiltered = promotable.filter((l) => {
    const flags = l.properties?.owner_flags ?? {};
    const prRaw = flags.pr_raw ?? {};
    const avm = Number(prRaw.AVM) || 0;
    // Also check estimated_value on the property as fallback
    if (avm > MAX_AVM_VALUE) return false;
    return true;
  });

  const valueBlockedCount = promotable.length - valueFiltered.length;
  if (valueBlockedCount > 0) {
    console.log(`[Promote] Value cap gate blocked ${valueBlockedCount} leads (AVM > $${MAX_AVM_VALUE.toLocaleString()})`);
  }

  // ── Tag filter gate (optional) ──────────────────────────────────────
  // requiredTags = ALL must match, anyOfTags = at least ONE must match
  const requiredTags = filter.requiredTags ?? [];
  const anyOfTags = filter.anyOfTags ?? [];
  let tagFiltered = valueFiltered;

  if (requiredTags.length > 0 || anyOfTags.length > 0) {
    tagFiltered = valueFiltered.filter((l) => {
      const tags: string[] = l.tags ?? [];
      const passRequired = requiredTags.length === 0 || requiredTags.every((rt) => tags.includes(rt));
      const passAnyOf = anyOfTags.length === 0 || anyOfTags.some((at) => tags.includes(at));
      return passRequired && passAnyOf;
    });
    console.log(`[Promote] Tag filter: required=[${requiredTags.join(",")}] anyOf=[${anyOfTags.join(",")}] → ${tagFiltered.length} of ${valueFiltered.length} matched`);
  }

  // ── Obituary confidence gate ──────────────────────────────────────
  // Crawler-sourced obituary records require high-confidence property match
  // before promotion. Unresolved obituaries (no match or low confidence) stay in staging.
  const MIN_OBIT_CONFIDENCE = 0.70;
  const confidenceFiltered = tagFiltered.filter((l) => {
    const flags = l.properties?.owner_flags ?? {};
    const crawlerSource = flags.crawler_source as string | undefined;

    // Only gate obituary-sourced records
    if (!crawlerSource?.startsWith("obituary:")) return true;

    const confidence = flags.obit_match_confidence as number | undefined;
    if (confidence == null) {
      // Obituary record that hasn't been through deceased search yet — block
      console.log(`[Promote] BLOCKED obit lead ${l.id}: no property match yet (unresolved obituary)`);
      return false;
    }
    if (confidence < MIN_OBIT_CONFIDENCE) {
      console.log(`[Promote] BLOCKED obit lead ${l.id}: low match confidence (${confidence.toFixed(2)} < ${MIN_OBIT_CONFIDENCE})`);
      return false;
    }
    return true;
  });

  const obitBlockedCount = tagFiltered.length - confidenceFiltered.length;
  if (obitBlockedCount > 0) {
    console.log(`[Promote] Obituary confidence gate blocked ${obitBlockedCount} leads (unresolved or low confidence)`);
  }

  console.log(`[Promote] ${enrichedLeads.length} enriched, ${garbageCount} blocked (bad data), ${valueBlockedCount} blocked (value cap), ${obitBlockedCount} blocked (obit confidence), ${confidenceFiltered.length} promotable (absentee/deceased), ${qualityFiltered.length - promotable.length} held in reservoir`);

  if (confidenceFiltered.length === 0) {
    return { promoted: 0, tier, scoreRange: { min: minScore, max: maxScore }, leads: [] };
  }

  // Batch promote
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promotedLeads: { id: string; score: number; label: string }[] = [];

  for (let i = 0; i < confidenceFiltered.length; i += 100) {
    const batch = confidenceFiltered.slice(i, i + 100);
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
    .limit(5000); // Fetch all staging leads — filter pre-enriched in memory

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
  let exhaustedCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const lead of stagingLeads as any[]) {
    const prop = propMap[lead.property_id];
    if (!prop) {
      needsEnrichment.push(lead); // no property = definitely needs work
      continue;
    }
    const flags = prop.owner_flags ?? {};

    // Skip exhausted leads — already hit MAX_ATTEMPTS and were finalized as partial/failed
    // These would just re-finalize every batch, wasting slots
    const priorAttempts = (flags.enrichment_attempts as number) ?? 0;
    const isExhausted = priorAttempts >= MAX_ATTEMPTS && flags.enrichment_status !== "enriched" && flags.enrichment_status !== "pending";
    if (isExhausted) {
      exhaustedCount++;
      continue;
    }

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

  console.log(`[Enrich/Batch] ${alreadyEnriched.length} pre-enriched (skip), ${exhaustedCount} exhausted (skip), ${needsEnrichment.length} need enrichment`);

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
