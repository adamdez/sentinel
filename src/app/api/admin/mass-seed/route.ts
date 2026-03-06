import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, getScoreLabel, getScoreLabelTag, MIN_STORE_SCORE, type ScoringInput } from "@/lib/scoring";
import {
  computePredictiveScore,
  buildPredictionRecord,
  blendHeatScore,
  type PredictiveInput,
} from "@/lib/scoring-predictive";
import {
  normalizeCounty, distressFingerprint, isDuplicateError,
  isTruthy, toNumber, toInt,
} from "@/lib/dedup";
import { detectDistressSignals, type DetectedSignal } from "@/lib/distress-signals";
import { COUNTY_FIPS } from "@/lib/attom";
import { isStaleDistress } from "@/app/api/ingest/propertyradar/bulk-seed/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — large pull

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API = "https://api.propertyradar.com/v1/properties";
const STORE_CUTOFF = MIN_STORE_SCORE; // 30
const SOURCE_TAG = "MassSeed_DeceasedTax_20260305";

const DEFAULT_COUNTIES = ["Spokane", "Kootenai"];
const COUNTY_STATE_MAP: Record<string, string> = {
  spokane: "WA", kootenai: "ID",
};

const PR_FIELDS = [
  "RadarID", "APN", "Address", "FullAddress", "City", "State", "ZipFive",
  "County", "Owner", "Owner2", "Taxpayer", "PType", "SqFt", "Beds", "Baths",
  "YearBuilt", "LotSize", "Latitude", "Longitude",
  "AVM", "AssessedValue", "AvailableEquity", "EquityPercent", "TotalLoanBalance",
  "LastTransferValue", "LastTransferRecDate", "SaleDate",
  "isDeceasedProperty", "isPreforeclosure", "inForeclosure",
  "inTaxDelinquency", "inDivorce", "inBankruptcyProperty",
  "isSiteVacant", "isMailVacant", "isNotSameMailingOrExempt",
  "isFreeAndClear", "isHighEquity", "isCashBuyer",
  "PropertyHasOpenLiens", "PropertyHasOpenPersonLiens",
  "ForeclosureStage", "ForeclosureRecDate", "DefaultAmount", "DefaultAsOf",
  "DelinquentYear", "DelinquentAmount",
  // DeceasedDate, BankruptcyRecDate, DivorceRecDate are NOT valid PR field names
  "Phone1", "Phone2", "Email", "PhoneAvailability", "EmailAvailability",
  "MailAddress", "MailCity", "MailState", "MailZip",
].join(",");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PRProperty = Record<string, any>;

