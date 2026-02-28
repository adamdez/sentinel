/**
 * Sentinel AI Agent Core — Autonomous Ingest Orchestrator
 *
 * Charter v3.1 §5.4 — Full predictive automation.
 * AI as massive leverage. Everything automatic.
 *
 * This module is the single entry point for the entire ingest pipeline.
 * Vercel Cron calls /api/ingest/daily-poll → which invokes runAgentCycle().
 *
 * Agent Cycle (runs every 4 hours):
 *   Phase 1 — PropertyRadar Elite Seed (top10 distressed parcels)
 *   Phase 2 — Predictive Crawlers (obituaries, court dockets)
 *   Phase 3 — ATTOM Data API (daily delta: properties + foreclosures)
 *
 * Design:
 *   - Each phase is isolated: one failure does not block others
 *   - ATTOM_API_KEY check gates Phase 3 (graceful skip with log)
 *   - All results logged to event_log for full audit trail
 *   - Deterministic scoring on every record (v2.1 predictive + v2.0 deterministic)
 *   - Idempotent: APN+County golden key dedup on every upsert
 *
 * Schedule: "0 *\/4 * * *" (every 4 hours UTC)
 * Budget: ATTOM capped at 2 pages/county to stay within $500/mo
 */

import { createServerClient } from "@/lib/supabase";
import { runAllCrawlers, type CrawlRunResult } from "@/lib/crawlers/predictive-crawler";
import { obituaryCrawler } from "@/lib/crawlers/obituary-crawler";
import { courtDocketCrawler } from "@/lib/crawlers/court-docket-crawler";
import { runGrokReasoning, type GrokDirective } from "@/lib/agent/grok-reasoning-agent";
import {
  pullDailyDelta,
  COUNTY_FIPS,
  FIPS_TO_STATE,
  normalizeAttomAPN,
  detectAttomDistressSignals,
  computeAttomEquity,
  estimateCost,
  type AttomProperty,
  type AttomForeclosure,
} from "@/lib/attom";
import { normalizeCounty, distressFingerprint, isDuplicateError } from "@/lib/dedup";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import {
  computePredictiveScore,
  buildPredictionRecord,
  blendHeatScore,
  type PredictiveInput,
} from "@/lib/scoring-predictive";
import type { DistressType } from "@/lib/types";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const ATTOM_SOURCE_TAG = "ATTOM_Daily";
const ATTOM_PROMOTION_THRESHOLD = 75;
const MAX_PAGES_PER_COUNTY = 2;

// ── Result Types ─────────────────────────────────────────────────────

