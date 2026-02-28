import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput } from "@/lib/scoring";
import type { DistressType } from "@/lib/types";
import { distressFingerprint, normalizeCounty as globalNormalizeCounty, isDuplicateError } from "@/lib/dedup";

type SbResult<T> = { data: T | null; error: { code?: string; message: string } | null };

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

// PropertyRadar API base
const PR_API_BASE = "https://api.propertyradar.com/v1/properties";

// ── PropertyRadar API response types ──────────────────────────────────

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
  Owner2?: string;
  Latitude?: string;
  Longitude?: string;
  PType?: string;
  AdvancedPropertyType?: string;
  SqFt?: string | number;
  Beds?: string | number;
  Baths?: string | number;
  YearBuilt?: string | number;
  LotSize?: number;
  LotSizeAcres?: number;
  Units?: number;
  Stories?: number;
  AVM?: number | string;
  AssessedValue?: number | string;
  AvailableEquity?: number | string;
  EquityPercent?: string | number;
  TotalLoanBalance?: number | string;
  LastTransferValue?: number | string;
  LastTransferRecDate?: string;
  LastTransferType?: string;
  isSiteVacant?: string | boolean | number;
  isMailVacant?: string | boolean | number;
  isSameMailingOrExempt?: string | boolean | number;
  isNotSameMailingOrExempt?: string | boolean | number;
  isFreeAndClear?: string | boolean | number;
  isHighEquity?: string | boolean | number;
  isUnderwater?: string | boolean | number;
  isCashBuyer?: string | boolean | number;
  isDeceasedProperty?: string | boolean | number;
  isPreforeclosure?: string | boolean | number;
  isAuction?: string | boolean | number;
  isBankOwned?: string | boolean | number;
  isListedForSale?: string | boolean | number;
  isRecentSale?: string | boolean | number;
  isRecentFlip?: string | boolean | number;
  inTaxDelinquency?: string | boolean | number;
  inForeclosure?: string | boolean | number;
  inDivorce?: string | boolean | number;
  inBankruptcyProperty?: string | boolean | number;
  PropertyHasOpenPersonLiens?: string | boolean | number;
  PropertyHasOpenLiens?: string | boolean | number;
  ForeclosureStage?: string;
  ForeclosureRecDate?: string;
  SaleDate?: string;
  DefaultAmount?: number | string;
  DefaultAsOf?: string;
  DelinquentYear?: number | string;
  DelinquentAmount?: number | string;
  NumberDelinquentInstallments?: number | string;
  Taxpayer?: string;
  PhoneAvailability?: string;
  EmailAvailability?: string;
  Subdivision?: string;
  Persons?: unknown;
  Transactions?: unknown;
  [key: string]: unknown;
}

