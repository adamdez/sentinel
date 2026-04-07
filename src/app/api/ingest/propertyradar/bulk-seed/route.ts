import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireUserOrCron } from "@/lib/api-auth";
import { computeScore, SCORING_MODEL_VERSION, getScoreLabel, getScoreLabelTag, MIN_STORE_SCORE, type ScoringInput } from "@/lib/scoring";
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
import { detectDistressSignals, type DetectedSignal } from "@/lib/distress-signals";
import { upsertContact } from "@/lib/upsert-contact";
import { deduplicateByProperty } from "@/lib/dedup-property";
import { COUNTY_FIPS } from "@/lib/attom";
import { resolveMarket } from "@/lib/market-resolver";
// runDualSkipTrace import removed — auto skip-trace disabled, agents trigger manually

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API = "https://api.propertyradar.com/v1/properties";
const STORE_CUTOFF = MIN_STORE_SCORE; // 30 — minimum to store
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
  "DelinquentYear", "DelinquentAmount", "NumberDelinquentInstallments",
  // Foreclosure stage fields
  "isAuction", "isBankOwned", "isUnderwater",
  // Composite signal fields (tired_landlord, owner age)
  "Units", "AdvancedPropertyType", "EstOwnerAge",
  // DeceasedDate, BankruptcyRecDate, DivorceRecDate are NOT valid PR field names
  "SaleDate", "DefaultAsOf", "AssessedValue", "Owner2",
  // Phone & email fields from county records
  "Phone1", "Phone2", "Email", "PhoneAvailability", "EmailAvailability",
  // Mailing address for contact tab
  "MailAddress", "MailCity", "MailState", "MailZip",
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

// ── Stale Signal Detection ────────────────────────────────────────────
// Filters out properties where distress events are old news:
//   1. Property transferred AFTER the distress event (new owner)
//   2. Distress event older than 3 years
//   3. Tax delinquency year 3+ years ago

const THREE_YEARS_MS = 3 * 365.25 * 86400000;

export function isStaleDistress(pr: PRProperty): { stale: boolean; reason?: string } {
  const transferDate = (pr.LastTransferRecDate ?? pr.SaleDate) as string | undefined;
  const transferMs = transferDate ? new Date(transferDate).getTime() : null;
  const now = Date.now();

  // Collect all distress dates with labels
  const distressDates: { label: string; date: string }[] = [];
  if (pr.DeceasedDate) distressDates.push({ label: "deceased", date: pr.DeceasedDate as string });
  if (pr.ForeclosureRecDate) distressDates.push({ label: "foreclosure", date: pr.ForeclosureRecDate as string });
  if (pr.BankruptcyRecDate) distressDates.push({ label: "bankruptcy", date: pr.BankruptcyRecDate as string });
  if (pr.DivorceRecDate) distressDates.push({ label: "divorce", date: pr.DivorceRecDate as string });

  for (const { label, date } of distressDates) {
    const eventMs = new Date(date).getTime();
    if (isNaN(eventMs)) continue;

    // Check 1: property transferred AFTER the distress event → new owner, signal resolved
    if (transferMs && transferMs > eventMs) {
      return { stale: true, reason: `${label}: transferred after event (${date})` };
    }

    // Check 2: distress event older than 3 years
    if (now - eventMs > THREE_YEARS_MS) {
      return { stale: true, reason: `${label}: older than 3 years (${date})` };
    }
  }

  // Check 3: tax delinquency year
  if (pr.DelinquentYear) {
    const yearsAgo = new Date().getFullYear() - Number(pr.DelinquentYear);
    if (yearsAgo > 3) {
      return { stale: true, reason: `tax delinquent year ${pr.DelinquentYear} (${yearsAgo}yr ago)` };
    }
  }

  return { stale: false };
}