export interface AttomCountyResult {
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

export interface AttomPhaseResult {
  success: boolean;
  skipped: boolean;
  reason?: string;
  counties: AttomCountyResult[];
  totalApiCalls: number;
  estimatedCost: string;
  elapsed_ms: number;
}

export interface AgentCycleResult {
  success: boolean;
  grokDirective: GrokDirective | null;
  phases: {
    propertyRadar: { success: boolean; count: number; newInserts: number; updated: number; prCost: string };
    crawlers: CrawlRunResult[];
    attom: AttomPhaseResult;
  };
  elapsed_ms: number;
  timestamp: string;
}

// ── Phase 2: Predictive Crawlers ─────────────────────────────────────

export async function runCrawlerPhase(): Promise<{ results: CrawlRunResult[]; success: boolean }> {
  try {
    console.log("[Agent] Phase 2: Starting predictive crawlers...");
    const results = await runAllCrawlers([obituaryCrawler, courtDocketCrawler]);

    const totalPromoted = results.reduce((s, r) => s + r.promoted, 0);
    const totalCrawled = results.reduce((s, r) => s + r.crawled, 0);
    console.log(`[Agent] Phase 2 complete — ${totalCrawled} crawled, ${totalPromoted} promoted`);

    return { results, success: true };
  } catch (err) {
    console.error("[Agent] Phase 2 error:", err);
    return { results: [], success: false };
  }
}

// ── Phase 3: ATTOM Daily Delta ───────────────────────────────────────

export async function runAttomPhase(): Promise<AttomPhaseResult> {
  const startTime = Date.now();

  if (!process.env.ATTOM_API_KEY) {
    console.log("[Agent] Phase 3: ATTOM_API_KEY not set — skipping");
    return {
      success: false,
      skipped: true,
      reason: "ATTOM_API_KEY not configured",
      counties: [],
      totalApiCalls: 0,
      estimatedCost: "$0.00",
      elapsed_ms: 0,
    };
  }

  console.log("[Agent] Phase 3: Starting ATTOM daily delta pull...");

  const sb = createServerClient();
  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const untilDate = new Date().toISOString();

  const counties: AttomCountyResult[] = [];
  let totalApiCalls = 0;

  for (const [countyName, fips] of Object.entries(COUNTY_FIPS)) {
    const result = await ingestAttomCounty(sb, { countyName, fips, sinceDate, untilDate });
    counties.push(result);
    totalApiCalls += result.apiCalls;
  }

  const elapsed = Date.now() - startTime;
  const totalPromoted = counties.reduce((s, r) => s + r.promoted, 0);
  const totalUpserted = counties.reduce((s, r) => s + r.upserted, 0);
  const totalFetched = counties.reduce((s, r) => s + r.propertiesFetched + r.foreclosuresFetched, 0);

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

  console.log(`[Agent] Phase 3 complete — ${totalFetched} fetched, ${totalUpserted} upserted, ${totalPromoted} promoted (${estimateCost(totalApiCalls)})`);

  return {
    success: true,
    skipped: false,
    counties,
    totalApiCalls,
    estimatedCost: estimateCost(totalApiCalls),
    elapsed_ms: elapsed,
  };
}

// ── Full Agent Cycle ─────────────────────────────────────────────────
// Called by /api/ingest/daily-poll on cron schedule.

export async function runAgentCycle(
  baseUrl: string,
  counties: string[],
  cronSecret?: string,
): Promise<AgentCycleResult> {
  const startTime = Date.now();
  console.log("[Agent] === CYCLE STARTED ===", new Date().toISOString());

  // ── Phase 0: Grok Reasoning (Observe → Reason → Act) ─────────────
  let grokDirective: GrokDirective | null = null;
  try {
    console.log("[Agent] Phase 0: Grok reasoning layer...");
    grokDirective = await runGrokReasoning();
    console.log(`[Agent] Phase 0 complete — run: [${grokDirective.nextCrawlersToRun.join(", ")}]`);
  } catch (err) {
    console.error("[Agent] Phase 0 (Grok) error — falling back to run-all:", err);
  }

  const shouldRun = (crawler: string) =>
    !grokDirective || grokDirective.nextCrawlersToRun.includes(crawler);

  // ── Phase 1: PropertyRadar ───────────────────────────────────────
  let prResult: Record<string, unknown> = {};
  let prSuccess = false;

  if (shouldRun("propertyradar")) {
    try {
      console.log("[Agent] Phase 1: PropertyRadar Elite Seed...");
      const res = await fetch(`${baseUrl}/api/ingest/propertyradar/top10`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counties }),
      });

      prResult = await res.json();
      prSuccess = res.ok && prResult.success === true;

