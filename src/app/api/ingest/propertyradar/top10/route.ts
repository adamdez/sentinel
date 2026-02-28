import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import type { DistressType } from "@/lib/types";
import {
  normalizeCounty, distressFingerprint, isDuplicateError,
  isTruthy, toNumber, toInt, daysSince,
} from "@/lib/dedup";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API = "https://api.propertyradar.com/v1/properties";
const SOURCE_TAG = "EliteSeed_Top10_20260228";
const MAX_PR_PULL = 60;
const ELITE_CUTOFF = 75;
const ELITE_COUNT = 10;

const DEFAULT_COUNTIES = ["Spokane", "Kootenai"];

// ── PropertyRadar response shape ─────────────────────────────────────

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
  Latitude?: string;
  Longitude?: string;
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
 * Elite Seed pull — production-bulletproof:
 *  1. Accepts { counties: ["Spokane","Kootenai"] }
 *  2. PropertyRadar: counties + Absentee + Equity >= 50% + distress
 *  3. Pulls max 60 records (NO phones/emails — preserve credits)
 *  4. Scores all with v1.1 engine
 *  5. Sorts DESC → keeps top 10 where >= 75
 *  6. Upserts into properties (apn,county ON CONFLICT) + distress_events
 *     (fingerprint dedup) + scoring_records + leads
 *  7. Logs every APN to event_log
 *  8. Returns detailed summary with new/updated/skipped counts
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "PROPERTYRADAR_API_KEY not configured" },
      { status: 500 },
    );
  }

  const startTime = Date.now();
  console.log("[Top10] === ELITE SEED PULL STARTED ===");

  // ── 1. Parse body ───────────────────────────────────────────────────

  let counties: string[] = DEFAULT_COUNTIES;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.counties) && body.counties.length > 0) {
      counties = body.counties.map((c: unknown) => String(c));
    }
  } catch {
    // use defaults
  }

  const COUNTY_STATE_MAP: Record<string, string> = {
    spokane: "WA", kootenai: "ID", bonner: "ID", latah: "ID",
    whitman: "WA", lincoln: "WA", stevens: "WA",
  };
  const states = [...new Set(counties.map((c) => COUNTY_STATE_MAP[c.toLowerCase()] ?? "WA"))];

  console.log("[Top10] Counties:", counties, "States:", states);

  // ── 2. PropertyRadar criteria ───────────────────────────────────────

  const criteria = [
    { name: "State", value: states },
    { name: "County", value: counties },
    { name: "isNotSameMailingOrExempt", value: ["1"] },
    { name: "EquityPercent", value: ["50", "100"] },
  ];

  const fields = [
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

  const url = `${PR_API}?Purchase=1&Limit=${MAX_PR_PULL}&Fields=${fields}`;

  // ── 3. Call PropertyRadar ───────────────────────────────────────────

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
    return NextResponse.json(
      { success: false, error: "Failed to reach PropertyRadar — check network/VPN", detail: String(err) },
      { status: 502 },
    );
  }

  const rawText = await prResponse.text();

  if (!prResponse.ok) {
    console.error("[Top10] PR HTTP", prResponse.status, rawText.slice(0, 500));
    return NextResponse.json(
      { success: false, error: `PropertyRadar HTTP ${prResponse.status}`, detail: rawText.slice(0, 2000) },
      { status: 502 },
    );
  }

  let prData: { results?: PRProperty[]; resultCount?: number; totalCost?: string };
  try {
    prData = JSON.parse(rawText);
  } catch {
    return NextResponse.json(
      { success: false, error: "PropertyRadar returned non-JSON response", detail: rawText.slice(0, 500) },
      { status: 502 },
    );
  }

  const results = prData.results ?? [];
  console.log(`[Top10] Got ${results.length} raw results (cost: ${prData.totalCost ?? "?"})`);

  if (results.length === 0) {
    return NextResponse.json({
      success: false,
      error: "PropertyRadar returned 0 results. Try loosening equity % or adding counties.",
      counties, criteria,
    });
  }

  // ── 4. Score all candidates ─────────────────────────────────────────

  const candidates: ScoredCandidate[] = [];

  for (const pr of results) {
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

  // ── 5. Sort DESC, keep top 10 >= 75 ────────────────────────────────

  candidates.sort((a, b) => b.score.composite - a.score.composite);
  const elite = candidates.filter((c) => c.score.composite >= ELITE_CUTOFF).slice(0, ELITE_COUNT);

  console.log(`[Top10] ${candidates.length} scored → ${elite.length} elite (>= ${ELITE_CUTOFF})`);

  if (elite.length === 0) {
    return NextResponse.json({
      success: false,
      error: `No properties scored >= ${ELITE_CUTOFF}. Highest: ${candidates[0]?.score.composite ?? 0}.`,
      totalScored: candidates.length,
      topScores: candidates.slice(0, 5).map((c) => ({
        address: c.pr.Address ?? c.pr.FullAddress ?? "?",
        score: c.score.composite, label: c.score.label,
      })),
    });
  }

  // ── 6. Insert elite into Supabase ──────────────────────────────────

  const sb = createServerClient();

  const newInserts: { address: string; score: number; label: string; apn: string }[] = [];
  const updated: { address: string; score: number; apn: string }[] = [];
  const errors: string[] = [];
  let eventsInserted = 0;
  let eventsDeduped = 0;

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

    console.log(`[Top10] Processing ${i + 1}/${elite.length}: ${address} (${apn})`);

    const ownerFlags: Record<string, unknown> = {
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      pr_raw: pr,
      elite_seed: true,
      last_enriched: new Date().toISOString(),
    };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    // 6a. Upsert property — golden identity (apn, county) ON CONFLICT
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
      const msg = `Property upsert failed for ${apn} (${county}): ${propErr?.message ?? "no data returned"}`;
      console.error(`[Top10] ${msg}`);
      errors.push(msg);
      continue;
    }

    // 6b. Distress events — dedup via distressFingerprint()
    for (const signal of signals) {
      const fp = distressFingerprint(apn, county, signal.type, "propertyradar");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: evtErr } = await (sb.from("distress_events") as any).insert({
        property_id: property.id,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint: fp,
        raw_data: { detected_from: signal.detectedFrom, radar_id: pr.RadarID, elite_seed: true },
        confidence: signal.severity >= 7 ? "0.900" : "0.600",
      });

      if (evtErr && isDuplicateError(evtErr)) {
        eventsDeduped++;
      } else if (evtErr) {
        console.error(`[Top10] Event insert error (${signal.type}):`, evtErr.message);
      } else {
        eventsInserted++;
      }
    }

    // 6c. Scoring record (append-only, versioned)
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

    // 6d. Lead — check existing, create or update
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
        priority: score.composite,
        source: SOURCE_TAG,
        tags: signals.map((s) => s.type),
        notes: `Elite Seed — Score ${score.composite} (${score.label}). ${signals.length} signal(s). RadarID: ${pr.RadarID ?? "N/A"}`,
        promoted_at: new Date().toISOString(),
      });
      newInserts.push({ address: fullAddr, score: score.composite, label: score.label, apn });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: score.composite, tags: signals.map((s) => s.type), updated_at: new Date().toISOString() })
        .eq("id", existingLead.id);
      updated.push({ address: fullAddr, score: score.composite, apn });
    }

    // 6e. Per-APN audit log entry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: SYSTEM_USER_ID,
      action: "elite_seed.property",
      entity_type: "property",
      entity_id: property.id,
      details: {
        apn, county, address: fullAddr,
        score: score.composite, label: score.label,
        signals: signals.map((s) => s.type),
        is_new: !existingLead,
        source: SOURCE_TAG,
      },
    });
  }

  // ── 7. Batch audit log ─────────────────────────────────────────────

  const elapsed = Date.now() - startTime;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "elite_seed.batch_complete",
    entity_type: "batch",
    entity_id: SOURCE_TAG,
    details: {
      counties,
      total_fetched: results.length,
      total_scored: candidates.length,
      new_inserts: newInserts.length,
      updated: updated.length,
      errors: errors.length,
      events_inserted: eventsInserted,
      events_deduped: eventsDeduped,
      pr_cost: prData.totalCost,
      elapsed_ms: elapsed,
    },
  });

  const allProspects = [...newInserts, ...updated.map((u) => ({ ...u, label: "updated" }))];
  console.log(`[Top10] === COMPLETE: ${newInserts.length} new, ${updated.length} updated, ${errors.length} errors in ${elapsed}ms ===`);

  // ── 8. Detailed response ───────────────────────────────────────────

  return NextResponse.json({
    success: true,
    count: allProspects.length,
    newInserts: newInserts.length,
    updated: updated.length,
    errored: errors.length,
    eventsInserted,
    eventsDeduped,
    source: SOURCE_TAG,
    counties,
    totalFetched: results.length,
    totalScored: candidates.length,
    prCost: prData.totalCost,
    elapsed_ms: elapsed,
    prospects: allProspects,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Distress Signal Detection
// ═══════════════════════════════════════════════════════════════════════

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