/**
 * POST /api/ingest/propertyradar/bulk-seed
 *
 * Bulk pull from PropertyRadar.
 * Pulls up to `limit` records (default 1000, max 1000), scores all with
 * v2.0 deterministic + v2.1 predictive, inserts those with blended >= 75.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  // Parse body once up-front (stream can only be read once)
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const auth = await requireUserOrCron(req, sb);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "PROPERTYRADAR_API_KEY not configured" },
      { status: 500 },
    );
  }

  const requestedLimit = Math.min(Math.max(toInt(body.limit as string) ?? 1000, 1), 1000);
  // Pull 3x the requested amount — we filter for absentee client-side
  const pullLimit = Math.min(requestedLimit * 3, 1000);
  const counties: string[] = Array.isArray(body.counties) ? body.counties.map(String) : DEFAULT_COUNTIES;
  const states = [...new Set(counties.map((c) => COUNTY_STATE_MAP[c.toLowerCase()] ?? "WA"))];
  const distressLens = body.distressLens as string | undefined;

  // Convert county names to FIPS codes for PropertyRadar API
  const fipsCodes = counties
    .map((c) => COUNTY_FIPS[c] ?? COUNTY_FIPS[c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()])
    .filter(Boolean);

  // Distress lens → additional PropertyRadar criteria for targeted pulls
  const LENS_CRITERIA: Record<string, { name: string; value: unknown }[]> = {
    probate: [{ name: "isDeceasedProperty", value: [1] }],
    foreclosure: [{ name: "isPreforeclosure", value: [1] }],
    tax: [{ name: "inTaxDelinquency", value: [1] }],
    vacant: [{ name: "isSiteVacant", value: [1] }],
    divorce: [{ name: "inDivorce", value: [1] }],
    bankruptcy: [{ name: "inBankruptcyProperty", value: [1] }],
    absentee: [{ name: "isNotSameMailingOrExempt", value: [1] }],
    liens: [{ name: "PropertyHasOpenLiens", value: [1] }],
  };
  const extraCriteria = distressLens && LENS_CRITERIA[distressLens] ? LENS_CRITERIA[distressLens] : [];

  // ── Absentee-first philosophy ─────────────────────────────────────
  // Hard to buy a house from someone who lives in it. Absentee owners
  // see the property as a financial burden, not their home — much higher
  // conversion. EXCEPTION: deceased/probate (owner is dead — functionally
  // absentee even if mailing address matches the property).
  //
  // NOTE: isNotSameMailingOrExempt CANNOT be used as a PropertyRadar search
  // criterion on our API tier. Instead we pull 3x the limit and filter
  // for absentee client-side after the API call returns.
  const DECEASED_LENSES = ["probate"];
  const isDeceasedLens = distressLens ? DECEASED_LENSES.includes(distressLens) : false;
  const absenteeCriteria: { name: string; value: unknown }[] = []; // client-side filter now

  const startTime = Date.now();
  console.log(`[BulkSeed] === STARTED: limit=${pullLimit}, counties=[${counties}], fips=[${fipsCodes}]${distressLens ? `, lens=${distressLens}` : ""} ===`);

  // PropertyRadar pulls in pages of 200
  // Auto-fallback: if County criterion fails, retry with State-only
  const PAGE_SIZE = 200;
  const pages = Math.ceil(pullLimit / PAGE_SIZE);
  const allResults: PRProperty[] = [];
  let useCountyFilter = fipsCodes.length > 0;

  for (let page = 0; page < pages; page++) {
    const offset = page * PAGE_SIZE;
    const thisLimit = Math.min(PAGE_SIZE, pullLimit - offset);
    const url = `${PR_API}?Purchase=1&Limit=${thisLimit}&Start=${offset}&Fields=${PR_FIELDS}`;

    const criteria = [
      { name: "State", value: states },
      ...(useCountyFilter ? [{ name: "County", value: fipsCodes }] : []),
      { name: "EquityPercent", value: [[40, 100]] },
      ...absenteeCriteria,
      ...extraCriteria,
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
        // If County filter caused the error on first page, retry without it
        if (page === 0 && useCountyFilter) {
          const errText = await prRes.text();
          console.warn(`[BulkSeed] County filter rejected (HTTP ${prRes.status}): ${errText.slice(0, 200)} — retrying without County...`);
          useCountyFilter = false;

          const fallbackCriteria = [
            { name: "State", value: states },
            { name: "EquityPercent", value: [[40, 100]] },
            ...absenteeCriteria,
          ];
          const retryRes = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ Criteria: fallbackCriteria }),
          });

          if (!retryRes.ok) {
            console.error(`[BulkSeed] Fallback also failed (HTTP ${retryRes.status})`);
            break;
          }

          const retryData = await retryRes.json();
          const retryResults: PRProperty[] = retryData.results ?? [];
          allResults.push(...retryResults);
          console.log(`[BulkSeed] Fallback page 1/${pages}: ${retryResults.length} records (total: ${allResults.length}, cost: ${retryData.totalCost ?? "?"})`);
          if (retryResults.length < thisLimit) break;
          continue;
        }

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

  let staleSkipped = 0;
  for (const pr of allResults) {
    if (!pr.APN) continue;

    // Stale signal check — skip properties where distress is resolved or ancient
    const staleCheck = isStaleDistress(pr);
    if (staleCheck.stale) {
      staleSkipped++;
      continue;
    }

    const detection = detectDistressSignals(pr);
    const signals = detection.signals;

    // MLS-listed properties cannot be wholesaled — skip entirely
    if (detection.isMLSListed) continue;

    // Value cap — skip properties with AVM above $450K
    const avm = toNumber(pr.AVM) ?? 0;
    if (avm > 450_000) continue;

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

    candidates.push({ pr, score: computeScore(input), signals });
  }

  candidates.sort((a, b) => b.score.composite - a.score.composite);

  // ── Client-side absentee filter ───────────────────────────────────
  // Since PropertyRadar API won't let us filter by isNotSameMailingOrExempt
  // as a search criterion, we filter here. Deceased/probate are exempt.
  const absenteeFiltered = isDeceasedLens
    ? candidates // probate = functionally absentee, no filter needed
    : candidates.filter((c) => {
        // Keep if absentee OR deceased
        if (isTruthy(c.pr.isNotSameMailingOrExempt)) return true;
        if (isTruthy(c.pr.isDeceasedProperty)) return true;
        return false;
      });

  console.log(`[BulkSeed] ${allResults.length} fetched → ${staleSkipped} stale skipped → ${candidates.length} scored → ${absenteeFiltered.length} pass absentee filter (${candidates.length - absenteeFiltered.length} occupied-owner filtered out)`);

  const storable = absenteeFiltered.filter((c) => c.score.composite >= STORE_CUTOFF).slice(0, requestedLimit);
  const labelCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };

  console.log(`[BulkSeed] ${absenteeFiltered.length} absentee → ${storable.length} storable (>= ${STORE_CUTOFF}, capped at ${requestedLimit})`);

  // Insert all storable prospects into Supabase
  let newInserts = 0;
  let updated = 0;
  let errored = 0;
  let eventsInserted = 0;
  let eventsDeduped = 0;
  const skipTraced = 0;     // auto skip-trace disabled — kept for event_log schema compat
  const skipTraceErrors = 0;
  let topScore = 0;
  let topAddress = "";

  for (let i = 0; i < storable.length; i++) {
    const { pr, score, signals } = storable[i];
    const det = detectDistressSignals(pr);
    const label = getScoreLabel(score.composite);
    const apn = pr.APN!;
    const county = normalizeCounty(pr.County ?? counties[0], "Spokane");
    const rawAddr = pr.Address ?? pr.FullAddress ?? "";
    const city = pr.City ?? "";
    const state = pr.State ?? "WA";
    const zip = pr.ZipFive ?? "";
    const ownerName = pr.Owner ?? pr.Taxpayer ?? "Unknown Owner";
    // Store only street portion; city/state/zip live in their own columns
    const address = (rawAddr.includes(",") && city && rawAddr.toLowerCase().includes(city.toLowerCase()))
      ? rawAddr.split(",")[0].trim()
      : rawAddr;

    // ── Data quality gate: skip garbage records ──
    const hasRealAddress = address.trim().length > 3;
    const hasRealOwner = ownerName !== "Unknown Owner" && ownerName.trim().length > 0;
    const hasAPN = !!apn && apn.trim().length > 0;

    // Reject government/commercial properties — can't wholesale these
    const pType = (pr.PType ?? pr.PropertyType ?? "").toString().toLowerCase();
    const isGovOrCommercial = /government|commercial|industrial|office|retail|church|school|hospital|public/.test(pType);

    if (!hasRealAddress || !hasRealOwner || !hasAPN || isGovOrCommercial) {
      if (i < 10) console.log(`[BulkSeed] SKIPPED ${apn}: quality gate (addr="${address}", owner="${ownerName}", apn=${hasAPN}, type="${pType}")`);
      errored++;
      continue;
    }

    if (i < 5 || i % 50 === 0) {
      console.log(`[BulkSeed] Processing ${i + 1}/${storable.length}: ${address} (${apn}) — score ${score.composite} [${label}]`);
    }

    // Merge with existing owner_flags to preserve signals from other imports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProp } = await (sb.from("properties") as any)
      .select("owner_flags").eq("apn", apn).eq("county", county).maybeSingle();
    const existingFlags = (existingProp?.owner_flags ?? {}) as Record<string, unknown>;

    const ownerFlags: Record<string, unknown> = {
      ...existingFlags,
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      bulk_seed: true,
      pr_raw: pr, // Store full PR response for lat/lng, images, and future field access
      last_enriched: new Date().toISOString(),
    };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    // Extract phone/email from county records (PropertyRadar property-level data)
    const countyPhone = pr.Phone1 ?? pr.Phone2 ?? null;
    const countyEmail = pr.Email ?? null;

    // ── Property-level dedup: check if this property already exists ──
    const dedupResult = await deduplicateByProperty(sb, {
      address, apn, city, state, zip,
    });

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
      isUnderwater: isTruthy(pr.isUnderwater),
      ownerAgeKnown: det.ownerAge,
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
    const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore, predOutput.confidence);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_predictions") as any)
      .insert(buildPredictionRecord(property.id, predOutput));

    // ── Upsert contact (dedup by phone) ──────────────────────
    let contactId: string | null = null;
    if (countyPhone) {
      try {
        const nameParts = ownerName.includes(",")
          ? ownerName.split(",").map((p: string) => p.trim())
          : ownerName.split(/\s+/);
        const lastName = ownerName.includes(",") ? nameParts[0] : nameParts[nameParts.length - 1];
        const firstName = ownerName.includes(",") ? (nameParts[1] ?? "") : nameParts.slice(0, -1).join(" ");

        const contactResult = await upsertContact(sb, {
          phone: countyPhone,
          first_name: firstName || null,
          last_name: lastName || null,
          email: countyEmail,
          source: SOURCE_TAG,
          contact_type: "owner",
        });
        contactId = contactResult.id;
      } catch {
        // Non-fatal
      }
    }

    const scoreLabelTag = `score-${label}`;
    const signalTags = signals.map((s) => s.type);
    const allTags = [scoreLabelTag, ...signalTags];

    // ── Property-based dedup for lead creation ──────────────
    const existingLeadIds = dedupResult.existingLeadIds.length > 0
      ? [...dedupResult.existingLeadIds]
      : [];

    if (existingLeadIds.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingLead } = await (sb.from("leads") as any)
        .select("id")
        .eq("property_id", property.id)
        .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
        .maybeSingle();
      if (existingLead) existingLeadIds.push(existingLead.id);
    }

    if (existingLeadIds.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id,
        contact_id: contactId,
        status: "staging",
        priority: blendedScore,
        source: SOURCE_TAG,
        market: resolveMarket(county),
        tags: allTags,
        notes: `Bulk Seed [${label}] — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). ${signals.length} signal(s).`,
      });
      newInserts++;
    } else {
      // Merge into existing lead for this property
      const targetLeadId = existingLeadIds[0];
      const leadUpdate: Record<string, unknown> = {
        priority: blendedScore,
        tags: allTags,
        updated_at: new Date().toISOString(),
      };
      if (contactId) leadUpdate.contact_id = contactId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update(leadUpdate)
        .eq("id", targetLeadId);
      updated++;
    }

    // Auto skip-trace disabled — agents trigger manually via "Enrich" button in prospect folder
    // This conserves BatchData/PR credits ($0.07/call) for agent-initiated lookups only

    labelCounts[label as keyof typeof labelCounts]++;
    if (blendedScore > topScore) {
      topScore = blendedScore;
      topAddress = [address, city, state, zip].filter(Boolean).join(", ");
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
      above_cutoff: storable.length,
      score_breakdown: labelCounts,
      new_inserts: newInserts,
      updated,
      errored,
      events_inserted: eventsInserted,
      events_deduped: eventsDeduped,
      skip_traced: skipTraced,
      skip_trace_errors: skipTraceErrors,
      top_score: topScore,
      elapsed_ms: elapsed,
    },
  });

  console.log(`[BulkSeed] === COMPLETE: ${newInserts} new, ${updated} updated, ${errored} errors, ${skipTraced} skip-traced in ${elapsed}ms ===`);
  console.log(`[BulkSeed] Score breakdown: platinum=${labelCounts.platinum}, gold=${labelCounts.gold}, silver=${labelCounts.silver}, bronze=${labelCounts.bronze}`);
  console.log(`[BulkSeed] Skip-trace: disabled (agents trigger manually)`);

  return NextResponse.json({
    success: true,
    inserted: newInserts,
    updated,
    errored,
    totalFetched: allResults.length,
    staleSkipped,
    totalScored: candidates.length,
    aboveCutoff: storable.length,
    scoreBreakdown: labelCounts,
    eventsInserted,
    eventsDeduped,
    skipTraced,
    skipTraceErrors,
    topScore,
    topAddress,
    counties,
    elapsed_ms: elapsed,
  });
}