      console.log("[Agent] Phase 1 result:", {
        success: prSuccess,
        count: prResult.count,
        newInserts: prResult.newInserts,
        updated: prResult.updated,
      });
    } catch (err) {
      console.error("[Agent] Phase 1 error:", err);
      prResult = { error: String(err) };
    }
  } else {
    console.log("[Agent] Phase 1: PropertyRadar skipped by Grok directive");
  }

  // ── Phase 2: Predictive Crawlers ─────────────────────────────────
  const runObits = shouldRun("obituary");
  const runCourts = shouldRun("court_docket");
  let crawlerPhase: { results: CrawlRunResult[]; success: boolean };

  if (runObits || runCourts) {
    const crawlers = [
      ...(runObits ? [obituaryCrawler] : []),
      ...(runCourts ? [courtDocketCrawler] : []),
    ];
    try {
      console.log(`[Agent] Phase 2: Running ${crawlers.length} crawler(s)...`);
      const results = await runAllCrawlers(crawlers);
      crawlerPhase = { results, success: true };
    } catch (err) {
      console.error("[Agent] Phase 2 error:", err);
      crawlerPhase = { results: [], success: false };
    }
  } else {
    console.log("[Agent] Phase 2: Crawlers skipped by Grok directive");
    crawlerPhase = { results: [], success: true };
  }

  // ── Phase 3: ATTOM Daily Delta ───────────────────────────────────
  let attomPhase: AttomPhaseResult;
  if (shouldRun("attom")) {
    attomPhase = await runAttomPhase();
  } else {
    console.log("[Agent] Phase 3: ATTOM skipped by Grok directive");
    attomPhase = {
      success: true, skipped: true,
      reason: "Skipped by Grok directive",
      counties: [], totalApiCalls: 0,
      estimatedCost: "$0.00", elapsed_ms: 0,
    };
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Agent] === CYCLE COMPLETE in ${elapsed}ms ===`);

  return {
    success: prSuccess || crawlerPhase.success || attomPhase.success,
    grokDirective,
    phases: {
      propertyRadar: {
        success: prSuccess,
        count: (prResult.count as number) ?? 0,
        newInserts: (prResult.newInserts as number) ?? 0,
        updated: (prResult.updated as number) ?? 0,
        prCost: (prResult.prCost as string) ?? "?",
      },
      crawlers: crawlerPhase.results,
      attom: attomPhase,
    },
    elapsed_ms: elapsed,
    timestamp: new Date().toISOString(),
  };
}

// ── ATTOM Per-County Ingest ──────────────────────────────────────────

async function ingestAttomCounty(
  sb: ReturnType<typeof createServerClient>,
  opts: { countyName: string; fips: string; sinceDate: string; untilDate: string },
): Promise<AttomCountyResult> {
  const { countyName, fips, sinceDate, untilDate } = opts;
  const county = normalizeCounty(countyName);
  const state = FIPS_TO_STATE[fips] ?? "WA";

  const result: AttomCountyResult = {
    county, fips,
    propertiesFetched: 0, foreclosuresFetched: 0,
    upserted: 0, eventsInserted: 0, eventsDeduped: 0,
    promoted: 0, updated: 0, scored: 0,
    errors: [], apiCalls: 0,
  };

  console.log(`[Agent/ATTOM] Processing ${county} (${fips}) since ${sinceDate}`);

  try {
    const delta = await pullDailyDelta({
      fips, countyName: county,
      sinceDateISO: sinceDate, untilDateISO: untilDate,
      pagesize: 50, maxPages: MAX_PAGES_PER_COUNTY,
    });

    result.propertiesFetched = delta.properties.length;
    result.foreclosuresFetched = delta.foreclosures.length;
    result.apiCalls = delta.apiCalls;

    const fcByApn: Record<string, AttomForeclosure> = {};
    for (const fc of delta.foreclosures) {
      const apn = normalizeAttomAPN(fc.identifier?.apn);
      if (apn) fcByApn[apn] = fc;
    }

    for (const prop of delta.properties) {
      try {
        await processAttomProperty(sb, prop, fcByApn, county, state, fips, result);
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    for (const fc of delta.foreclosures) {
      const apn = normalizeAttomAPN(fc.identifier?.apn);
      if (!apn) continue;
      if (delta.properties.some((p) => normalizeAttomAPN(p.identifier?.apn) === apn)) continue;

      try {
        await processAttomForeclosure(sb, fc, county, state, fips, result);
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    console.log(`[Agent/ATTOM] ${county}: ${result.upserted} upserted, ${result.promoted} promoted, ${result.errors.length} errors`);
  } catch (err) {
    result.errors.push(`Delta pull failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

