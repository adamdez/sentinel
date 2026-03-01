import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import {
  computePredictiveScore,
  buildPredictionRecord,
  blendHeatScore,
  type PredictiveInput,
} from "@/lib/scoring-predictive";
import type { DistressType } from "@/lib/types";
import {
  normalizeCounty, distressFingerprint, isDuplicateError,
  isTruthy, toNumber, toInt, daysSince,
} from "@/lib/dedup";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API = "https://api.propertyradar.com/v1/properties";
const ELITE_CUTOFF = 75;
const SOURCE_TAG = "BulkSeed_1000_20260301";

const DEFAULT_COUNTIES = ["Spokane", "Kootenai"];
const COUNTY_STATE_MAP: Record<string, string> = {
  spokane: "WA", kootenai: "ID", bonner: "ID", latah: "ID",
  whitman: "WA", lincoln: "WA", stevens: "WA",
};

const PR_FIELDS = [
  "RadarID", "APN", "Address", "FullAddress", "City", "State", "ZipFive",
  "County", "Owner", "Taxpayer", "PType", "SqFt", "Beds", "Baths",
  "YearBuilt", "LotSize", "Latitude", "Longitude",
  "AVM", "AvailableEquity", "EquityPercent", "TotalLoanBalance",
  "LastTransferValue", "LastTransferRecDate",
  "isDeceasedProperty", "isPreforeclosure", "inForeclosure",
  "inTaxDelinquency", "inDivorce", "inBankruptcyProperty",
  "isSiteVacant", "isMailVacant", "isNotSameMailingOrExempt",
  "isFreeAndClear", "isHighEquity", "isCashBuyer",
  "PropertyHasOpenLiens", "PropertyHasOpenPersonLiens",
  "ForeclosureStage", "ForeclosureRecDate", "DefaultAmount",
  "DelinquentYear", "DelinquentAmount",
].join(",");

interface PRProperty {
  RadarID?: string;
  APN?: string;
  Address?: string;
  FullAddress?: string;
  City?: string;
  State?: string;
  ZipFive?: string;
  County?: string;
  Owner?: string;
  Taxpayer?: string;
  PType?: string;
  SqFt?: string | number;
  Beds?: string | number;
  Baths?: string | number;
  YearBuilt?: string | number;
  LotSize?: number;
  AVM?: number | string;
  AvailableEquity?: number | string;
  EquityPercent?: string | number;
  TotalLoanBalance?: number | string;
  LastTransferValue?: number | string;
  LastTransferRecDate?: string;
  isSiteVacant?: string | boolean | number;
  isMailVacant?: string | boolean | number;
  isNotSameMailingOrExempt?: string | boolean | number;
  isFreeAndClear?: string | boolean | number;
  isHighEquity?: string | boolean | number;
  isCashBuyer?: string | boolean | number;
  isDeceasedProperty?: string | boolean | number;
  isPreforeclosure?: string | boolean | number;
  isAuction?: string | boolean | number;
  inTaxDelinquency?: string | boolean | number;
  inForeclosure?: string | boolean | number;
  inDivorce?: string | boolean | number;
  inBankruptcyProperty?: string | boolean | number;
  PropertyHasOpenLiens?: string | boolean | number;
  PropertyHasOpenPersonLiens?: string | boolean | number;
  ForeclosureStage?: string;
  ForeclosureRecDate?: string;
  DefaultAmount?: number | string;
  DelinquentYear?: number | string;
  DelinquentAmount?: number | string;
  Phone1?: string; Phone2?: string; Email?: string;
  [key: string]: unknown;
}

interface DetectedSignal {
  type: DistressType;
  severity: number;
  daysSinceEvent: number;
  detectedFrom: string;
}

