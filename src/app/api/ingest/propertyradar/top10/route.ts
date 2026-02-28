import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import {
  computePredictiveScore,
  buildPredictionRecord,
  blendHeatScore,
  type PredictiveInput,
} from "@/lib/scoring-predictive";
import type { DistressType } from "@/lib/types";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API = "https://api.propertyradar.com/v1/properties";
const SOURCE_TAG = "Manual_Top10_Elite_20260228";

// ── PropertyRadar response shape (matches parent route) ─────────────

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
  PhoneAvailability?: string;
  [key: string]: unknown;
}

interface ScoredCandidate {
  pr: PRProperty;
  score: ReturnType<typeof computeScore>;
  signals: DetectedSignal[];
}

/**
 * POST /api/ingest/propertyradar/top10
 *
 * One-time elite seed pull:
 * - Searches PropertyRadar for distressed absentee-owned properties in
 *   Spokane + Kootenai counties with >= 50% equity
 * - Pulls max 50 records (no phones/emails — save credits)
 * - Scores all 50 with Heat Score v1.1
 * - Keeps ONLY the top 10 where composite >= 75
 * - Inserts into properties + distress_events + scoring_records + leads
 */
export async function POST() {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  console.log("[Top10] === ELITE SEED PULL STARTED ===");
  const startTime = Date.now();

  // PropertyRadar criteria: Spokane + Kootenai, absentee, equity >= 50%,
  // distress signals (foreclosure, probate, tax delinquent, etc.)
  const criteria = [
    { name: "State", value: ["WA", "ID"] },
    { name: "County", value: ["Spokane", "Kootenai"] },
    { name: "isNotSameMailingOrExempt", value: ["1"] },
    { name: "EquityPercent", value: ["50", "100"] },
  ];

  // Fields we need — no phone/email to save credits
  const fields = [
    "RadarID", "APN", "Address", "FullAddress", "City", "State", "ZipFive", "County",
    "Owner", "Taxpayer", "PType", "SqFt", "Beds", "Baths", "YearBuilt", "LotSize",
    "AVM", "AvailableEquity", "EquityPercent", "TotalLoanBalance",
    "LastTransferValue", "LastTransferRecDate",
    "isDeceasedProperty", "isPreforeclosure", "inForeclosure", "inTaxDelinquency",
    "inDivorce", "inBankruptcyProperty", "isSiteVacant", "isMailVacant",
    "isNotSameMailingOrExempt", "isFreeAndClear", "isHighEquity", "isCashBuyer",
    "PropertyHasOpenLiens", "PropertyHasOpenPersonLiens",
    "ForeclosureStage", "ForeclosureRecDate", "DefaultAmount",
    "DelinquentYear", "DelinquentAmount",
  ].join(",");

  const url = `${PR_API}?Purchase=1&Limit=50&Fields=${fields}`;

  console.log("[Top10] Calling PropertyRadar:", url);
  console.log("[Top10] Criteria:", JSON.stringify(criteria));

  let prResponse: Response;
  try {
    prResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Criteria: criteria }),
    });
  } catch (err) {
    console.error("[Top10] Network error:", err);
    return NextResponse.json({ error: "Failed to reach PropertyRadar" }, { status: 502 });
  }

  const rawText = await prResponse.text();
  console.log("[Top10] PR response:", prResponse.status, rawText.slice(0, 500));

  if (!prResponse.ok) {
    return NextResponse.json({
      error: `PropertyRadar HTTP ${prResponse.status}`,
      detail: rawText.slice(0, 2000),
    }, { status: 502 });
  }

  let prData: { results?: PRProperty[]; resultCount?: number; totalCost?: string };
  try {
    prData = JSON.parse(rawText);
  } catch {
    return NextResponse.json({ error: "PropertyRadar returned non-JSON" }, { status: 502 });
  }

  const results = prData.results ?? [];
  console.log(`[Top10] Got ${results.length} raw results (cost: ${prData.totalCost ?? "?"}).`);

  if (results.length === 0) {
    return NextResponse.json({
      success: false,
      error: "PropertyRadar returned 0 results for elite criteria",
      criteria,
    }, { status: 404 });
  }

  // ── Score all candidates ──────────────────────────────────────────

  const candidates: ScoredCandidate[] = [];

  for (const pr of results) {
    if (!pr.APN) continue;

    const signals = detectDistressSignals(pr);
    const equityPct = toNumber(pr.EquityPercent) ?? 50;
    const avm = toNumber(pr.AVM) ?? 0;
    const loanBal = toNumber(pr.TotalLoanBalance) ?? 0;
    const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

    const input: ScoringInput = {
      signals: signals.map((s) => ({
        type: s.type,
        severity: s.severity,
        daysSinceEvent: s.daysSinceEvent,
      })),
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

    const score = computeScore(input);
    candidates.push({ pr, score, signals });
  }

  // ── Sort by composite DESC, keep top 10 where >= 75 ────────────

  candidates.sort((a, b) => b.score.composite - a.score.composite);
  const elite = candidates.filter((c) => c.score.composite >= 75).slice(0, 10);

  console.log(`[Top10] ${candidates.length} scored → ${elite.length} elite (>= 75)`);

  if (elite.length === 0) {
    return NextResponse.json({
      success: false,
      error: "No properties scored >= 75. Highest was " +
        (candidates[0]?.score.composite ?? 0) + ". Try loosening equity threshold.",
      totalScored: candidates.length,
      topScores: candidates.slice(0, 5).map((c) => ({
        address: c.pr.Address ?? c.pr.FullAddress,
        score: c.score.composite,
        label: c.score.label,
      })),
    });
  }

  // ── Insert elite into Supabase ────────────────────────────────────

  const sb = createServerClient();
  const inserted: { address: string; score: number; label: string; apn: string }[] = [];

  for (const { pr, score, signals } of elite) {
    const apn = pr.APN!;
    const county = normalizeCounty(pr.County ?? "Spokane");
    const address = pr.Address ?? pr.FullAddress ?? "";
    const city = pr.City ?? "";
    const state = pr.State ?? "WA";
    const zip = pr.ZipFive ?? "";
    const ownerName = pr.Owner ?? pr.Taxpayer ?? "Unknown Owner";

    const ownerFlags: Record<string, unknown> = {
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      pr_raw: pr,
      elite_seed: true,
    };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    // 1. Upsert property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .upsert({
        apn,
        county,
        address: `${address}${city ? ", " + city : ""}${state ? " " + state : ""}${zip ? " " + zip : ""}`.trim(),
        city,
        state,
        zip,
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
      console.error(`[Top10] Property upsert failed for ${apn}:`, propErr);
      continue;
    }

    // 2. Distress events (dedup by fingerprint)
    for (const signal of signals) {
      const fingerprint = createHash("sha256")
        .update(`${apn}:${county}:${signal.type}:propertyradar`)
        .digest("hex");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("distress_events") as any).insert({
        property_id: property.id,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint,
        raw_data: { detected_from: signal.detectedFrom, radar_id: pr.RadarID, elite_seed: true },
        confidence: signal.severity >= 7 ? "0.900" : "0.600",
      });
    }

    // 3. Scoring record (append-only)
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

    // 3b. Predictive scoring (v2.0)
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
      activeSignals: signals.map((s) => ({
        type: s.type,
        severity: s.severity,
        daysSinceEvent: s.daysSinceEvent,
      })),
      historicalScores: [],
      foreclosureStage: pr.ForeclosureStage ? String(pr.ForeclosureStage) : null,
      defaultAmount: toNumber(pr.DefaultAmount) ?? null,
    };

    const predOutput = computePredictiveScore(predInput);
    const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore);

    // Persist prediction (append-only)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_predictions") as any)
      .insert(buildPredictionRecord(property.id, predOutput));

    // 4. Lead (prospect, unassigned) — uses blended score
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id")
      .eq("property_id", property.id)
      .in("status", ["prospect", "lead"])
      .maybeSingle();

    if (!existingLead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id,
        status: "prospect",
        priority: blendedScore,
        source: SOURCE_TAG,
        tags: signals.map((s) => s.type),
        notes: `Elite Seed — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). Distress in ~${predOutput.daysUntilDistress}d (${predOutput.confidence}% conf). ${signals.length} signal(s). RadarID: ${pr.RadarID ?? "N/A"}`,
        promoted_at: new Date().toISOString(),
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: blendedScore, tags: signals.map((s) => s.type) })
        .eq("id", existingLead.id);
    }

    inserted.push({
      address: `${address}, ${city} ${state} ${zip}`.trim(),
      score: blendedScore,
      label: score.label,
      apn,
    });

    console.log(`[Top10] Inserted: ${address} — Score ${score.composite} (${score.label})`);
  }

  // 5. Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "elite_seed.top10",
    entity_type: "batch",
    entity_id: SOURCE_TAG,
    details: {
      total_fetched: results.length,
      total_scored: candidates.length,
      total_inserted: inserted.length,
      pr_cost: prData.totalCost,
      elapsed_ms: Date.now() - startTime,
      leads: inserted,
    },
  });

  console.log(`[Top10] === COMPLETE: ${inserted.length} elite prospects seeded in ${Date.now() - startTime}ms ===`);

  return NextResponse.json({
    success: true,
    message: `${inserted.length} elite prospects seeded into Sentinel`,
    source: SOURCE_TAG,
    totalFetched: results.length,
    totalScored: candidates.length,
    eliteInserted: inserted.length,
    prCost: prData.totalCost,
    leads: inserted,
    elapsed_ms: Date.now() - startTime,
  });
}

