import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, getScoreLabel, getScoreLabelTag, SCORE_CUTOFFS, MIN_STORE_SCORE, type ScoringInput } from "@/lib/scoring";
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
import { COUNTY_FIPS } from "@/lib/attom";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API = "https://api.propertyradar.com/v1/properties";
const SOURCE_TAG = "EliteSeed_Top10_20260301";
const MAX_PR_PULL = 100;
const ELITE_CUTOFF = SCORE_CUTOFFS.platinum; // 85 — platinum
const STORE_CUTOFF = MIN_STORE_SCORE; // 30 — minimum to store
const ELITE_COUNT = 10;

const DEFAULT_COUNTIES = ["Spokane", "Kootenai"];

// ── Targeting Waterfall ───────────────────────────────────────────────
// Strategy: FREE & CLEAR properties only. Then layer distress on top.
//
// PHASE 1 — PLATINUM: Free & Clear + Absentee + Distress
//   Only distress signals that CAN exist on mortgage-free properties:
//   probate, tax delinquency, divorce, bankruptcy, vacant, liens.
//   (NOT foreclosure — that requires a mortgage to default on.)
//
// PHASE 2 — GOLD: Free & Clear + Absentee (no distress required)
//   Broadens to all F&C absentee owners. Still excellent leads —
//   no mortgage + owner lives elsewhere = low attachment.
//   Also F&C + distress without absentee requirement.
//
// PropertyRadar criteria are AND-based, so each lens is a separate
// API call. Results are deduped by APN across all lenses.

interface DistressLens {
  name: string;
  phase: 1 | 2;
  /** Extra criteria to add to the base State filter */
  criteria: { name: string; value: (string | number | boolean | string[] | number[])[] }[];
  /** How many records to pull for this lens */
  limit: number;
}

const DISTRESS_LENSES: DistressLens[] = [
  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1 — PLATINUM: Free & Clear + Absentee + Distress
  // Only distress signals valid on mortgage-free properties.
  // (NOT foreclosure — requires a mortgage to default on.)
  // ═══════════════════════════════════════════════════════════════════

  // 1a: F&C + Absentee + Probate/Deceased (highest severity — inherited)
  {
    name: "platinum_fc_probate",
    phase: 1,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isNotSameMailingOrExempt", value: [1] },
      { name: "isDeceasedProperty", value: [1] },
    ],
    limit: 20,
  },
  // 1b: F&C + Absentee + Tax Delinquent (owes taxes on free property)
  {
    name: "platinum_fc_tax",
    phase: 1,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isNotSameMailingOrExempt", value: [1] },
      { name: "inTaxDelinquency", value: [1] },
    ],
    limit: 20,
  },
  // 1c: F&C + Absentee + Vacant (nobody home, no mortgage, lives elsewhere)
  {
    name: "platinum_fc_vacant",
    phase: 1,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isNotSameMailingOrExempt", value: [1] },
      { name: "isSiteVacant", value: [1] },
    ],
    limit: 20,
  },
  // 1d: F&C + Absentee + Divorce
  {
    name: "platinum_fc_divorce",
    phase: 1,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isNotSameMailingOrExempt", value: [1] },
      { name: "inDivorce", value: [1] },
    ],
    limit: 15,
  },
  // 1e: F&C + Absentee + Bankruptcy
  {
    name: "platinum_fc_bankruptcy",
    phase: 1,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isNotSameMailingOrExempt", value: [1] },
      { name: "inBankruptcyProperty", value: [1] },
    ],
    limit: 15,
  },
  // 1f: F&C + Absentee + Open Liens (judgment liens, mechanic liens, etc.)
  {
    name: "platinum_fc_liens",
    phase: 1,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isNotSameMailingOrExempt", value: [1] },
      { name: "PropertyHasOpenLiens", value: [1] },
    ],
    limit: 15,
  },
  // 1g: DECEASED + TAX DELINQUENT (any mortgage status — highest-value combo)
  // Estate with unpaid taxes = heirs who don't want the burden.
  // No F&C requirement — even mortgaged properties with this combo convert.
  {
    name: "platinum_deceased_tax",
    phase: 1,
    criteria: [
      { name: "isDeceasedProperty", value: [1] },
      { name: "inTaxDelinquency", value: [1] },
    ],
    limit: 25,
  },
  // 1h: DECEASED + VACANT (abandoned estate — heirs walked away)
  {
    name: "platinum_deceased_vacant",
    phase: 1,
    criteria: [
      { name: "isDeceasedProperty", value: [1] },
      { name: "isSiteVacant", value: [1] },
    ],
    limit: 20,
  },

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2 — GOLD: Free & Clear + Distress (no absentee required)
  // Then F&C + Absentee as broad catch-all (no distress required).
  // ═══════════════════════════════════════════════════════════════════

  // 2a: F&C + Probate (no absentee required — still highly motivated)
  {
    name: "gold_fc_probate",
    phase: 2,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isDeceasedProperty", value: [1] },
    ],
    limit: 20,
  },
  // 2b: F&C + Tax Delinquent (no absentee required)
  {
    name: "gold_fc_tax",
    phase: 2,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "inTaxDelinquency", value: [1] },
    ],
    limit: 20,
  },
  // 2c: F&C + Vacant (no absentee required)
  {
    name: "gold_fc_vacant",
    phase: 2,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isSiteVacant", value: [1] },
    ],
    limit: 20,
  },
  // 2d: F&C + Divorce (no absentee required)
  {
    name: "gold_fc_divorce",
    phase: 2,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "inDivorce", value: [1] },
    ],
    limit: 15,
  },
  // 2e: F&C + Absentee (broad — no distress required, still excellent)
  {
    name: "gold_fc_absentee",
    phase: 2,
    criteria: [
      { name: "isFreeAndClear", value: [1] },
      { name: "isNotSameMailingOrExempt", value: [1] },
    ],
    limit: 25,
  },
];

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
 * GET /api/ingest/propertyradar/top10
 *
 * Returns the top 10 predictive leads from existing Supabase data.
 * No external API calls. Joins leads + properties + scoring_predictions.
 * Pass ?existingOnly=true to skip the count-based hint (always returns DB state).
 * Without that flag, response includes `needsSeed: true` when count < 10.
 */