interface PRApiResponse {
  results?: PRProperty[];
  resultCount?: number;
  totalResultCount?: number;
  totalCost?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// ── Request body ──────────────────────────────────────────────────────

interface IngestRequest {
  address?: string;
  apn?: string;
  county?: string;
  state?: string;
  city?: string;
  zip?: string;
  radarId?: string;
}

/**
 * POST /api/ingest/propertyradar
 *
 * Single-property ingestion from PropertyRadar.
 *
 * 1. Calls PropertyRadar API to fetch full property data
 * 2. Normalizes into properties table (APN golden record upsert)
 * 3. Detects distress signals from the response data
 * 4. Runs the full Sentinel AI scoring engine (v1.1)
 * 5. Inserts into leads table at "prospect" stage (unassigned)
 * 6. Appends audit log entry
 *
 * Domain boundaries respected:
 *   Signal Domain → property upsert + distress events
 *   Scoring Domain → scoring_records insert
 *   Promotion Domain → lead creation at prospect
 *
 * Charter invariants:
 *   - APN + county = immutable property identity
 *   - Distress events append-only, deduped by fingerprint
 *   - Scoring records append-only, versioned
 *   - Idempotent upserts (no SELECT-then-INSERT)
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const cronAuth = request.headers.get("authorization");
  if (cronSecret && cronAuth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("=== PROPERTYRADAR ENDPOINT HIT ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("API Key configured:", !!process.env.PROPERTYRADAR_API_KEY, "Length:", process.env.PROPERTYRADAR_API_KEY?.length || 0);

  const startTime = Date.now();
  const debugLog: string[] = [];

  function log(msg: string, data?: unknown) {
    const entry = data ? `${msg} ${JSON.stringify(data)}` : msg;
    debugLog.push(`[${Date.now() - startTime}ms] ${entry}`);
    console.log(`[PropertyRadar] ${entry}`);
  }

  function logError(msg: string, err?: unknown) {
    const stack = err instanceof Error ? err.stack ?? err.message : String(err ?? "");
    const entry = `ERROR: ${msg} ${stack}`;
    debugLog.push(`[${Date.now() - startTime}ms] ${entry}`);
    console.error(`[PropertyRadar] ${entry}`);
  }

  try {
    // ── 0. Validate API key ──────────────────────────────────────────

    const apiKey = process.env.PROPERTYRADAR_API_KEY;
    log("Step 0 — API key check", {
      present: !!apiKey,
      length: apiKey?.length ?? 0,
      prefix: apiKey ? apiKey.slice(0, 8) + "..." : "MISSING",
      hasWhitespace: apiKey ? apiKey !== apiKey.trim() : false,
      hasCurlyBraces: apiKey ? apiKey.includes("{") || apiKey.includes("}") : false,
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: "PROPERTYRADAR_API_KEY not configured in environment", debugLog },
        { status: 500 }
      );
    }

    if (apiKey.includes("{") || apiKey.includes("}")) {
      log("WARNING: API key contains curly braces — this is likely wrong. The key should be the raw token, not wrapped in {}");
    }

    // ── 1. Parse + validate request body ─────────────────────────────

    let body: IngestRequest;
    try {
      body = await request.json();
      log("Step 1 — Request body received", body);
    } catch (parseErr) {
      logError("Step 1 — Failed to parse request body as JSON", parseErr);
      return NextResponse.json(
        { error: "Invalid JSON in request body", debugLog },
        { status: 400 }
      );
    }

    if (!body.address && !body.apn && !body.radarId) {
      log("Step 1 — REJECTED: no address, apn, or radarId provided");
      return NextResponse.json(
        { error: "Provide 'address', 'apn', or 'radarId' in the request body", debugLog },
        { status: 400 }
      );
    }

    // ── 2. If we have a RadarID, use the direct GET endpoint ─────────

    if (body.radarId) {
      log("Step 2a — Using direct RadarID lookup", { radarId: body.radarId });
      return await fetchByRadarId(apiKey, body.radarId);
    }

    // ── 3. Build PropertyRadar criteria array ────────────────────────

    const criteria: { name: string; value: (string | number)[] }[] = [];

    if (body.apn) {
      criteria.push({ name: "APN", value: [body.apn] });
      log("Step 3 — Added APN criterion", { apn: body.apn });
    }

    if (body.address) {
      const parsed = parseAddress(body.address);
      log("Step 3 — Parsed address", { input: body.address, parsed });

      criteria.push({ name: "Address", value: [parsed.street] });

      if (parsed.city || body.city) {
        criteria.push({ name: "City", value: [parsed.city || body.city!] });
      }
      if (parsed.state || body.state) {
        criteria.push({ name: "State", value: [parsed.state || body.state!] });
      }
      if (parsed.zip || body.zip) {
        criteria.push({ name: "ZipFive", value: [parsed.zip || body.zip!] });
      }
    } else {
      if (body.state) criteria.push({ name: "State", value: [body.state] });
      if (body.city) criteria.push({ name: "City", value: [body.city] });
      if (body.zip) criteria.push({ name: "ZipFive", value: [body.zip] });
    }

    log("Step 3 — Final criteria array", criteria);

    if (criteria.length === 0) {
      log("Step 3 — REJECTED: empty criteria");
      return NextResponse.json(
        { error: "Could not build search criteria from provided inputs", debugLog },
        { status: 400 }
      );
    }

    // ── 4. Call PropertyRadar POST /v1/properties ────────────────────

    const prUrl = `${PR_API_BASE}?Purchase=1&Limit=1&Fields=All`;
    const prBody = { Criteria: criteria };

    log("Step 4 — Calling PropertyRadar API", {
      url: prUrl,
      method: "POST",
      bodyBeingSent: prBody,
      authHeader: `Bearer ${apiKey.slice(0, 8)}...`,
    });

    let prResponse: Response;
    try {
      prResponse = await fetch(prUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(prBody),
      });
    } catch (fetchErr) {
      logError("Step 4 — fetch() threw an exception (network error?)", fetchErr);
      return NextResponse.json(
        { error: "Failed to connect to PropertyRadar API", debugLog },
        { status: 502 }
      );
    }

    log("Step 4 — Response received", {
      status: prResponse.status,
      statusText: prResponse.statusText,
      contentType: prResponse.headers.get("content-type"),
    });

    let prRawText: string;
    try {
      prRawText = await prResponse.text();
    } catch (textErr) {
      logError("Step 4 — Failed to read response body as text", textErr);
      return NextResponse.json(
        { error: "Could not read PropertyRadar response body", debugLog },
        { status: 502 }
      );
    }

    log("Step 4 — Raw response body (first 3000 chars)", prRawText.slice(0, 3000));

    if (!prResponse.ok) {
      logError(`Step 4 — PropertyRadar returned HTTP ${prResponse.status}`);
      return NextResponse.json(
        {
          error: "PropertyRadar API request failed",
          httpStatus: prResponse.status,
          httpStatusText: prResponse.statusText,
          rawResponse: prRawText.slice(0, 2000),
          criteria,
          debugLog,
        },
        { status: 502 }
      );
    }

    let prData: PRApiResponse;
    try {
      prData = JSON.parse(prRawText);
    } catch (jsonErr) {
      logError("Step 4 — PropertyRadar returned non-JSON", jsonErr);
      return NextResponse.json(
        {
          error: "PropertyRadar returned non-JSON response",
          rawResponse: prRawText.slice(0, 2000),
          debugLog,
        },
        { status: 502 }
      );
    }

    log("Step 4 — Parsed response summary", {
      resultCount: prData.resultCount ?? "N/A",
      totalResultCount: prData.totalResultCount ?? "N/A",
      totalCost: prData.totalCost ?? "N/A",
      hasResults: !!prData.results,
      resultsLength: prData.results?.length ?? 0,
      topLevelKeys: Object.keys(prData),
      message: prData.message ?? "none",
      error: prData.error ?? "none",
    });

    // ── 5. Extract the property from results ─────────────────────────

    const prProperty = prData.results?.[0] ?? null;

    if (!prProperty) {
      log("Step 5 — NO PROPERTY FOUND in results");
      return NextResponse.json(
        {
          error: "No property found matching the criteria",
          criteria,
          propertyRadarResponse: {
            resultCount: prData.resultCount ?? 0,
            totalResultCount: prData.totalResultCount ?? 0,
            message: prData.message ?? null,
            error: prData.error ?? null,
            totalCost: prData.totalCost ?? null,
          },
          rawResponsePreview: prRawText.slice(0, 1000),
          debugLog,
          possibleFixes: [
            "Ensure the address exists in PropertyRadar's coverage area (they cover all US)",
            "Try searching by APN instead: { \"apn\": \"014-1234-006-02\" }",
            "Try explicit split: { \"address\": \"15807 S Keeney Rd\", \"city\": \"Spokane\", \"state\": \"WA\", \"zip\": \"99224\" }",
            "Check PropertyRadar account has API credits/exports remaining",
            "Make sure API key is the raw token (no curly braces, no quotes around it)",
            "Verify the address matches county assessor records (PropertyRadar uses assessor data)",
          ],
        },
        { status: 404 }
      );
    }

    log("Step 5 — Property found!", {
      RadarID: prProperty.RadarID,
      APN: prProperty.APN,
      Address: prProperty.Address ?? prProperty.FullAddress,
      City: prProperty.City,
      State: prProperty.State,
      ZipFive: prProperty.ZipFive,
      County: prProperty.County,
      Owner: prProperty.Owner,
      AVM: prProperty.AVM,
      EquityPercent: prProperty.EquityPercent,
      AvailableEquity: prProperty.AvailableEquity,
      isDeceasedProperty: prProperty.isDeceasedProperty,
      inForeclosure: prProperty.inForeclosure,
      inTaxDelinquency: prProperty.inTaxDelinquency,
      inDivorce: prProperty.inDivorce,
      inBankruptcyProperty: prProperty.inBankruptcyProperty,
      isPreforeclosure: prProperty.isPreforeclosure,
      isSiteVacant: prProperty.isSiteVacant,
      isNotSameMailingOrExempt: prProperty.isNotSameMailingOrExempt,
    });

    // ── 6. Normalize fields ──────────────────────────────────────────

    const apn = prProperty.APN ?? body.apn ?? "";
    if (!apn) {
      log("Step 6 — No APN found, cannot create golden record");
      return NextResponse.json(
        { error: "PropertyRadar returned no APN — cannot create golden record", radarId: prProperty.RadarID, debugLog },
        { status: 422 }
      );
    }

    const county = globalNormalizeCounty(prProperty.County ?? body.county ?? "", "Unknown");
    const address = prProperty.Address ?? prProperty.FullAddress ?? body.address ?? "";
    const city = prProperty.City ?? "";
    const state = prProperty.State ?? "AZ";
    const zip = prProperty.ZipFive ?? "";
    const ownerName = prProperty.Owner ?? prProperty.Taxpayer ?? "Unknown Owner";

    log("Step 6 — Normalized fields", { apn, county, address, city, state, zip, ownerName });

    // ── 7. Detect distress signals from PR boolean flags + data ──────

    const signals = detectDistressSignals(prProperty);
    log("Step 7 — Distress signals detected", {
      count: signals.length,
      signals: signals.map((s) => `${s.type}(sev:${s.severity}, from:${s.detectedFrom})`),
    });

    // ── 8. Upsert property (APN golden record) ──────────────────────
    // Schema: id, apn, county, address, city, state, zip, owner_name,
    //   owner_phone, owner_email, estimated_value (INTEGER), equity_percent (NUMERIC 5,2),
    //   bedrooms, bathrooms, sqft, year_built, lot_size, property_type,
    //   owner_flags (JSONB), created_at, updated_at
    // NOTE: There is NO raw_data column — PR data goes into owner_flags JSONB.

    const sb = createServerClient();
    log("Step 8a — Supabase service-role client created");

    const ownerFlags: Record<string, unknown> = { source: "propertyradar", last_enriched: new Date().toISOString() };
    if (isTruthy(prProperty.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(prProperty.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(prProperty.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(prProperty.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(prProperty.isCashBuyer)) ownerFlags.cashBuyer = true;
    ownerFlags.source = "propertyradar";
    ownerFlags.radar_id = prProperty.RadarID ?? null;
    ownerFlags.pr_raw = prProperty;

    const estimatedValue = toNumber(prProperty.AVM);
    const equityPercent = toNumber(prProperty.EquityPercent);

    const propertyRow = {
      apn,
      county,
      address: `${address}${city ? ", " + city : ""}${state ? " " + state : ""}${zip ? " " + zip : ""}`.trim(),
      city,
      state,
      zip,
      owner_name: ownerName,
      owner_phone: prProperty.PhoneAvailability === "Available" ? null : null,
      owner_email: null as string | null,
      estimated_value: estimatedValue != null ? Math.round(estimatedValue) : null,
      equity_percent: equityPercent ?? null,
      bedrooms: toInt(prProperty.Beds) ?? null,
      bathrooms: toNumber(prProperty.Baths) ?? null,
      sqft: toInt(prProperty.SqFt) ?? null,
      year_built: toInt(prProperty.YearBuilt) ?? null,
      lot_size: toInt(prProperty.LotSize) ?? null,
      property_type: prProperty.PType ?? null,
      owner_flags: ownerFlags,
      updated_at: new Date().toISOString(),
    };

    log("Step 8b — Property row to upsert", propertyRow);
    console.log("[PropertyRadar] FULL UPSERT OBJECT:", JSON.stringify(propertyRow, null, 2));

    let property: { id: string } | null = null;
    let propError: { code?: string; message: string } | null = null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (sb.from("properties") as any)
        .upsert(propertyRow, { onConflict: "apn,county" })
        .select("id")
        .single() as SbResult<{ id: string }>;

      property = result.data;
      propError = result.error;
    } catch (upsertException) {
      logError("Step 8c — Upsert threw an EXCEPTION (not a Supabase error)", upsertException);
      return NextResponse.json(
        {
          error: "Property upsert threw exception",
          message: upsertException instanceof Error ? upsertException.message : String(upsertException),
          stack: upsertException instanceof Error ? upsertException.stack : undefined,
          propertyRow,
          debugLog,
        },
        { status: 500 }
      );
    }

    if (propError || !property) {
      logError("Step 8c — Property upsert FAILED", propError);
      console.error("[PropertyRadar] UPSERT ERROR FULL:", JSON.stringify(propError, null, 2));
      console.error("[PropertyRadar] UPSERT ROW WAS:", JSON.stringify(propertyRow, null, 2));
      return NextResponse.json(
        {
          error: "Property upsert failed",
          detail: propError?.message ?? "No data returned",
          code: propError?.code ?? "unknown",
          propertyRow,
          debugLog,
        },
        { status: 500 }
      );
    }

    log("Step 8d — Property upserted OK", { property_id: property.id });

    // ── 9. Append distress events (dedup by fingerprint) ─────────────

    let eventsInserted = 0;
    let eventsDeduped = 0;

    for (const signal of signals) {
      const fingerprint = distressFingerprint(apn, county, signal.type, "propertyradar");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: eventError } = await (sb.from("distress_events") as any)
        .insert({
          property_id: property.id,
          event_type: signal.type,
          source: "propertyradar",
          severity: signal.severity,
          fingerprint,
          raw_data: {
            detected_from: signal.detectedFrom,
            radar_id: prProperty.RadarID,
          },
          confidence: signal.severity >= 7 ? "0.900" : signal.severity >= 4 ? "0.750" : "0.600",
        }) as SbResult<unknown>;

      if (isDuplicateError(eventError)) {
        eventsDeduped++;
      } else if (eventError) {
        logError(`Step 9 — Event insert failed for ${signal.type}`, eventError);
      } else {
        eventsInserted++;
      }
    }

    log("Step 9 — Events complete", { inserted: eventsInserted, deduped: eventsDeduped });

    // ── 10. Run full AI scoring engine ────────────────────────────────

    const equityPct = toNumber(prProperty.EquityPercent) ?? 50;
    const avm = toNumber(prProperty.AVM) ?? 0;
    const loanBal = toNumber(prProperty.TotalLoanBalance) ?? 0;
    const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

    log("Step 10 — Scoring inputs", { equityPct, avm, loanBal, compRatio, signalCount: signals.length });

    const scoringInput: ScoringInput = {
      signals: signals.map((s) => ({
        type: s.type,
        severity: s.severity,
        daysSinceEvent: s.daysSinceEvent,
      })),
      ownerFlags: {
        absentee: ownerFlags.absentee === true,
        corporate: false,
        inherited: isTruthy(prProperty.isDeceasedProperty),
        elderly: false,
        outOfState: ownerFlags.absentee === true,
      },
      equityPercent: equityPct,
      compRatio: Math.min(compRatio, 3.0),
      historicalConversionRate: 0.5,
    };

    const scoreResult = computeScore(scoringInput);

    log("Step 10 — Score computed", {
      composite: scoreResult.composite,
      label: scoreResult.label,
      motivation: scoreResult.motivationScore,
      deal: scoreResult.dealScore,
      factors: scoreResult.factors.map((f) => `${f.name}:${f.contribution}`),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: scoreInsertErr } = await (sb.from("scoring_records") as any).insert({
      property_id: property.id,
      model_version: SCORING_MODEL_VERSION,
      composite_score: scoreResult.composite,
      motivation_score: scoreResult.motivationScore,
      deal_score: scoreResult.dealScore,
      severity_multiplier: scoreResult.severityMultiplier,
      recency_decay: scoreResult.recencyDecay,
      stacking_bonus: scoreResult.stackingBonus,
      owner_factor_score: scoreResult.ownerFactorScore,
      equity_factor_score: scoreResult.equityFactorScore,
      ai_boost: scoreResult.aiBoost,
      factors: scoreResult.factors,
    }) as SbResult<unknown>;

    if (scoreInsertErr) {
      logError("Step 10 — Scoring record insert failed (non-fatal)", scoreInsertErr);
    } else {
      log("Step 10 — Scoring record inserted OK");
    }

    // ── 11. Promote to prospect (leads table, unassigned) ────────────

    log("Step 11 — Checking for existing lead...");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id")
      .eq("property_id", property.id)
      .in("status", ["prospect", "lead"])
      .maybeSingle() as SbResult<{ id: string } | null>;

    let leadId = existingLead?.id;
    log("Step 11 — Existing lead check", { found: !!existingLead, leadId: leadId ?? "none" });

    if (!leadId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newLead, error: leadError } = await (sb.from("leads") as any)
        .insert({
          property_id: property.id,
          status: "prospect",
          priority: scoreResult.composite,
          source: "propertyradar",
          tags: signals.map((s) => s.type),
          notes: `PropertyRadar ingestion. ${signals.length} distress signal(s). RadarID: ${prProperty.RadarID ?? "N/A"}`,
          promoted_at: new Date().toISOString(),
        })
        .select("id")
        .single() as SbResult<{ id: string }>;

      if (leadError || !newLead) {
        logError("Step 11 — Lead creation FAILED", leadError);
        return NextResponse.json(
          { error: "Lead creation failed", detail: leadError?.message, debugLog },
          { status: 500 }
        );
      }
      leadId = newLead.id;
      log("Step 11 — NEW lead created", { leadId });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({
          priority: scoreResult.composite,
          tags: signals.map((s) => s.type),
          notes: `PropertyRadar re-ingested. Score: ${scoreResult.composite}. RadarID: ${prProperty.RadarID ?? "N/A"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);
      log("Step 11 — Existing lead UPDATED", { leadId });
    }

    // ── 12. Compliance scrub placeholder ──────────────────────────────

    // TODO: DNC registry check against owner phone (from PR Persons endpoint)
    // TODO: Litigant suppression check
    // TODO: Opt-out enforcement check
    // TODO: Set complianceClean = false on lead if any check fails
    const complianceClean = true;
    log("Step 12 — Compliance scrub (placeholder)", { complianceClean });

    // ── 13. Audit log (append-only) ──────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: SYSTEM_USER_ID,
      action: "propertyradar.ingest",
      entity_type: "lead",
      entity_id: leadId,
      details: {
        apn,
        county,
        address,
        owner_name: ownerName,
        radar_id: prProperty.RadarID,
        signals_detected: signals.length,
        events_inserted: eventsInserted,
        events_deduped: eventsDeduped,
        heat_score: scoreResult.composite,
        score_label: scoreResult.label,
        model_version: scoreResult.modelVersion,
        compliance_clean: complianceClean,
        property_id: property.id,
        pr_cost: prData.totalCost,
        elapsed_ms: Date.now() - startTime,
      },
    });

    const elapsed = Date.now() - startTime;
    log("=== PROPERTYRADAR COMPLETE ===", {
      apn,
      property_id: property.id,
      lead_id: leadId,
      heat_score: scoreResult.composite,
      label: scoreResult.label,
      signals: signals.map((s) => s.type),
      events_inserted: eventsInserted,
      events_deduped: eventsDeduped,
      elapsed_ms: elapsed,
    });

    return NextResponse.json({
      success: true,
      apn,
      heatScore: scoreResult.composite,
      label: scoreResult.label,
      message: "Lead added to Prospects",
      property_id: property.id,
      lead_id: leadId,
      owner: ownerName,
      address: `${address}, ${city} ${state} ${zip}`.trim(),
      signals: signals.map((s) => ({ type: s.type, severity: s.severity })),
      scoring: {
        composite: scoreResult.composite,
        motivation: scoreResult.motivationScore,
        deal: scoreResult.dealScore,
        model: scoreResult.modelVersion,
      },
      events_inserted: eventsInserted,
      events_deduped: eventsDeduped,
      compliance_clean: complianceClean,
      elapsed_ms: elapsed,
      timestamp: new Date().toISOString(),
      debugLog,
    });
  } catch (error) {
    logError("UNHANDLED ERROR", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        elapsed_ms: Date.now() - startTime,
        debugLog,
      },
      { status: 500 }
    );
  }
}

/**
 * Direct RadarID lookup — uses GET /v1/properties/{RadarID}?Fields=All
 * Faster than criteria search when you already have the RadarID.
 */
async function fetchByRadarId(apiKey: string, radarId: string) {
  const url = `${PR_API_BASE}/${radarId}?Purchase=1&Fields=All`;
  console.log("[PropertyRadar] Direct RadarID fetch:", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
  });