// ── Helpers (same as parent route) ──────────────────────────────────

function normalizeCounty(raw: string): string {
  if (!raw) return "Spokane";
  return raw.replace(/\s+county$/i, "").trim()
    .split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

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

interface DetectedSignal {
  type: DistressType;
  severity: number;
  daysSinceEvent: number;
  detectedFrom: string;
}

function detectDistressSignals(pr: PRProperty): DetectedSignal[] {
  const signals: DetectedSignal[] = [];

  if (isTruthy(pr.isDeceasedProperty)) {
    signals.push({ type: "probate", severity: 9, daysSinceEvent: 30, detectedFrom: "isDeceasedProperty" });
  }
  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure)) {
    const amt = toNumber(pr.DefaultAmount) ?? 0;
    signals.push({
      type: "pre_foreclosure",
      severity: amt > 50000 ? 9 : 7,
      daysSinceEvent: pr.ForeclosureRecDate ? daysBetween(pr.ForeclosureRecDate) : 30,
      detectedFrom: isTruthy(pr.isPreforeclosure) ? "isPreforeclosure" : "inForeclosure",
    });
  }
  if (isTruthy(pr.inTaxDelinquency)) {
    const amt = toNumber(pr.DelinquentAmount) ?? 0;
    signals.push({
      type: "tax_lien",
      severity: amt > 10000 ? 8 : 6,
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
      type: "vacant",
      severity: 5,
      daysSinceEvent: 60,
      detectedFrom: isTruthy(pr.isSiteVacant) ? "isSiteVacant" : "isMailVacant",
    });
  }
  if (isTruthy(pr.isNotSameMailingOrExempt)) {
    signals.push({ type: "absentee", severity: 4, daysSinceEvent: 90, detectedFrom: "isNotSameMailingOrExempt" });
  }
  if ((isTruthy(pr.PropertyHasOpenLiens) || isTruthy(pr.PropertyHasOpenPersonLiens)) && !signals.some((s) => s.type === "tax_lien")) {
    signals.push({ type: "tax_lien", severity: 5, daysSinceEvent: 90, detectedFrom: "PropertyHasOpenLiens" });
  }
  if (signals.length === 0) {
    signals.push({ type: "absentee", severity: 3, daysSinceEvent: 180, detectedFrom: "default_absentee" });
  }

  return signals;
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