// ── Process ATTOM Property ───────────────────────────────────────────

async function processAttomProperty(
  sb: ReturnType<typeof createServerClient>,
  prop: AttomProperty,
  fcByApn: Record<string, AttomForeclosure>,
  county: string,
  state: string,
  fips: string,
  result: AttomCountyResult,
): Promise<void> {
  const apn = normalizeAttomAPN(prop.identifier?.apn);
  if (!apn) return;

  const fc = fcByApn[apn];
  const signals = detectAttomDistressSignals(prop, fc);
  if (signals.length === 0) return;

  const addr = prop.address;
  const address = addr?.line1 ?? addr?.oneLine ?? `APN ${apn}`;
  const city = addr?.locality ?? "";
  const zip = addr?.postal1 ?? "";
  const ownerName = prop.assessment?.owner?.owner1?.fullName ?? "Unknown Owner";
  const estimatedValue = prop.avm?.amount?.value
    ?? prop.assessment?.market?.mktTtlValue
    ?? prop.assessment?.assessed?.assdTtlValue ?? null;
  const equityPercent = computeAttomEquity(prop);

  const ownerFlags: Record<string, unknown> = {
    absentee: prop.summary?.absenteeInd === "Y",
    corporate: prop.assessment?.owner?.corporateIndicator === "Y",
    freeAndClear: (prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0) <= 0,
    attom_id: prop.identifier?.attomId, fips,
    year_built: prop.summary?.yearBuilt,
    sqft: prop.building?.size?.livingSize ?? prop.building?.size?.bldgSize,
    beds: prop.building?.rooms?.beds,
    baths: prop.building?.rooms?.bathsTotal,
    lot_size: prop.lot?.lotSize1,
    tax_amount: prop.assessment?.tax?.taxAmt,
    avm_high: prop.avm?.amount?.high, avm_low: prop.avm?.amount?.low,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property, error: propErr } = await (sb.from("properties") as any)
    .upsert({
      apn, county, address, city, state, zip,
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
    .select("id").single();

  if (propErr || !property) {
    result.errors.push(`Upsert failed ${apn}: ${propErr?.message ?? "no data"}`);
    return;
  }
  result.upserted++;

  for (const signal of signals) {
    const fp = distressFingerprint(apn, county, signal.type, signal.source);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: evtErr } = await (sb.from("distress_events") as any).insert({
      property_id: property.id, event_type: signal.type,
      source: signal.source, severity: signal.severity, fingerprint: fp,
      raw_data: { attom_id: prop.identifier?.attomId, fips, fc_type: fc?.FC?.FCType, fc_status: fc?.FC?.FCStatus, vintage: prop.vintage?.lastModified },
      confidence: signal.severity >= 7 ? "0.900" : "0.600",
    });
    if (evtErr && isDuplicateError(evtErr)) result.eventsDeduped++;
    else if (evtErr) console.error(`[Agent/ATTOM] Event error (${signal.type}):`, evtErr.message);
    else result.eventsInserted++;
  }

  const scoringInput: ScoringInput = {
    signals: signals.map((s) => ({ type: s.type as DistressType, severity: s.severity, daysSinceEvent: 0 })),
    ownerFlags: {
      absentee: prop.summary?.absenteeInd === "Y",
      corporate: prop.assessment?.owner?.corporateIndicator === "Y",
      inherited: signals.some((s) => s.type === "inherited"),
      elderly: false,
      outOfState: prop.summary?.absenteeInd === "Y",
    },
    equityPercent: equityPercent ?? 50, compRatio: 1.0, historicalConversionRate: 0,
  };
  const score = computeScore(scoringInput);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: property.id, model_version: SCORING_MODEL_VERSION,
    composite_score: score.composite, motivation_score: score.motivationScore, deal_score: score.dealScore,
    severity_multiplier: score.severityMultiplier, recency_decay: score.recencyDecay,
    stacking_bonus: score.stackingBonus, owner_factor_score: score.ownerFactorScore,
    equity_factor_score: score.equityFactorScore, ai_boost: score.aiBoost, factors: score.factors,
  });

  const now = Date.now();
  const lastSaleDate = prop.sale?.amount?.saleRecDate ?? prop.assessment?.mortgage?.FirstConcurrent?.date ?? null;
  const totalLoanBalance = (prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0) + (prop.assessment?.mortgage?.SecondConcurrent?.amount ?? 0);

  const predInput: PredictiveInput = {
    propertyId: property.id, ownerName,
    ownershipYears: lastSaleDate ? Math.round((now - new Date(lastSaleDate).getTime()) / (365.25 * 86400000) * 10) / 10 : null,
    lastSaleDate, lastSalePrice: prop.sale?.amount?.saleAmt ?? null,
    estimatedValue, equityPercent,
    previousEquityPercent: null, equityDeltaMonths: null,
    totalLoanBalance: totalLoanBalance > 0 ? totalLoanBalance : null,
    isAbsentee: prop.summary?.absenteeInd === "Y", absenteeSinceDate: null,
    isVacant: signals.some((s) => s.type === "vacant"),
    isCorporateOwner: prop.assessment?.owner?.corporateIndicator === "Y",
    isFreeClear: (prop.assessment?.mortgage?.FirstConcurrent?.amount ?? 0) <= 0,
    ownerAgeKnown: null, delinquentAmount: null, previousDelinquentAmount: null,
    delinquentYears: 0, taxAssessedValue: prop.assessment?.assessed?.assdTtlValue ?? null,
    activeSignals: signals.map((s) => ({ type: s.type as DistressType, severity: s.severity, daysSinceEvent: 0 })),
    historicalScores: [], foreclosureStage: fc?.FC?.FCStatus ?? fc?.FC?.FCType ?? null,
    defaultAmount: fc?.FC?.defaultAmount ?? null,
    hasPhone: false, hasEmail: false,
    hasProbateSignal: signals.some((s) => s.type === "probate"),
    hasInheritedSignal: signals.some((s) => s.type === "inherited"),
  };

  const predOutput = computePredictiveScore(predInput);
  const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_predictions") as any).insert(buildPredictionRecord(property.id, predOutput));
  result.scored++;

  if (blendedScore >= ATTOM_PROMOTION_THRESHOLD) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id").eq("property_id", property.id)
      .in("status", ["prospect", "lead", "negotiation"]).maybeSingle();

    if (!existingLead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id, status: "prospect", priority: blendedScore,
        source: ATTOM_SOURCE_TAG, tags: signals.map((s) => s.type),
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

// ── Process ATTOM Foreclosure-Only ───────────────────────────────────

async function processAttomForeclosure(
  sb: ReturnType<typeof createServerClient>,
  fc: AttomForeclosure,
  county: string,
  state: string,
  fips: string,
  result: AttomCountyResult,
): Promise<void> {
  const apn = normalizeAttomAPN(fc.identifier?.apn);
  if (!apn) return;

  const addr = fc.address;
  const address = addr?.line1 ?? addr?.oneLine ?? `APN ${apn}`;
  const city = addr?.locality ?? "";
  const zip = addr?.postal1 ?? "";
  const borrowerName = fc.FC?.borrowerNameOwner ?? "Unknown Owner";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property, error: propErr } = await (sb.from("properties") as any)
    .upsert({
      apn, county, address, city, state, zip,
      owner_name: borrowerName,
      owner_flags: {
        fips, fc_type: fc.FC?.FCType, fc_status: fc.FC?.FCStatus,
        fc_default_amount: fc.FC?.defaultAmount,
        fc_auction_date: fc.FC?.FCAuctionDate, fc_lender: fc.FC?.lenderName,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "apn,county" })
    .select("id").single();

  if (propErr || !property) {
    result.errors.push(`FC upsert failed ${apn}: ${propErr?.message ?? "no data"}`);
    return;
  }
  result.upserted++;

  const fcType = (fc.FC?.FCType ?? "").toLowerCase();
  const severity = fcType.includes("auction") ? 9 : fcType.includes("notice") ? 7 : 6;
  const fp = distressFingerprint(apn, county, "pre_foreclosure", `attom_fc_${fc.FC?.FCDocNbr ?? "unknown"}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: evtErr } = await (sb.from("distress_events") as any).insert({
    property_id: property.id, event_type: "pre_foreclosure",
    source: "attom_foreclosure", severity, fingerprint: fp,
    raw_data: {
      fc_type: fc.FC?.FCType, fc_status: fc.FC?.FCStatus, fc_doc_date: fc.FC?.FCDocDate,
      fc_rec_date: fc.FC?.FCRecDate, fc_auction_date: fc.FC?.FCAuctionDate,
      default_amount: fc.FC?.defaultAmount, lender: fc.FC?.lenderName,
    },
    confidence: severity >= 7 ? "0.900" : "0.700",
  });

  if (evtErr && isDuplicateError(evtErr)) result.eventsDeduped++;
  else if (evtErr) console.error(`[Agent/ATTOM] FC event error:`, evtErr.message);
  else result.eventsInserted++;

  const scoringInput: ScoringInput = {
    signals: [{ type: "pre_foreclosure" as DistressType, severity, daysSinceEvent: 0 }],
    ownerFlags: {}, equityPercent: 50, compRatio: 1.0, historicalConversionRate: 0,
  };
  const score = computeScore(scoringInput);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_records") as any).insert({
    property_id: property.id, model_version: SCORING_MODEL_VERSION,
    composite_score: score.composite, motivation_score: score.motivationScore, deal_score: score.dealScore,
    severity_multiplier: score.severityMultiplier, recency_decay: score.recencyDecay,
    stacking_bonus: score.stackingBonus, owner_factor_score: score.ownerFactorScore,
    equity_factor_score: score.equityFactorScore, ai_boost: score.aiBoost, factors: score.factors,
  });

  const predInput: PredictiveInput = {
    propertyId: property.id, ownerName: borrowerName,
    ownershipYears: null, lastSaleDate: null, lastSalePrice: null,
    estimatedValue: null, equityPercent: null,
    previousEquityPercent: null, equityDeltaMonths: null,
    totalLoanBalance: fc.FC?.originalLoanAmount ?? null,
    isAbsentee: false, absenteeSinceDate: null, isVacant: false,
    isCorporateOwner: false, isFreeClear: false, ownerAgeKnown: null,
    delinquentAmount: null, previousDelinquentAmount: null, delinquentYears: 0,
    taxAssessedValue: null,
    activeSignals: [{ type: "pre_foreclosure" as DistressType, severity, daysSinceEvent: 0 }],
    historicalScores: [], foreclosureStage: fc.FC?.FCStatus ?? fc.FC?.FCType ?? null,
    defaultAmount: fc.FC?.defaultAmount ?? null,
    hasPhone: false, hasEmail: false,
    hasProbateSignal: false, hasInheritedSignal: false,
  };

  const predOutput = computePredictiveScore(predInput);
  const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("scoring_predictions") as any).insert(buildPredictionRecord(property.id, predOutput));
  result.scored++;

  if (blendedScore >= ATTOM_PROMOTION_THRESHOLD) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id").eq("property_id", property.id)
      .in("status", ["prospect", "lead", "negotiation"]).maybeSingle();

    if (!existingLead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id, status: "prospect", priority: blendedScore,
        source: ATTOM_SOURCE_TAG, tags: ["pre_foreclosure"],
        notes: `ATTOM Foreclosure — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). ${fc.FC?.FCType ?? "Unknown"} stage. Default: $${fc.FC?.defaultAmount ?? "?"}. Lender: ${fc.FC?.lenderName ?? "N/A"}`,
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