function detectDistressSignals(pr: PRProperty): DetectedSignal[] {
  const signals: DetectedSignal[] = [];

  if (isTruthy(pr.isDeceasedProperty))
    signals.push({ type: "probate", severity: 9, daysSinceEvent: 30, detectedFrom: "isDeceasedProperty" });

  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure)) {
    const amt = toNumber(pr.DefaultAmount) ?? 0;
    signals.push({
      type: "pre_foreclosure", severity: amt > 50000 ? 9 : 7,
      daysSinceEvent: pr.ForeclosureRecDate ? daysSince(pr.ForeclosureRecDate) : 30,
      detectedFrom: isTruthy(pr.isPreforeclosure) ? "isPreforeclosure" : "inForeclosure",
    });
  }

  if (isTruthy(pr.inTaxDelinquency)) {
    const amt = toNumber(pr.DelinquentAmount) ?? 0;
    signals.push({
      type: "tax_lien", severity: amt > 10000 ? 8 : 6,
      daysSinceEvent: pr.DelinquentYear ? Math.max(365 * (new Date().getFullYear() - Number(pr.DelinquentYear)), 30) : 90,
      detectedFrom: "inTaxDelinquency",
    });
  }

  if (isTruthy(pr.inBankruptcyProperty))
    signals.push({ type: "bankruptcy", severity: 8, daysSinceEvent: 60, detectedFrom: "inBankruptcyProperty" });
  if (isTruthy(pr.inDivorce))
    signals.push({ type: "divorce", severity: 7, daysSinceEvent: 60, detectedFrom: "inDivorce" });

  if (isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant))
    signals.push({ type: "vacant", severity: 5, daysSinceEvent: 60, detectedFrom: isTruthy(pr.isSiteVacant) ? "isSiteVacant" : "isMailVacant" });
  if (isTruthy(pr.isNotSameMailingOrExempt))
    signals.push({ type: "absentee", severity: 4, daysSinceEvent: 90, detectedFrom: "isNotSameMailingOrExempt" });

  if ((isTruthy(pr.PropertyHasOpenLiens) || isTruthy(pr.PropertyHasOpenPersonLiens)) && !signals.some((s) => s.type === "tax_lien"))
    signals.push({ type: "tax_lien", severity: 5, daysSinceEvent: 90, detectedFrom: "PropertyHasOpenLiens" });

  if (signals.length === 0)
    signals.push({ type: "absentee", severity: 3, daysSinceEvent: 180, detectedFrom: "default_absentee" });

  return signals;
}