  const rawText = await res.text();
  console.log("[PropertyRadar] RadarID response:", res.status, rawText.slice(0, 2000));

  return NextResponse.json({
    success: res.ok,
    radarId,
    httpStatus: res.status,
    response: rawText.length < 5000 ? safeParseJson(rawText) : rawText.slice(0, 5000),
    note: "Direct RadarID lookup — full ingestion pipeline not yet wired for this path",
    // TODO: Wire into the same upsert/score/promote pipeline
  });
}

/**
 * GET /api/ingest/propertyradar
 * Returns endpoint documentation and diagnostic info.
 */
export async function GET() {
  const apiKey = process.env.PROPERTYRADAR_API_KEY;

  return NextResponse.json({
    endpoint: "/api/ingest/propertyradar",
    method: "POST",
    description: "Single-property ingestion from PropertyRadar with automatic AI scoring",
    status: {
      api_key_configured: !!apiKey,
      api_key_length: apiKey?.length ?? 0,
    },
    body_examples: [
      {
        description: "Search by full address (auto-parsed into street + city + state + zip)",
        body: { address: "1423 Oak Valley Dr, Phoenix AZ 85001" },
      },
      {
        description: "Search by address with explicit fields",
        body: { address: "1423 Oak Valley Dr", city: "Phoenix", state: "AZ", zip: "85001" },
      },
      {
        description: "Search by APN",
        body: { apn: "014-1234-006-02" },
      },
      {
        description: "Search by APN with state filter",
        body: { apn: "014-1234-006-02", state: "AZ" },
      },
      {
        description: "Direct RadarID lookup (fastest)",
        body: { radarId: "P8A0E18D" },
      },
    ],
    propertyradar_api_notes: [
      "Address criteria must NOT include city/state/zip — they are separate criteria",
      "All criteria values must be arrays: {name:'APN', value:['123-456']}",
      "Purchase=1 is required to get property data (charged per record)",
      "APN format varies by county — include dashes if the county uses them",
      "County criteria uses FIPS codes (numeric), not county names",
    ],
    response: {
      success: true,
      apn: "string",
      heatScore: "number (0-100)",
      label: "fire | hot | warm | cold",
      message: "Lead added to Prospects",
    },
    // TODO: Add /api/ingest/propertyradar/bulk for batch import (Phase 3)
  });
}

