import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, getScoreLabel, getScoreLabelTag, type ScoringInput } from "@/lib/scoring";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 min

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const PR_API_BASE = "https://api.propertyradar.com/v1";

// Same fields as bulk-seed — proven to work (no Phone1 which was problematic)
const PR_FIELDS = [
  "RadarID", "APN", "Address", "FullAddress", "City", "State", "ZipFive",
  "County", "Owner", "Owner2", "Taxpayer", "PType", "SqFt", "Beds", "Baths",
  "YearBuilt", "LotSize", "Latitude", "Longitude",
  "AVM", "AssessedValue", "AvailableEquity", "EquityPercent", "TotalLoanBalance",
  "LastTransferValue", "LastTransferRecDate", "SaleDate",
  "isDeceasedProperty", "isPreforeclosure", "inForeclosure",
  "inTaxDelinquency", "inDivorce", "inBankruptcyProperty",
  "isSiteVacant", "isMailVacant", "isNotSameMailingOrExempt",
  "isFreeAndClear", "isHighEquity", "isCashBuyer", "isListedForSale",
  "PropertyHasOpenLiens", "PropertyHasOpenPersonLiens",
  "ForeclosureStage", "ForeclosureRecDate", "DefaultAmount", "DefaultAsOf",
  "DelinquentYear", "DelinquentAmount",
  // MailAddress, MailCity, MailState, MailZip are NOT valid for list-based queries
].join(",");

