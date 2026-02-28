/**
 * ATTOM Daily Delta Ingest
 *
 * Vercel Cron endpoint — schedule every 4 hours.
 * vercel.json: { "crons": [{ "path": "/api/ingest/attom/daily", "schedule": "0 *\/4 * * *" }] }
 *
 * Pipeline per county (Spokane + Kootenai):
 *   1. Pull daily deltas from ATTOM (properties + foreclosures modified since last run)
 *   2. Detect distress signals from ATTOM data
 *   3. Upsert property via APN+County golden identity
 *   4. Insert distress_events with fingerprint dedup
 *   5. Run Predictive Scoring v2.1 on every record
 *   6. Push only blended score ≥75 to leads (prospect)
 *   7. Log to event_log with source and counts
 *
 * Budget: ~$0.05/record × ~200 records/run ≈ $10/run × 6 runs/day = $60/day = ~$1,800/mo
 * Capped at maxPages to stay within $500/mo → maxPages=2 per county.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import {
  computePredictiveScore,
  buildPredictionRecord,
  blendHeatScore,
  type PredictiveInput,
} from "@/lib/scoring-predictive";
import {
  pullDailyDelta,
  COUNTY_FIPS,
  FIPS_TO_STATE,
  fipsToCounty,
  normalizeAttomAPN,
  detectAttomDistressSignals,
  computeAttomEquity,
  estimateCost,
  type AttomProperty,
  type AttomForeclosure,
} from "@/lib/attom";
import { normalizeCounty, distressFingerprint, isDuplicateError } from "@/lib/dedup";
import type { DistressType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const SOURCE_TAG = "ATTOM_Daily";
const PROMOTION_THRESHOLD = 75;
const MAX_PAGES_PER_COUNTY = 2;

interface IngestCountyResult {
  county: string;
  fips: string;
  propertiesFetched: number;
  foreclosuresFetched: number;
  upserted: number;
  eventsInserted: number;
  eventsDeduped: number;
  promoted: number;
  updated: number;
  scored: number;
  errors: string[];
  apiCalls: number;
}

export async function GET(req: Request) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ATTOM_API_KEY) {
    return NextResponse.json(
      { error: "ATTOM_API_KEY not configured", success: false },
      { status: 500 },
    );
  }

  const startTime = Date.now();
  console.log("[ATTOM Daily] === STARTED ===", new Date().toISOString());

  const sb = createServerClient();

  // Look back 24 hours for deltas (overlap to catch anything missed)
  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const untilDate = new Date().toISOString();

  const results: IngestCountyResult[] = [];
  let totalApiCalls = 0;

  for (const [countyName, fips] of Object.entries(COUNTY_FIPS)) {
    const result = await ingestCounty(sb, {
      countyName,
      fips,
      sinceDate,
      untilDate,
    });
    results.push(result);
    totalApiCalls += result.apiCalls;
  }

  const elapsed = Date.now() - startTime;

  const totalPromoted = results.reduce((s, r) => s + r.promoted, 0);
  const totalUpserted = results.reduce((s, r) => s + r.upserted, 0);
  const totalFetched = results.reduce((s, r) => s + r.propertiesFetched + r.foreclosuresFetched, 0);

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "attom_daily_ingest",
    entity_type: "system",
    entity_id: "attom_daily",
    details: {
      counties: Object.keys(COUNTY_FIPS),
      total_fetched: totalFetched,
      total_upserted: totalUpserted,
      total_promoted: totalPromoted,
      api_calls: totalApiCalls,
      estimated_cost: estimateCost(totalApiCalls),
      elapsed_ms: elapsed,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`[ATTOM Daily] === COMPLETE in ${elapsed}ms — ${totalFetched} fetched, ${totalUpserted} upserted, ${totalPromoted} promoted ===`);

  return NextResponse.json({
    success: true,
    message: `ATTOM daily delta — ${totalFetched} fetched, ${totalUpserted} upserted, ${totalPromoted} promoted to leads`,
    counties: results.map((r) => ({
      county: r.county,
      fips: r.fips,
      propertiesFetched: r.propertiesFetched,
      foreclosuresFetched: r.foreclosuresFetched,
      upserted: r.upserted,
      eventsInserted: r.eventsInserted,
      eventsDeduped: r.eventsDeduped,
      promoted: r.promoted,
      updated: r.updated,
      scored: r.scored,
      errors: r.errors.length,
    })),
    apiCalls: totalApiCalls,
    estimatedCost: estimateCost(totalApiCalls),
    elapsed_ms: elapsed,
    timestamp: new Date().toISOString(),
  });
}

// ── Per-County Ingest Logic ──────────────────────────────────────────

async function ingestCounty(
  sb: ReturnType<typeof createServerClient>,
  opts: { countyName: string; fips: string; sinceDate: string; untilDate: string },
): Promise<IngestCountyResult> {
  const { countyName, fips, sinceDate, untilDate } = opts;
  const county = normalizeCounty(countyName);
  const state = FIPS_TO_STATE[fips] ?? "WA";

  const result: IngestCountyResult = {
    county,
    fips,
    propertiesFetched: 0,
    foreclosuresFetched: 0,
    upserted: 0,
    eventsInserted: 0,
    eventsDeduped: 0,
    promoted: 0,
    updated: 0,
    scored: 0,
    errors: [],
    apiCalls: 0,
  };

  console.log(`[ATTOM Daily] Processing ${county} (${fips}) since ${sinceDate}`);

  try {
    const delta = await pullDailyDelta({
      fips,
      countyName: county,
      sinceDateISO: sinceDate,
      untilDateISO: untilDate,
      pagesize: 50,
      maxPages: MAX_PAGES_PER_COUNTY,
    });

    result.propertiesFetched = delta.properties.length;
    result.foreclosuresFetched = delta.foreclosures.length;
    result.apiCalls = delta.apiCalls;

    // Build foreclosure lookup by APN
    const fcByApn: Record<string, AttomForeclosure> = {};
    for (const fc of delta.foreclosures) {
      const apn = normalizeAttomAPN(fc.identifier?.apn);
      if (apn) fcByApn[apn] = fc;
    }

    // Process each property
    for (const prop of delta.properties) {
      try {
        await processProperty(sb, prop, fcByApn, county, state, fips, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(msg);
        console.error(`[ATTOM Daily] Error processing property:`, msg);
      }
    }

    // Process foreclosures that don't have matching property records
    for (const fc of delta.foreclosures) {
      const apn = normalizeAttomAPN(fc.identifier?.apn);
      if (!apn) continue;

      // Only process if we didn't already handle it via a property record
      const alreadyProcessed = delta.properties.some(
        (p) => normalizeAttomAPN(p.identifier?.apn) === apn,
      );
      if (alreadyProcessed) continue;

      try {
        await processForeclosureOnly(sb, fc, county, state, fips, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(msg);
      }
    }

    console.log(`[ATTOM Daily] ${county}: ${result.upserted} upserted, ${result.promoted} promoted, ${result.errors.length} errors`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Delta pull failed: ${msg}`);
    console.error(`[ATTOM Daily] Delta pull error for ${county}:`, msg);
  }

  return result;
}

// ── Process Single Property ──────────────────────────────────────────

async function processProperty(
  sb: ReturnType<typeof createServerClient>,
  prop: AttomProperty,
  fcByApn: Record<string, AttomForeclosure>,
  county: string,
  state: string,
  fips: string,
  result: IngestCountyResult,
): Promise<void> {
  const apn = normalizeAttomAPN(prop.identifier?.apn);
  if (!apn) return;

  const fc = fcByApn[apn];
  const signals = detectAttomDistressSignals(prop, fc);
  if (signals.length === 0) return; // No distress = skip

  const addr = prop.address;
  const address = addr?.line1 ?? addr?.oneLine ?? `APN ${apn}`;
  const city = addr?.locality ?? "";
  const zip = addr?.postal1 ?? "";
  const ownerName = prop.assessment?.owner?.owner1?.fullName ?? "Unknown Owner";
  const estimatedValue = prop.avm?.amount?.value
    ?? prop.assessment?.market?.mktTtlValue
    ?? prop.assessment?.assessed?.assdTtlValue
    ?? null;
  const equityPercent = computeAttomEquity(prop);

  const ownerFlags: Record<string, unknown> = {
    absentee: prop.summary?.absenteeInd === "Y",
    corporate: prop.assessment?.owner?.corporateIndicator === "Y",
    freeAndClear: (prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0) <= 0,
    attom_id: prop.identifier?.attomId,
    fips,
    year_built: prop.summary?.yearBuilt,
    sqft: prop.building?.size?.livingSize ?? prop.building?.size?.bldgSize,
    beds: prop.building?.rooms?.beds,
    baths: prop.building?.rooms?.bathsTotal,
    lot_size: prop.lot?.lotSize1,
    tax_amount: prop.assessment?.tax?.taxAmt,
    avm_high: prop.avm?.amount?.high,
    avm_low: prop.avm?.amount?.low,
    avm_score: prop.avm?.amount?.scr,
    first_loan_amount: prop.assessment?.mortgage?.FirstConcurrent?.amount,
    first_loan_date: prop.assessment?.mortgage?.FirstConcurrent?.date,
    mailing_address: prop.assessment?.owner?.mailingAddressOneLine,
    last_modified: prop.vintage?.lastModified,
  };

  if (fc?.FC) {
    ownerFlags.fc_type = fc.FC.FCType;
    ownerFlags.fc_status = fc.FC.FCStatus;
    ownerFlags.fc_default_amount = fc.FC.defaultAmount;
    ownerFlags.fc_auction_date = fc.FC.FCAuctionDate;
    ownerFlags.fc_lender = fc.FC.lenderName;
  }

  // 1. Upsert property (APN+County golden identity)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property, error: propErr } = await (sb.from("properties") as any)
    .upsert({
      apn,
      county,
      address,
      city,
      state,
      zip,
      owner_name: ownerName,
      estimated_value: estimatedValue,
      equity_percent: equityPercent,
      property_type: prop.summary?.propType ?? null,
      bedrooms: prop.building?.rooms?.beds ?? null,
      bathrooms: prop.building?.rooms?.bathsTotal ?? null,
      sqft: prop.building?.size?.livingSize ?? prop.building?.size?.bldgSize ?? null,
      year_built: prop.summary?.yearBuilt ?? null,
      lot_size: prop.lot?.lotSize1 ?? null,
      owner_flags: ownerFlags,
      updated_at: new Date().toISOString(),
    }, { onConflict: "apn,county" })
    .select("id")
    .single();

  if (propErr || !property) {
    result.errors.push(`Upsert failed ${apn}: ${propErr?.message ?? "no data"}`);
    return;
  }
  result.upserted++;

  // 2. Insert distress events (dedup via fingerprint)
  for (const signal of signals) {
    const fp = distressFingerprint(apn, county, signal.type, signal.source);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: evtErr } = await (sb.from("distress_events") as any).insert({
      property_id: property.id,
      event_type: signal.type,
      source: signal.source,
      severity: signal.severity,
      fingerprint: fp,
      raw_data: {
        attom_id: prop.identifier?.attomId,
        fips,
        fc_type: fc?.FC?.FCType,
        fc_status: fc?.FC?.FCStatus,
        vintage: prop.vintage?.lastModified,
      },
      confidence: signal.severity >= 7 ? "0.900" : "0.600",
    });

    if (evtErr && isDuplicateError(evtErr)) {
      result.eventsDeduped++;
    } else if (evtErr) {
      console.error(`[ATTOM Daily] Event error (${signal.type}):`, evtErr.message);
    } else {
      result.eventsInserted++;
    }
  }

  // 3. Deterministic scoring
  const now = Date.now();
  const scoringInput: ScoringInput = {
    signals: signals.map((s) => ({
      type: s.type as DistressType,
      severity: s.severity,
      daysSinceEvent: 0,
    })),
    ownerFlags: {
      absentee: prop.summary?.absenteeInd === "Y",
      corporate: prop.assessment?.owner?.corporateIndicator === "Y",
      inherited: signals.some((s) => s.type === "inherited"),
      elderly: false,
      outOfState: prop.summary?.absenteeInd === "Y",
    },
    equityPercent: equityPercent ?? 50,
    compRatio: 1.0,
    historicalConversionRate: 0,
  };

  const score = computeScore(scoringInput);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: property.id,
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

  // 4. Predictive scoring v2.1
  const lastSaleDate = prop.sale?.amount?.saleRecDate ?? prop.assessment?.mortgage?.FirstConcurrent?.date ?? null;
  const lastSalePrice = prop.sale?.amount?.saleAmt ?? null;
  const totalLoanBalance = (prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0)
    + (prop.assessment?.mortgage?.SecondConcurrent?.amount ?? 0);

  const predInput: PredictiveInput = {
    propertyId: property.id,
    ownerName,
    ownershipYears: lastSaleDate
      ? Math.round((now - new Date(lastSaleDate).getTime()) / (365.25 * 86400000) * 10) / 10
      : null,
    lastSaleDate,
    lastSalePrice,
    estimatedValue,
    equityPercent,
    previousEquityPercent: null,
    equityDeltaMonths: null,
    totalLoanBalance: totalLoanBalance > 0 ? totalLoanBalance : null,
    isAbsentee: prop.summary?.absenteeInd === "Y",
    absenteeSinceDate: null,
    isVacant: signals.some((s) => s.type === "vacant"),
    isCorporateOwner: prop.assessment?.owner?.corporateIndicator === "Y",
    isFreeClear: (prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0) <= 0,
    ownerAgeKnown: null,
    delinquentAmount: null,
    previousDelinquentAmount: null,
    delinquentYears: 0,
    taxAssessedValue: prop.assessment?.assessed?.assdTtlValue ?? null,
    activeSignals: signals.map((s) => ({
      type: s.type as DistressType,
      severity: s.severity,
      daysSinceEvent: 0,
    })),
    historicalScores: [],
    foreclosureStage: fc?.FC?.FCStatus ?? fc?.FC?.FCType ?? null,
    defaultAmount: fc?.FC?.defaultAmount ?? null,
    hasPhone: false,
    hasEmail: false,
    hasProbateSignal: signals.some((s) => s.type === "probate"),
    hasInheritedSignal: signals.some((s) => s.type === "inherited"),
  };

  const predOutput = computePredictiveScore(predInput);
  const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_predictions") as any)
    .insert(buildPredictionRecord(property.id, predOutput));

  result.scored++;

  // 5. Promote to lead if blended ≥ threshold
  if (blendedScore >= PROMOTION_THRESHOLD) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id")
      .eq("property_id", property.id)
      .in("status", ["prospect", "lead", "negotiation"])
      .maybeSingle();

    if (!existingLead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id,
        status: "prospect",
        priority: blendedScore,
        source: SOURCE_TAG,
        tags: signals.map((s) => s.type),
        notes: `ATTOM Delta — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). Distress ~${predOutput.daysUntilDistress}d (${predOutput.confidence}% conf). ${signals.length} signal(s). ATTOM ID: ${prop.identifier?.attomId ?? "N/A"}`,
        promoted_at: new Date().toISOString(),
      });
      result.promoted++;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: blendedScore, tags: signals.map((s) => s.type) })
        .eq("id", existingLead.id);
      result.updated++;
    }
  }
}

// ── Process Foreclosure-Only Records ─────────────────────────────────

async function processForeclosureOnly(
  sb: ReturnType<typeof createServerClient>,
  fc: AttomForeclosure,
  county: string,
  state: string,
  fips: string,
  result: IngestCountyResult,
): Promise<void> {
  const apn = normalizeAttomAPN(fc.identifier?.apn);
  if (!apn) return;

  const addr = fc.address;
  const address = addr?.line1 ?? addr?.oneLine ?? `APN ${apn}`;
  const city = addr?.locality ?? "";
  const zip = addr?.postal1 ?? "";
  const borrowerName = fc.FC?.borrowerNameOwner ?? "Unknown Owner";

  // Upsert minimal property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property, error: propErr } = await (sb.from("properties") as any)
    .upsert({
      apn,
      county,
      address,
      city,
      state,
      zip,
      owner_name: borrowerName,
      owner_flags: {
        fips,
        fc_type: fc.FC?.FCType,
        fc_status: fc.FC?.FCStatus,
        fc_default_amount: fc.FC?.defaultAmount,
        fc_auction_date: fc.FC?.FCAuctionDate,
        fc_lender: fc.FC?.lenderName,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "apn,county" })
    .select("id")
    .single();

  if (propErr || !property) {
    result.errors.push(`FC upsert failed ${apn}: ${propErr?.message ?? "no data"}`);
    return;
  }
  result.upserted++;

  // Distress event
  const fcType = (fc.FC?.FCType ?? "").toLowerCase();
  const severity = fcType.includes("auction") ? 9 : fcType.includes("notice") ? 7 : 6;
  const fp = distressFingerprint(apn, county, "pre_foreclosure", `attom_fc_${fc.FC?.FCDocNbr ?? "unknown"}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: evtErr } = await (sb.from("distress_events") as any).insert({
    property_id: property.id,
    event_type: "pre_foreclosure",
    source: "attom_foreclosure",
    severity,
    fingerprint: fp,
    raw_data: {
      fc_type: fc.FC?.FCType,
      fc_status: fc.FC?.FCStatus,
      fc_doc_date: fc.FC?.FCDocDate,
      fc_rec_date: fc.FC?.FCRecDate,
      fc_auction_date: fc.FC?.FCAuctionDate,
      default_amount: fc.FC?.defaultAmount,
      lender: fc.FC?.lenderName,
    },
    confidence: severity >= 7 ? "0.900" : "0.700",
  });

  if (evtErr && isDuplicateError(evtErr)) {
    result.eventsDeduped++;
  } else if (evtErr) {
    console.error(`[ATTOM Daily] FC event error:`, evtErr.message);
  } else {
    result.eventsInserted++;
  }

  // Scoring
  const scoringInput: ScoringInput = {
    signals: [{
      type: "pre_foreclosure" as DistressType,
      severity,
      daysSinceEvent: 0,
    }],
    ownerFlags: {},
    equityPercent: 50,
    compRatio: 1.0,
    historicalConversionRate: 0,
  };

  const score = computeScore(scoringInput);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: property.id,
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

  // Predictive scoring
  const predInput: PredictiveInput = {
    propertyId: property.id,
    ownerName: borrowerName,
    ownershipYears: null,
    lastSaleDate: null,
    lastSalePrice: null,
    estimatedValue: null,
    equityPercent: null,
    previousEquityPercent: null,
    equityDeltaMonths: null,
    totalLoanBalance: fc.FC?.originalLoanAmount ?? null,
    isAbsentee: false,
    absenteeSinceDate: null,
    isVacant: false,
    isCorporateOwner: false,
    isFreeClear: false,
    ownerAgeKnown: null,
    delinquentAmount: null,
    previousDelinquentAmount: null,
    delinquentYears: 0,
    taxAssessedValue: null,
    activeSignals: [{ type: "pre_foreclosure" as DistressType, severity, daysSinceEvent: 0 }],
    historicalScores: [],
    foreclosureStage: fc.FC?.FCStatus ?? fc.FC?.FCType ?? null,
    defaultAmount: fc.FC?.defaultAmount ?? null,
    hasPhone: false,
    hasEmail: false,
    hasProbateSignal: false,
    hasInheritedSignal: false,
  };

  const predOutput = computePredictiveScore(predInput);
  const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_predictions") as any)
    .insert(buildPredictionRecord(property.id, predOutput));

  result.scored++;

  // Promote if meets threshold
  if (blendedScore >= PROMOTION_THRESHOLD) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id")
      .eq("property_id", property.id)
      .in("status", ["prospect", "lead", "negotiation"])
      .maybeSingle();

    if (!existingLead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id,
        status: "prospect",
        priority: blendedScore,
        source: SOURCE_TAG,
        tags: ["pre_foreclosure"],
        notes: `ATTOM Foreclosure — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). ${fc.FC?.FCType ?? "Unknown"} stage. Default: $${fc.FC?.defaultAmount ?? "?"} . Lender: ${fc.FC?.lenderName ?? "N/A"}`,
        promoted_at: new Date().toISOString(),
      });
      result.promoted++;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: blendedScore, tags: ["pre_foreclosure"] })
        .eq("id", existingLead.id);
      result.updated++;
    }
  }
}