/**
 * POST /api/admin/mass-seed
 *
 * Targeted mass pull: Deceased + Tax Delinquent properties only.
 * Both conditions must be true, <= 3 years old, no new owner since event.
 *
 * Auth: CRON_SECRET header.
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  const sb = createServerClient();
  const body = await req.json().catch(() => ({}));
  const counties: string[] = Array.isArray(body.counties) ? body.counties : DEFAULT_COUNTIES;
  const limitPerCounty = Math.min(toInt(body.limitPerCounty as string) ?? 1000, 1000);
  const startTime = Date.now();

  const debug = !!body.debug;
  console.log(`[MassSeed] === STARTED: Deceased+Tax, counties=[${counties}], limit=${limitPerCounty}/county ===`);

  // ── Pull from PropertyRadar per county ──────────────────────────────
  const allRaw: PRProperty[] = [];
  const debugInfo: string[] = [];

  for (const county of counties) {
    const fips = COUNTY_FIPS[county] ?? COUNTY_FIPS[county.charAt(0).toUpperCase() + county.slice(1).toLowerCase()];
    const state = COUNTY_STATE_MAP[county.toLowerCase()] ?? "WA";

    if (!fips) {
      console.warn(`[MassSeed] No FIPS code for county "${county}" — skipping`);
      continue;
    }

    const criteria = [
      { name: "State", value: [state] },
      { name: "County", value: [fips] },
      { name: "EquityPercent", value: [[40, 100]] },
      { name: "isDeceasedProperty", value: [1] },
      { name: "inTaxDelinquency", value: [1] },
    ];

    const PAGE_SIZE = 200;
    const pages = Math.ceil(limitPerCounty / PAGE_SIZE);
    let countyTotal = 0;

    for (let page = 0; page < pages; page++) {
      const offset = page * PAGE_SIZE;
      const thisLimit = Math.min(PAGE_SIZE, limitPerCounty - offset);
      const url = `${PR_API}?Purchase=1&Limit=${thisLimit}&Start=${offset}&Fields=${PR_FIELDS}`;

      const criteriaJson = JSON.stringify({ Criteria: criteria });
      console.log(`[MassSeed] ${county} page ${page + 1}/${pages} (limit ${thisLimit}, offset ${offset})`);
      if (debug) debugInfo.push(`${county} p${page + 1}: POST ${url} body=${criteriaJson.slice(0, 300)}`);

      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: criteriaJson,
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`[MassSeed] ${county} page ${page + 1} error (HTTP ${resp.status}): ${errText.slice(0, 200)}`);
          debugInfo.push(`${county} p${page + 1}: HTTP ${resp.status} — ${errText.slice(0, 200)}`);
          break;
        }

        const rawText = await resp.text();
        if (debug) debugInfo.push(`${county} p${page + 1}: response ${rawText.length} chars`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any;
        try { data = JSON.parse(rawText); } catch { debugInfo.push(`${county} p${page + 1}: JSON parse error`); break; }
        const records: PRProperty[] = Array.isArray(data) ? data : data.results ?? data.properties ?? [];

        if (records.length === 0) {
          console.log(`[MassSeed] ${county} page ${page + 1}: no more records`);
          break;
        }

        allRaw.push(...records);
        countyTotal += records.length;
        console.log(`[MassSeed] ${county} page ${page + 1}: ${records.length} records (${countyTotal} total for county)`);

        if (records.length < thisLimit) break; // Last page
      } catch (err) {
        console.error(`[MassSeed] ${county} page ${page + 1} fetch error:`, err);
        break;
      }
    }
  }

  console.log(`[MassSeed] Total raw records: ${allRaw.length}`);

  // ── Filter, score, insert ───────────────────────────────────────────
  let staleSkipped = 0;
  let valueCapSkipped = 0;
  let qualitySkipped = 0;
  let newInserts = 0;
  let updated = 0;
  let errored = 0;
  let eventsInserted = 0;
  let eventsDeduped = 0;
  let topScore = 0;
  let topAddress = "";
  const labelCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };

  for (let i = 0; i < allRaw.length; i++) {
    const pr = allRaw[i];
    if (!pr.APN) continue;

    // Stale signal check
    const staleCheck = isStaleDistress(pr as PRProperty);
    if (staleCheck.stale) {
      if (staleSkipped < 10) console.log(`[MassSeed] STALE: ${pr.APN} — ${staleCheck.reason}`);
      staleSkipped++;
      continue;
    }

    // Value cap
    const avm = toNumber(pr.AVM) ?? 0;
    if (avm > 450_000) { valueCapSkipped++; continue; }

    // Detect signals
    const detection = detectDistressSignals(pr);
    const signals = detection.signals;
    if (detection.isMLSListed) continue;

    const equityPct = toNumber(pr.EquityPercent) ?? 50;
    const loanBal = toNumber(pr.TotalLoanBalance) ?? 0;
    const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

    const input: ScoringInput = {
      signals: signals.map((s) => ({ type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent })),
      ownerFlags: {
        absentee: isTruthy(pr.isNotSameMailingOrExempt),
        corporate: false,
        inherited: isTruthy(pr.isDeceasedProperty),
        elderly: detection.ownerAge !== null && detection.ownerAge >= 65,
        outOfState: detection.isOutOfState,
      },
      equityPercent: equityPct,
      compRatio: Math.min(compRatio, 3.0),
      historicalConversionRate: 0,
    };

    const score = computeScore(input);
    if (score.composite < STORE_CUTOFF) continue;

    const label = getScoreLabel(score.composite);
    const apn = pr.APN;
    const county = normalizeCounty(pr.County ?? counties[0], "Spokane");
    const rawAddr = pr.Address ?? pr.FullAddress ?? "";
    const city = pr.City ?? "";
    const state = pr.State ?? "WA";
    const zip = pr.ZipFive ?? "";
    const ownerName = pr.Owner ?? pr.Taxpayer ?? "Unknown Owner";
    const address = (rawAddr.includes(",") && city && rawAddr.toLowerCase().includes(city.toLowerCase()))
      ? rawAddr.split(",")[0].trim()
      : rawAddr;

    // Data quality gate
    const hasRealAddress = address.trim().length > 3;
    const hasRealOwner = ownerName !== "Unknown Owner" && ownerName.trim().length > 0;
    const pType = (pr.PType ?? "").toString().toLowerCase();
    const isGovOrCommercial = /government|commercial|industrial|office|retail|church|school|hospital|public/.test(pType);

    if (!hasRealAddress || !hasRealOwner || isGovOrCommercial) {
      qualitySkipped++;
      continue;
    }

    if (i < 5 || i % 50 === 0) {
      console.log(`[MassSeed] ${i + 1}/${allRaw.length}: ${address} (${apn}) — score ${score.composite} [${label}]`);
    }

    // Build owner_flags
    // Merge with existing owner_flags to preserve signals from other imports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProp } = await (sb.from("properties") as any)
      .select("owner_flags").eq("apn", apn).eq("county", county).maybeSingle();
    const existingFlags = (existingProp?.owner_flags ?? {}) as Record<string, unknown>;

    const ownerFlags: Record<string, unknown> = {
      ...existingFlags,
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      mass_seed: true,
      mass_seed_lens: "deceased_tax",
      pr_raw: pr,
      last_enriched: new Date().toISOString(),
      tax_assessed_value: toNumber(pr.AssessedValue) != null ? Math.round(toNumber(pr.AssessedValue)!) : null,
    };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;

    const countyPhone = pr.Phone1 ?? pr.Phone2 ?? null;
    const countyEmail = pr.Email ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .upsert({
        apn, county,
        address, city, state, zip,
        owner_name: ownerName,
        owner_phone: countyPhone,
        owner_email: countyEmail,
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

    // Insert distress events
    for (const signal of signals) {
      const fp = distressFingerprint(apn, county, signal.type, "propertyradar");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: evtErr } = await (sb.from("distress_events") as any).insert({
        property_id: property.id,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint: fp,
        raw_data: { detected_from: signal.detectedFrom, radar_id: pr.RadarID, mass_seed: true },
        confidence: signal.severity >= 7 ? "0.900" : "0.600",
      });
      if (evtErr && isDuplicateError(evtErr)) eventsDeduped++;
      else if (!evtErr) eventsInserted++;
    }

    // Scoring records
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
    const det = detectDistressSignals(pr);
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
      isUnderwater: false,
      ownerAgeKnown: det.ownerAge,
      delinquentAmount: toNumber(pr.DelinquentAmount) ?? null,
      previousDelinquentAmount: null,
      delinquentYears: toNumber(pr.DelinquentYear) != null
        ? Math.max(new Date().getFullYear() - Number(pr.DelinquentYear), 0)
        : 0,
      taxAssessedValue: toNumber(pr.AssessedValue) ?? null,
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
    const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore, predOutput.confidence);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_predictions") as any)
      .insert(buildPredictionRecord(property.id, predOutput));

    // Create or update lead
    const scoreLabelTag = getScoreLabelTag(blendedScore);
    const signalTags = signals.map((s) => s.type);
    const allTags = [scoreLabelTag, ...signalTags];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id")
      .eq("property_id", property.id)
      .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
      .maybeSingle();

    if (!existingLead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id,
        status: "staging",
        priority: blendedScore,
        source: SOURCE_TAG,
        tags: allTags,
        notes: `Mass Seed [deceased+tax] [${label}] — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). ${signals.length} signal(s).`,
      });
      newInserts++;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: blendedScore, tags: allTags })
        .eq("id", existingLead.id);
      updated++;
    }

    labelCounts[label as keyof typeof labelCounts]++;
    if (blendedScore > topScore) {
      topScore = blendedScore;
      topAddress = [address, city, state, zip].filter(Boolean).join(", ");
    }
  }

  const elapsed = Date.now() - startTime;

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "mass_seed.complete",
    entity_type: "batch",
    entity_id: SOURCE_TAG,
    details: {
      counties,
      lens: "deceased_tax",
      total_fetched: allRaw.length,
      stale_skipped: staleSkipped,
      value_cap_skipped: valueCapSkipped,
      quality_skipped: qualitySkipped,
      new_inserts: newInserts,
      updated,
      errored,
      score_breakdown: labelCounts,
      events_inserted: eventsInserted,
      events_deduped: eventsDeduped,
      top_score: topScore,
      elapsed_ms: elapsed,
    },
  });

  console.log(`[MassSeed] === COMPLETE: ${newInserts} new, ${updated} updated, ${staleSkipped} stale, ${errored} errors in ${elapsed}ms ===`);

  return NextResponse.json({
    success: true,
    lens: "deceased_tax",
    counties,
    totalFetched: allRaw.length,
    staleSkipped,
    valueCapSkipped,
    qualitySkipped,
    inserted: newInserts,
    updated,
    errored,
    scoreBreakdown: labelCounts,
    eventsInserted,
    eventsDeduped,
    topScore,
    topAddress,
    elapsed_ms: elapsed,
    ...(debug ? { debugInfo } : {}),
  });
}