const COUNTY_STATE_MAP: Record<string, string> = {
  spokane: "WA", kootenai: "ID", bonner: "ID", latah: "ID",
  whitman: "WA", lincoln: "WA", stevens: "WA",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PRProperty = Record<string, any>;

/**
 * POST /api/ingest/propertyradar/from-list
 *
 * Import all properties from a PropertyRadar saved list ("My Lists").
 *
 * Body:
 *   { listName: "Koot F&C Tax Deceased" }
 *   or
 *   { listId: 12345 }
 *
 * Auth: CRON_SECRET Bearer token.
 *
 * Flow:
 *   1. Resolve listName → ListID via GET /v1/lists (if listName provided)
 *   2. Fetch all properties using InList criterion via POST /v1/properties
 *   3. Score each property (deterministic + predictive)
 *   4. Upsert property + distress events + lead (in "staging" for enrichment batch)
 *   5. Enrichment batch cron picks up staging leads → deep crawl verify → auto-promote
 */
export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || bearerToken !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  const sb = createServerClient();
  const body = await req.json().catch(() => ({}));
  const startTime = Date.now();

  // ── Resolve List ───────────────────────────────────────────────────
  let listId: number | null = body.listId ? Number(body.listId) : null;
  const listName: string | null = body.listName ?? null;

  if (!listId && !listName) {
    return NextResponse.json({ error: "Provide listName or listId" }, { status: 400 });
  }

  // If only name provided, resolve to ListID
  if (!listId && listName) {
    console.log(`[FromList] Resolving list name: "${listName}"`);
    const listsUrl = `${PR_API_BASE}/lists?Fields=ListID,ListName,TotalCount&Limit=200`;
    const listsResp = await fetch(listsUrl, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });

    if (!listsResp.ok) {
      const errText = await listsResp.text();
      console.error(`[FromList] Lists API error (HTTP ${listsResp.status}): ${errText.slice(0, 200)}`);
      return NextResponse.json({ error: `Lists API error: HTTP ${listsResp.status}`, detail: errText.slice(0, 200) }, { status: 502 });
    }

    const listsData = await listsResp.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLists: any[] = listsData.results ?? listsData ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = allLists.find((l: any) =>
      (l.ListName ?? "").toLowerCase().trim() === listName.toLowerCase().trim()
    );

    if (!match) {
      console.log(`[FromList] List "${listName}" not found. Available lists: ${allLists.map((l: { ListName: string }) => l.ListName).join(", ")}`);
      return NextResponse.json({
        error: `List "${listName}" not found`,
        available: allLists.map((l: { ListName: string; TotalCount: number }) => ({ name: l.ListName, count: l.TotalCount })),
      }, { status: 404 });
    }

    listId = match.ListID;
    console.log(`[FromList] Resolved "${listName}" → ListID ${listId} (${match.TotalCount} properties)`);
  }

  // ── Fetch Properties using InList criterion ────────────────────────
  console.log(`[FromList] Fetching properties from list ${listId}...`);

  const allProperties: PRProperty[] = [];
  const PAGE_SIZE = 200;
  let offset = 0;

  // Paginate through the list
  for (let page = 0; page < 50; page++) { // safety cap at 50 pages (10,000 properties)
    const url = `${PR_API_BASE}/properties?Purchase=1&Limit=${PAGE_SIZE}&Start=${offset}&Fields=${PR_FIELDS}`;
    const criteria = { Criteria: [{ name: "InList", value: [String(listId)] }] };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(criteria),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[FromList] Properties API error page ${page} (HTTP ${resp.status}): ${errText.slice(0, 300)}`);
      if (allProperties.length === 0) {
        return NextResponse.json({ error: `PR API error: HTTP ${resp.status}`, detail: errText.slice(0, 300) }, { status: 502 });
      }
      break; // Use what we have
    }

    const data = await resp.json();
    const results = data.results ?? data ?? [];

    if (!Array.isArray(results) || results.length === 0) break;

    allProperties.push(...results);
    console.log(`[FromList] Page ${page + 1}: got ${results.length} (total so far: ${allProperties.length})`);

    if (results.length < PAGE_SIZE) break; // Last page
    offset += PAGE_SIZE;
  }

  if (allProperties.length === 0) {
    return NextResponse.json({ error: "No properties found in list", listId }, { status: 404 });
  }

  console.log(`[FromList] Fetched ${allProperties.length} properties from list ${listId}. Processing...`);

  // ── Process each property ──────────────────────────────────────────
  const sourceTag = `PRList_${listName ?? listId}_${new Date().toISOString().slice(0, 10)}`;
  let newInserts = 0;
  let updated = 0;
  let errored = 0;
  let eventsInserted = 0;
  let eventsDeduped = 0;
  let topScore = 0;
  let topAddress = "";

  for (let i = 0; i < allProperties.length; i++) {
    const pr = allProperties[i];

    const apn = pr.APN;
    if (!apn || String(apn).trim().length === 0) {
      errored++;
      continue;
    }

    const county = normalizeCounty(pr.County ?? "", "Unknown");
    const rawAddr = pr.Address ?? pr.FullAddress ?? "";
    const city = pr.City ?? "";
    const state = pr.State ?? COUNTY_STATE_MAP[county.toLowerCase()] ?? "WA";
    const zip = pr.ZipFive ?? "";
    const ownerName = pr.Owner ?? pr.Taxpayer ?? "Unknown Owner";

    // Clean address — strip city/state if included
    const address = (rawAddr.includes(",") && city && rawAddr.toLowerCase().includes(city.toLowerCase()))
      ? rawAddr.split(",")[0].trim()
      : rawAddr;

    // ── Data quality gate ──
    const hasRealAddress = address.trim().length > 3;
    const hasRealOwner = ownerName !== "Unknown Owner" && ownerName.trim().length > 0;
    if (!hasRealAddress || !hasRealOwner) {
      console.log(`[FromList] SKIPPED ${apn}: quality gate (addr="${address.slice(0, 30)}", owner="${ownerName.slice(0, 30)}")`);
      errored++;
      continue;
    }

    // ── Detect distress signals ──
    const detection = detectDistressSignals(pr);
    const signals = detection.signals;

    // ── Score ──
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

    const score = computeScore(input);
    const label = getScoreLabel(score.composite);

    // ── Merge owner_flags ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProp } = await (sb.from("properties") as any)
      .select("owner_flags").eq("apn", apn).eq("county", county).maybeSingle();
    const existingFlags = (existingProp?.owner_flags ?? {}) as Record<string, unknown>;

    const ownerFlags: Record<string, unknown> = {
      ...existingFlags,
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      pr_list_import: true,
      pr_list_name: listName ?? `list_${listId}`,
      pr_raw: pr,
      last_enriched: new Date().toISOString(),
      mls_listed: isTruthy(pr.isListedForSale),
    };
    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    // ── Upsert property ──
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
      console.error(`[FromList] Property upsert error for ${apn}:`, propErr?.message);
      errored++;
      continue;
    }

    // ── Insert distress events (dedup by fingerprint) ──
    for (const signal of signals) {
      const fp = distressFingerprint(apn, county, signal.type, "propertyradar");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: evtErr } = await (sb.from("distress_events") as any).insert({
        property_id: property.id,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint: fp,
        raw_data: {
          detected_from: signal.detectedFrom,
          radar_id: pr.RadarID,
          pr_list: listName ?? `list_${listId}`,
        },
        confidence: signal.severity >= 7 ? "0.900" : "0.600",
        status: "active",
        last_verified_at: new Date().toISOString(),
      });

      if (evtErr && isDuplicateError(evtErr)) eventsDeduped++;
      else if (evtErr) { /* skip */ }
      else eventsInserted++;
    }

    // ── Scoring records ──
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

    // ── Predictive scoring ──
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
      ownerAgeKnown: detection.ownerAge,
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
      hasPhone: false,
      hasEmail: false,
      hasProbateSignal: signals.some((s) => s.type === "probate"),
      hasInheritedSignal: signals.some((s) => s.type === "inherited"),
    };

    const predOutput = computePredictiveScore(predInput);
    const blendedScore = blendHeatScore(score.composite, predOutput.predictiveScore, predOutput.confidence);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_predictions") as any)
      .insert(buildPredictionRecord(property.id, predOutput));

    // ── Upsert lead (staging for enrichment batch) ──
    const scoreLabelTag = `score-${label}`;
    const signalTags = signals.map((s) => s.type);
    const allTags = [scoreLabelTag, ...signalTags];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id, priority")
      .eq("property_id", property.id)
      .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
      .maybeSingle();

    if (!existingLead) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).insert({
        property_id: property.id,
        status: "staging",
        priority: blendedScore,
        source: sourceTag,
        tags: allTags,
        notes: `PR List Import [${listName ?? listId}] — Heat ${blendedScore} (det:${score.composite} + pred:${predOutput.predictiveScore}). ${signals.length} signal(s). [${label}]`,
      });
      newInserts++;
    } else {
      // Update if new score is higher (signal accumulation)
      const newPriority = Math.max(blendedScore, existingLead.priority ?? 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({
          priority: newPriority,
          tags: allTags,
          notes: `PR List Import [${listName ?? listId}] — Heat ${newPriority} (updated). ${signals.length} signal(s). [${label}]`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLead.id);
      updated++;
    }

    if (blendedScore > topScore) {
      topScore = blendedScore;
      topAddress = [address, city, state, zip].filter(Boolean).join(", ");
    }

    console.log(`[FromList] ${i + 1}/${allProperties.length}: ${address} (${apn}) — score ${blendedScore} [${label}] ${signals.length} signals`);
  }

  // ── Audit log ──
  const elapsed = Date.now() - startTime;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "from_list.import",
    entity_type: "import",
    entity_id: `list_${listId}`,
    details: {
      list_id: listId,
      list_name: listName,
      source: sourceTag,
      total_fetched: allProperties.length,
      new_inserts: newInserts,
      updated,
      errored,
      events_inserted: eventsInserted,
      events_deduped: eventsDeduped,
      top_score: topScore,
      top_address: topAddress,
      elapsed_ms: elapsed,
    },
  });

  console.log(`[FromList] === COMPLETE: ${allProperties.length} fetched, ${newInserts} new + ${updated} updated, ${errored} errors, ${eventsInserted} events, ${elapsed}ms ===`);

  return NextResponse.json({
    success: true,
    listId,
    listName,
    source: sourceTag,
    total: allProperties.length,
    new: newInserts,
    updated,
    errored,
    events: { inserted: eventsInserted, deduped: eventsDeduped },
    topScore,
    topAddress,
    elapsed_ms: elapsed,
  });
}

/**
 * GET /api/ingest/propertyradar/from-list
 *
 * List all available PropertyRadar saved lists.
 * Useful for discovering list names and IDs.
 */
export async function GET(req: NextRequest) {
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || bearerToken !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.PROPERTYRADAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PROPERTYRADAR_API_KEY not configured" }, { status: 500 });
  }

  // Try with minimal params first, then with Fields
  const listsUrl = `${PR_API_BASE}/lists?Limit=200`;
  console.log(`[FromList:GET] Fetching lists from: ${listsUrl}`);

  const resp = await fetch(listsUrl, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[FromList:GET] Lists API error (HTTP ${resp.status}): ${errText.slice(0, 500)}`);
    return NextResponse.json({ error: `PR API error: HTTP ${resp.status}`, detail: errText.slice(0, 500) }, { status: 502 });
  }

  const rawText = await resp.text();
  console.log(`[FromList:GET] Raw response (${rawText.length} chars): ${rawText.slice(0, 500)}`);

  let data;
  try { data = JSON.parse(rawText); } catch { return NextResponse.json({ error: "JSON parse error", raw: rawText.slice(0, 500) }, { status: 502 }); }

  // Handle various response shapes
  const lists = Array.isArray(data) ? data : (data.results ?? data.items ?? data.Lists ?? []);
  console.log(`[FromList:GET] Parsed ${lists.length} lists. Keys in response: ${Object.keys(data).join(", ")}`);

  return NextResponse.json({
    _raw_keys: Object.keys(data),
    _raw_sample: JSON.stringify(data).slice(0, 500),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lists: Array.isArray(lists) ? lists.map((l: any) => ({
      id: l.ListID ?? l.listId ?? l.id,
      name: l.ListName ?? l.listName ?? l.name,
      count: l.TotalCount ?? l.totalCount ?? l.count,
      type: l.ListType ?? l.listType ?? l.type,
    })) : [],
  });
}