/**
 * POST /api/ingest/propertyradar/bulk-seed
 *
 * Admin-only bulk pull from PropertyRadar.
 * Pulls up to `limit` records (default 1000, max 1000), scores all with
 * v2.0 deterministic + v2.1 predictive, inserts those with blended >= 75.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  // Parse body once up-front (stream can only be read once)
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  // Admin guard — check user role
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  let isAdmin = false;

  if (cronSecret && bearerToken === cronSecret) {
    isAdmin = true;
  } else {
    const userId = body?.userId as string | undefined;
    if (userId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (sb.from("user_profiles") as any)
        .select("role")
        .eq("id", userId)
        .single();
      isAdmin = profile?.role === "admin";
    }
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "PROPERTYRADAR_API_KEY not configured" },
      { status: 500 },
    );
  }

  const pullLimit = Math.min(Math.max(toInt(body.limit as string) ?? 1000, 1), 1000);
  const counties: string[] = Array.isArray(body.counties) ? body.counties.map(String) : DEFAULT_COUNTIES;
  const states = [...new Set(counties.map((c) => COUNTY_STATE_MAP[c.toLowerCase()] ?? "WA"))];

  const startTime = Date.now();
  console.log(`[BulkSeed] === STARTED: limit=${pullLimit}, counties=[${counties}] ===`);

  // PropertyRadar pulls in pages of 200
  const PAGE_SIZE = 200;
  const pages = Math.ceil(pullLimit / PAGE_SIZE);
  const allResults: PRProperty[] = [];

  for (let page = 0; page < pages; page++) {
    const offset = page * PAGE_SIZE;
    const thisLimit = Math.min(PAGE_SIZE, pullLimit - offset);
    const url = `${PR_API}?Purchase=1&Limit=${thisLimit}&Start=${offset}&Fields=${PR_FIELDS}`;

    const criteria = [
      { name: "State", value: states },
      { name: "County", value: counties },
      { name: "isNotSameMailingOrExempt", value: ["1"] },
      { name: "EquityPercent", value: ["40", "100"] },
    ];

    try {
      const prRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ Criteria: criteria }),
      });

      if (!prRes.ok) {
        console.error(`[BulkSeed] PR page ${page} HTTP ${prRes.status}`);
        break;
      }

      const prData = await prRes.json();
      const pageResults: PRProperty[] = prData.results ?? [];
      allResults.push(...pageResults);
      console.log(`[BulkSeed] Page ${page + 1}/${pages}: ${pageResults.length} records (total: ${allResults.length}, cost: ${prData.totalCost ?? "?"})`);

      if (pageResults.length < thisLimit) break;
    } catch (err) {
      console.error(`[BulkSeed] PR page ${page} network error:`, err);
      break;
    }
  }

  if (allResults.length === 0) {
    return NextResponse.json({
      success: false,
      error: "PropertyRadar returned 0 results. Check API key and filters.",
      counties,
    });
  }

  console.log(`[BulkSeed] Fetched ${allResults.length} total records — scoring...`);

  // Score all
  type ScoredCandidate = { pr: PRProperty; score: ReturnType<typeof computeScore>; signals: DetectedSignal[] };
  const candidates: ScoredCandidate[] = [];

  for (const pr of allResults) {
    if (!pr.APN) continue;
    const signals = detectDistressSignals(pr);
    const equityPct = toNumber(pr.EquityPercent) ?? 50;
    const avm = toNumber(pr.AVM) ?? 0;
    const loanBal = toNumber(pr.TotalLoanBalance) ?? 0;
    const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

    const input: ScoringInput = {
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

    candidates.push({ pr, score: computeScore(input), signals });
  }

  candidates.sort((a, b) => b.score.composite - a.score.composite);
  const elite = candidates.filter((c) => c.score.composite >= ELITE_CUTOFF);

  console.log(`[BulkSeed] ${candidates.length} scored → ${elite.length} above cutoff (>= ${ELITE_CUTOFF})`);

  // Insert elite into Supabase
  let newInserts = 0;
  let updated = 0;
  let errored = 0;
  let eventsInserted = 0;
  let eventsDeduped = 0;
  let topScore = 0;
  let topAddress = "";

  for (let i = 0; i < elite.length; i++) {
    const { pr, score, signals } = elite[i];
    const apn = pr.APN!;
    const county = normalizeCounty(pr.County ?? counties[0], "Spokane");
    const address = pr.Address ?? pr.FullAddress ?? "";
    const city = pr.City ?? "";
    const state = pr.State ?? "WA";
    const zip = pr.ZipFive ?? "";
    const ownerName = pr.Owner ?? pr.Taxpayer ?? "Unknown Owner";
    const fullAddr = [address, city, state, zip].filter(Boolean).join(", ");

    if (i < 5 || i % 50 === 0) {
      console.log(`[BulkSeed] Processing ${i + 1}/${elite.length}: ${address} (${apn}) — score ${score.composite}`);
    }

    const ownerFlags: Record<string, unknown> = {
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      bulk_seed: true,
      last_enriched: new Date().toISOString(),
    };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .upsert({
        apn, county,
        address: fullAddr, city, state, zip,
        owner_name: ownerName,
        estimated_value: toNumber(pr.AVM) != null ? Math.round(toNumber(pr.AVM)!) : null,
        equity_percent: toNumber(pr.EquityPercent) ?? null,
        bedrooms: toInt(pr.Beds) ?? null,
        bathrooms: toNumber(pr.Baths) ?? null,
        sqft: toInt(pr.SqFt) ?? null,
        year_built: toInt(pr.YearBuilt) ?? null,
        lot_size: toInt(pr.LotSize) ?? null,
        property_type: pr.PType ?? null,
        owner_flags: ownerFlags,
        updated_at: new Date().toISOString(),
      }, { onConflict: "apn,county" })
      .select("id")
      .single();

    if (propErr || !property) {
      errored++;
      continue;
    }

    for (const signal of signals) {
      const fp = distressFingerprint(apn, county, signal.type, "propertyradar");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: evtErr } = await (sb.from("distress_events") as any).insert({
        property_id: property.id,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint: fp,
        raw_data: { detected_from: signal.detectedFrom, radar_id: pr.RadarID, bulk_seed: true },
        confidence: signal.severity >= 7 ? "0.900" : "0.600",
      });

      if (evtErr && isDuplicateError(evtErr)) eventsDeduped++;
      else if (evtErr) { /* skip */ }
      else eventsInserted++;
    }

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

    const predInput: PredictiveInput = {
      propertyId: property.id,
      ownerName,
      ownershipYears: null,
      lastSaleDate: pr.LastTransferRecDate ? String(pr.LastTransferRecDate) : null,
      lastSalePrice: toNumber(pr.LastTransferValue) ?? null,
      estimatedValue: toNumber(pr.AVM) ?? null,
      equityPercent: toNumber(pr.EquityPercent) ?? null,
      previousEquityPercent: null,
      equityDeltaMonths: null,
      totalLoanBalance: toNumber(pr.TotalLoanBalance) ?? null,
      isAbsentee: isTruthy(pr.isNotSameMailingOrExempt),
      absenteeSinceDate: null,
      isVacant: isTruthy(pr.isSiteVacant) || isTruthy(pr.isMailVacant),
      isCorporateOwner: false,
      isFreeClear: isTruthy(pr.isFreeAndClear),
      ownerAgeKnown: null,
      delinquentAmount: toNumber(pr.DelinquentAmount) ?? null,
      previousDelinquentAmount: null,
      delinquentYears: toNumber(pr.DelinquentYear) != null
        ? Math.max(new Date().getFullYear() - Number(pr.DelinquentYear), 0)
        : 0,
      taxAssessedValue: null,
      activeSignals: signals.map((s) => ({ type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent })),
      historicalScores: [],
      foreclosureStage: pr.ForeclosureStage ? String(pr.ForeclosureStage) : null,
      defaultAmount: toNumber(pr.DefaultAmount) ?? null,
      hasPhone: !!(pr.Phone1 || pr.Phone2),
      hasEmail: !!pr.Email,
      hasProbateSignal: signals.some((s) => s.type === "probate"),
      hasInheritedSignal: signals.some((s) => s.type === "inherited"),
    };

    const predOutput = computePredictiveScore(predInput);
    const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_predictions") as any)
      .insert(buildPredictionRecord(property.id, predOutput));

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
        notes: `Bulk Seed — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). ${signals.length} signal(s).`,
        promoted_at: new Date().toISOString(),
      });
      newInserts++;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: blendedScore, tags: signals.map((s) => s.type) })
        .eq("id", existingLead.id);
      updated++;
    }

    if (blendedScore > topScore) {
      topScore = blendedScore;
      topAddress = fullAddr;
    }
  }

  const elapsed = Date.now() - startTime;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "bulk_seed.complete",
    entity_type: "batch",
    entity_id: SOURCE_TAG,
    details: {
      counties,
      pull_limit: pullLimit,
      total_fetched: allResults.length,
      total_scored: candidates.length,
      above_cutoff: elite.length,
      new_inserts: newInserts,
      updated,
      errored,
      events_inserted: eventsInserted,
      events_deduped: eventsDeduped,
      top_score: topScore,
      elapsed_ms: elapsed,
    },
  });

  console.log(`[BulkSeed] === COMPLETE: ${newInserts} new, ${updated} updated, ${errored} errors in ${elapsed}ms ===`);

  return NextResponse.json({
    success: true,
    inserted: newInserts,
    updated,
    errored,
    totalFetched: allResults.length,
    totalScored: candidates.length,
    aboveCutoff: elite.length,
    eventsInserted,
    eventsDeduped,
    topScore,
    topAddress,
    counties,
    elapsed_ms: elapsed,
  });
}