// ── Address Parser ────────────────────────────────────────────────────
// PropertyRadar Address criteria: street only. City/State/Zip are separate.

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
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA",
  HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
  KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME", MARYLAND: "MD",
  MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN", MISSISSIPPI: "MS",
  MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK",
  OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI",
  WYOMING: "WY",
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

    const stateMatch = rest.match(/\b([A-Z]{2})\s*$/i) || rest.match(/\b(\w[\w\s]*?)\s*$/i);
    if (stateMatch) {
      const candidate = stateMatch[1].toUpperCase();
      if (US_STATES[candidate]) {
        result.state = US_STATES[candidate];
        const beforeState = rest.slice(0, stateMatch.index).trim();
        result.city = beforeState || "";
      } else {
        result.city = rest;
      }
    } else {
      result.city = rest;
    }
  } else {
    const stateMatch = raw.match(/\b([A-Z]{2})\s*$/i);
    if (stateMatch && US_STATES[stateMatch[1].toUpperCase()]) {
      result.state = US_STATES[stateMatch[1].toUpperCase()];
      result.street = raw.slice(0, stateMatch.index).trim();
    } else {
      result.street = raw;
    }
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────


function isTruthy(val: unknown): boolean {
  if (val === true || val === 1 || val === "1" || val === "Yes" || val === "True" || val === "true") return true;
  return false;
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

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Distress Signal Detection ─────────────────────────────────────────
// Uses PropertyRadar's boolean indicator fields + date fields.

interface DetectedSignal {
  type: DistressType;
  severity: number;
  daysSinceEvent: number;
  detectedFrom: string;
}

function detectDistressSignals(pr: PRProperty): DetectedSignal[] {
  const signals: DetectedSignal[] = [];

  if (isTruthy(pr.isDeceasedProperty)) {
    signals.push({
      type: "probate",
      severity: 9,
      daysSinceEvent: 30,
      detectedFrom: "isDeceasedProperty",
    });
  }

  if (isTruthy(pr.isPreforeclosure) || isTruthy(pr.inForeclosure)) {
    const defaultAmt = toNumber(pr.DefaultAmount) ?? 0;
    signals.push({
      type: "pre_foreclosure",
      severity: defaultAmt > 50000 ? 9 : 7,
      daysSinceEvent: pr.ForeclosureRecDate ? daysBetween(pr.ForeclosureRecDate) : 30,
      detectedFrom: isTruthy(pr.isPreforeclosure) ? "isPreforeclosure" : "inForeclosure",
    });
  }

  if (isTruthy(pr.inTaxDelinquency)) {
    const delAmt = toNumber(pr.DelinquentAmount) ?? 0;
    signals.push({
      type: "tax_lien",
      severity: delAmt > 10000 ? 8 : 6,
      daysSinceEvent: pr.DelinquentYear
        ? Math.max(365 * (new Date().getFullYear() - Number(pr.DelinquentYear)), 30)
        : 90,
      detectedFrom: "inTaxDelinquency",
    });
  }

  if (isTruthy(pr.inBankruptcyProperty)) {
    signals.push({
      type: "bankruptcy",
      severity: 8,
      daysSinceEvent: 60,
      detectedFrom: "inBankruptcyProperty",
    });
  }

  if (isTruthy(pr.inDivorce)) {
    signals.push({
      type: "divorce",
      severity: 7,
      daysSinceEvent: 60,
      detectedFrom: "inDivorce",
    });
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
    signals.push({
      type: "absentee",
      severity: 4,
      daysSinceEvent: 90,
      detectedFrom: "isNotSameMailingOrExempt",
    });
  }

  if (isTruthy(pr.PropertyHasOpenLiens) || isTruthy(pr.PropertyHasOpenPersonLiens)) {
    if (!signals.some((s) => s.type === "tax_lien")) {
      signals.push({
        type: "tax_lien",
        severity: 5,
        daysSinceEvent: 90,
        detectedFrom: "PropertyHasOpenLiens",
      });
    }
  }

  if (signals.length === 0) {
    signals.push({
      type: "vacant",
      severity: 3,
      daysSinceEvent: 180,
      detectedFrom: "no_distress_detected_default",
    });
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