export async function GET(_req: NextRequest) {
  const existingOnly = new URL(_req.url).searchParams.get("existingOnly") === "true";
  const sb = createServerClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads, error: leadsErr } = await (sb.from("leads") as any)
      .select("id, property_id, status, priority, tags, source, notes, properties(id, apn, address, city, state, county, owner_name, owner_phone, estimated_value, equity_percent)")
      .in("status", ["prospect", "lead"])
      .gte("priority", ELITE_CUTOFF)
      .order("priority", { ascending: false })
      .limit(50);

    if (leadsErr) {
      console.error("[Top10/GET] Leads query failed:", leadsErr);
      return NextResponse.json({ success: false, error: "Database query failed" }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        topScores: [],
        ...(!existingOnly ? { needsSeed: true } : {}),
        message: "No leads with blended score >= 75 found.",
      });
    }

    const propertyIds = leads.map((l: { property_id: string }) => l.property_id).filter(Boolean);

    // Fetch latest predictions for these properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: predictions } = await (sb.from("scoring_predictions") as any)
      .select("property_id, predictive_score, days_until_distress, confidence, owner_age_inference, life_event_probability")
      .in("property_id", propertyIds)
      .order("created_at", { ascending: false });

    const predMap: Record<string, {
      predictive_score: number;
      days_until_distress: number;
      confidence: number;
      owner_age_inference: number | null;
      life_event_probability: number | null;
    }> = {};
    if (predictions) {
      for (const p of predictions) {
        if (!predMap[p.property_id]) predMap[p.property_id] = p;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topScores = leads.slice(0, ELITE_COUNT).map((l: any) => {
      const prop = l.properties;
      const pred = predMap[l.property_id];
      const heirProb = pred?.life_event_probability != null ? Number(pred.life_event_probability) : null;

      return {
        id: l.id,
        apn: prop?.apn ?? "—",
        address: prop?.address ?? "—",
        owner_name: prop?.owner_name ?? "Unknown",
        county: prop?.county ?? "—",
        composite_score: l.priority,
        predictive_score: pred ? Number(pred.predictive_score) : null,
        days_until_distress: pred ? Number(pred.days_until_distress) : null,
        confidence: pred ? Number(pred.confidence) : null,
        heir_probability: heirProb != null ? Math.round(heirProb * 100) : null,
        owner_age_inference: pred?.owner_age_inference != null ? Number(pred.owner_age_inference) : null,
        bestPhone: prop?.owner_phone ?? null,
        estimated_value: prop?.estimated_value ?? null,
        equity_percent: prop?.equity_percent != null ? Number(prop.equity_percent) : null,
        tags: l.tags ?? [],
        source: l.source ?? "unknown",
      };
    });

    const needsSeed = !existingOnly && topScores.length < ELITE_COUNT;
    console.log(`[Top10/GET] Returning ${topScores.length} elite leads (needsSeed: ${needsSeed})`);

    return NextResponse.json({
      success: true,
      count: topScores.length,
      topScores,
      ...(needsSeed ? { needsSeed: true } : {}),
    });
  } catch (err) {
    console.error("[Top10/GET] Unexpected error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/ingest/propertyradar/top10
 *
 * Elite Seed pull — production-bulletproof:
 *  1. Accepts { counties: ["Spokane","Kootenai"] }
 *  2. PropertyRadar: counties + Absentee + Equity >= 50% + distress
 *  3. Pulls max 60 records (NO phones/emails — preserve credits)
 *  4. Scores all with v2.2 engine
 *  5. Sorts DESC → keeps top 10 where >= 75
 *  6. Upserts into properties (apn,county ON CONFLICT) + distress_events
 *     (fingerprint dedup) + scoring_records + leads
 *  7. Logs every APN to event_log
 *  8. Returns detailed summary with new/updated/skipped counts
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");

  // Allow cron secret OR authenticated Supabase user
  let authorized = false;
  if (cronSecret && bearerToken === cronSecret) {
    authorized = true;
  } else if (bearerToken) {
    const { data: { user } } = await sb.auth.getUser(bearerToken);
    authorized = !!user;
  } else {
    // No auth header at all — allow from same-origin (browser dashboard)
    // The dashboard calls this without auth headers via relative URL
    authorized = true;
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Convert county names to FIPS codes for PropertyRadar API
  const fipsCodes = counties
    .map((c) => COUNTY_FIPS[c] ?? COUNTY_FIPS[c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()])
    .filter(Boolean);

  console.log("[Top10] Counties:", counties, "States:", states, "FIPS:", fipsCodes);

  // ── 2. PropertyRadar fields ────────────────────────────────────────

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
    // Distress date fields — needed for stale signal detection
    "DeceasedDate", "BankruptcyRecDate", "DivorceRecDate", "SaleDate", "DefaultAsOf",
    "AssessedValue", "Owner2",
  ].join(",");

  // ── 3. Single Broad Pull + Client-Side Lens Filtering ──────────────
  // PropertyRadar restricts boolean fields (isFreeAndClear, isDeceasedProperty,
  // etc.) as search criteria on non-premium API tiers. Instead, we pull a broad
  // pool with only geo + equity filters, then apply each lens filter locally.
  // This is actually more efficient: 1 API call instead of 13.

  const PULL_LIMIT = 500; // Pull a large pool to filter through lenses
  const allRaw: PRProperty[] = [];
  let totalCost = "0";

  const geoCriteria = [
    { name: "State", value: states },
    ...(fipsCodes.length > 0 ? [{ name: "County", value: fipsCodes }] : []),
  ];

  // Page through results (200 per page)
  const PAGE_SIZE = 200;
  const pages = Math.ceil(PULL_LIMIT / PAGE_SIZE);
  let useCountyFilter = fipsCodes.length > 0;

  for (let page = 0; page < pages; page++) {
    const offset = page * PAGE_SIZE;
    const thisLimit = Math.min(PAGE_SIZE, PULL_LIMIT - offset);
    const url = `${PR_API}?Purchase=1&Limit=${thisLimit}&Start=${offset}&Fields=${fields}`;
    const criteria = [
      ...(useCountyFilter ? geoCriteria : [{ name: "State", value: states }]),
      { name: "EquityPercent", value: [[40, 100]] },
    ];

    console.log(`[Top10] Pulling page ${page + 1}/${pages} (limit ${thisLimit}, offset ${offset})`);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ Criteria: criteria }),
      });

      if (!resp.ok) {
        if (page === 0 && useCountyFilter && resp.status === 400) {
          console.warn(`[Top10] County filter rejected — retrying without County...`);
          useCountyFilter = false;
          page--; // Retry this page
          continue;
        }
        console.error(`[Top10] API error on page ${page}: HTTP ${resp.status}`);
        break;
      }

      const data = await resp.json();
      const props = data.results ?? [];
      allRaw.push(...props);
      totalCost = String(parseFloat(totalCost) + parseFloat(data.totalCost?.replace(/[^0-9.]/g, "") ?? "0"));
      console.log(`[Top10] Page ${page + 1}: ${props.length} properties (running total: ${allRaw.length})`);

      if (props.length < thisLimit) break; // No more results
    } catch (err) {
      console.error(`[Top10] Network error on page ${page}:`, String(err));
      break;
    }
  }

  console.log(`[Top10] Broad pull complete: ${allRaw.length} raw properties, cost: ${totalCost}`);

  if (allRaw.length === 0) {
    return NextResponse.json({
      success: false,
      error: "PropertyRadar returned 0 results. Check API key and credits.",
      counties,
      lensResults: [],
      phase1Count: 0,
    });
  }

  // ── Apply lens filters client-side ──────────────────────────────────
  // Each lens defines boolean fields that must be truthy on the property.
  // We map lens criteria names to PR response field checks.

  function matchesLens(pr: PRProperty, lens: DistressLens): boolean {
    for (const c of lens.criteria) {
      const field = c.name as keyof PRProperty;
      const val = pr[field];
      // PropertyRadar returns "Yes"/"No", 1/0, or true/false
      const truthy = val === "Yes" || val === 1 || val === true || val === "1";
      if (!truthy) return false;
    }
    return true;
  }

  const allResults: PRProperty[] = [];
  const seenApns = new Set<string>();
  const lensResults: { lens: string; phase: number; count: number; cost: string }[] = [];
  let staleSkipped = 0;

  // Stale signal detection — skip properties where distress resolved or > 3 years old
  const THREE_YEARS_MS = 3 * 365.25 * 86400000;
  function isStaleDistress(pr: PRProperty): boolean {
    const transferDate = (pr.LastTransferRecDate ?? (pr as any).SaleDate) as string | undefined;
    const transferMs = transferDate ? new Date(transferDate).getTime() : null;
    const now = Date.now();
    const distressDates = [
      (pr as any).DeceasedDate, pr.ForeclosureRecDate,
      (pr as any).BankruptcyRecDate, (pr as any).DivorceRecDate,
    ].filter(Boolean) as string[];
    for (const dd of distressDates) {
      const eventMs = new Date(dd).getTime();
      if (isNaN(eventMs)) continue;
      if (transferMs && transferMs > eventMs) return true;
      if (now - eventMs > THREE_YEARS_MS) return true;
    }
    if (pr.DelinquentYear) {
      const yearsAgo = new Date().getFullYear() - Number(pr.DelinquentYear);
      if (yearsAgo > 3) return true;
    }
    return false;
  }

  const phase1Lenses = DISTRESS_LENSES.filter((l) => l.phase === 1);
  const phase2Lenses = DISTRESS_LENSES.filter((l) => l.phase === 2);

  // Run Phase 1 lenses
  console.log(`[Top10] === PHASE 1: PLATINUM — filtering ${allRaw.length} properties through ${phase1Lenses.length} lenses ===`);
  for (const lens of phase1Lenses) {
    let count = 0;
    for (const pr of allRaw) {
      const apn = pr.APN;
      if (!apn || seenApns.has(apn)) continue;
      if (isStaleDistress(pr)) { staleSkipped++; continue; }
      if (matchesLens(pr, lens)) {
        seenApns.add(apn);
        allResults.push(pr);
        count++;
        if (count >= lens.limit) break;
      }
    }
    lensResults.push({ lens: lens.name, phase: lens.phase, count, cost: "0" });
    console.log(`[Top10] P1 Lens "${lens.name}": ${count} matches (limit ${lens.limit})`);
  }

  const phase1Count = allResults.length;
  console.log(`[Top10] Phase 1 complete: ${phase1Count} unique Platinum properties (${staleSkipped} stale skipped)`);

  // Run Phase 2 lenses if needed
  if (phase1Count < MAX_PR_PULL) {
    console.log(`[Top10] === PHASE 2: GOLD — ${phase2Lenses.length} lenses ===`);
    for (const lens of phase2Lenses) {
      let count = 0;
      for (const pr of allRaw) {
        const apn = pr.APN;
        if (!apn || seenApns.has(apn)) continue;
        if (isStaleDistress(pr)) { staleSkipped++; continue; }
        if (matchesLens(pr, lens)) {
          seenApns.add(apn);
          allResults.push(pr);
          count++;
          if (count >= lens.limit) break;
        }
      }
      lensResults.push({ lens: lens.name, phase: lens.phase, count, cost: "0" });
      console.log(`[Top10] P2 Lens "${lens.name}": ${count} matches (limit ${lens.limit})`);
    }
    console.log(`[Top10] Phase 2 complete: ${allResults.length - phase1Count} additional Gold properties`);
  }

  const results = allResults;
  console.log(`[Top10] All phases complete: ${results.length} filtered (from ${allRaw.length} raw). P1: ${phase1Count}, P2: ${results.length - phase1Count}`);
  console.log(`[Top10] Lens breakdown:`, lensResults);

  if (results.length === 0) {
    return NextResponse.json({
      success: false,
      error: `Pulled ${allRaw.length} properties but none matched lens criteria (F&C + Absentee + Distress). This may mean no matching properties exist in these counties.`,
      counties,
      lensResults,
      phase1Count: 0,
    });
  }

  // ── 4. Score all candidates ─────────────────────────────────────────

  const candidates: ScoredCandidate[] = [];

  for (const pr of results) {
    if (!pr.APN) continue;
    const detection = detectDistressSignals(pr);
    const signals = detection.signals;

    // MLS-listed properties cannot be wholesaled — skip entirely
    if (detection.isMLSListed) continue;

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
        elderly: detection.ownerAge !== null && detection.ownerAge >= 65,
        outOfState: detection.isOutOfState,
      },
      equityPercent: equityPct,
      compRatio: Math.min(compRatio, 3.0),
      historicalConversionRate: 0,
    };

    candidates.push({ pr, score: computeScore(input), signals });
  }

  // ── 5. Sort DESC → Score-label storage (v2.2) ─────────────────────
  //
  // Platinum (85+): Elite — agents work immediately (top 10 returned)
  // Gold (65-84): Strong — high-priority outreach
  // Silver (40-64): Moderate — nurture, monthly calls
  // Bronze (30-39): Watch — low priority but stored
  // <30: Discarded — not stored

  candidates.sort((a, b) => b.score.composite - a.score.composite);
  const elite = candidates.filter((c) => c.score.composite >= ELITE_CUTOFF).slice(0, ELITE_COUNT);
  const gold = candidates.filter((c) => c.score.composite >= SCORE_CUTOFFS.gold && c.score.composite < ELITE_CUTOFF);
  const rest = candidates.filter((c) => c.score.composite >= STORE_CUTOFF && c.score.composite < SCORE_CUTOFFS.gold);
  const allStorable = [...elite, ...gold, ...rest];

  console.log(`[Top10] ${candidates.length} scored → ${elite.length} platinum, ${gold.length} gold, ${rest.length} silver/bronze (${candidates.length - allStorable.length} discarded)`);

  if (allStorable.length === 0) {
    return NextResponse.json({
      success: false,
      error: `No properties scored >= ${STORE_CUTOFF}. Highest: ${candidates[0]?.score.composite ?? 0}.`,
      totalScored: candidates.length,
      topScores: candidates.slice(0, 5).map((c) => ({
        address: c.pr.Address ?? c.pr.FullAddress ?? "?",
        score: c.score.composite, label: c.score.label,
      })),
    });
  }

  // ── 6. Insert all scored prospects into Supabase ──────────────────

  const newInserts: { address: string; score: number; label: string; apn: string }[] = [];
  const updated: { address: string; score: number; apn: string }[] = [];
  const inserted: { address: string; score: number; label: string; apn: string }[] = [];
  const errors: string[] = [];
  let eventsInserted = 0;
  let eventsDeduped = 0;
  const labelCounts = { platinum: 0, gold: 0, silver: 0, bronze: 0 };

  for (let i = 0; i < allStorable.length; i++) {
    const { pr, score, signals } = allStorable[i];
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
    const fullAddr = [address, city, state, zip].filter(Boolean).join(", ");

    // ── Data quality gate: skip properties with no real address/owner ──
    const hasRealAddress = address.trim().length > 3;
    const hasRealOwner = ownerName !== "Unknown Owner" && ownerName.trim().length > 0;
    if (!hasRealAddress || !hasRealOwner) {
      console.log(`[Top10] SKIPPED ${apn}: no address or owner (addr="${address}", owner="${ownerName}")`);
      continue;
    }

    console.log(`[Top10] Processing ${i + 1}/${allStorable.length}: ${address} (${apn}) [${label}]`);

    const ownerFlags: Record<string, unknown> = {
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      pr_raw: pr,
      elite_seed: true,
      last_enriched: new Date().toISOString(),
      enrichment_pending: false,
      enrichment_status: "enriched",
      enrichment_completed_at: new Date().toISOString(),
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
        address, city, state, zip,
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
      isUnderwater: isTruthy(pr.isUnderwater),
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
      hasPhone: !!(pr.Phone1 || pr.Phone2),
      hasEmail: !!pr.Email,
      hasProbateSignal: signals.some((s) => s.type === "probate"),
      hasInheritedSignal: signals.some((s) => s.type === "inherited"),
    };

    const predOutput = computePredictiveScore(predInput);
    const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore, predOutput.confidence);

    // Persist prediction (append-only)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_predictions") as any)
      .insert(buildPredictionRecord(property.id, predOutput));

    // 4. Lead (prospect, unassigned) — uses blended score + score label tag
    const scoreLabelTag = `score-${label}`;
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
        notes: `Elite Seed [${label}] — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). Distress in ~${predOutput.daysUntilDistress}d (${predOutput.confidence}% conf). ${signals.length} signal(s). RadarID: ${pr.RadarID ?? "N/A"}`,
      });
      newInserts.push({ address: fullAddr, score: score.composite, label: score.label, apn });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ priority: blendedScore, tags: allTags })
        .eq("id", existingLead.id);
      updated.push({ address: fullAddr, score: score.composite, apn });
    }

    labelCounts[label as keyof typeof labelCounts]++;
    inserted.push({
      address: `${address}, ${city} ${state} ${zip}`.trim(),
      score: blendedScore,
      label: score.label,
      apn,
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
      pr_cost: totalCost,
      lensResults,
      elapsed_ms: elapsed,
    },
  });

  const allProspects = [...newInserts, ...updated.map((u) => ({ ...u, label: "updated" }))];
  console.log(`[Top10] === COMPLETE: ${newInserts.length} new, ${updated.length} updated, ${errors.length} errors in ${elapsed}ms ===`);
  console.log(`[Top10] Score breakdown: platinum=${labelCounts.platinum}, gold=${labelCounts.gold}, silver=${labelCounts.silver}, bronze=${labelCounts.bronze}`);

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
    scoreBreakdown: labelCounts,
    phaseBreakdown: {
      platinum: phase1Count,
      gold: results.length - phase1Count,
    },
    aboveCutoff: elite.length,
    topScore: elite[0]?.score.composite ?? 0,
    topAddress: elite[0]?.pr.Address ?? "—",
    prCost: totalCost,
    lensResults,
    elapsed_ms: elapsed,
    prospects: allProspects,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Distress Signal Detection — uses shared module from @/lib/distress-signals
