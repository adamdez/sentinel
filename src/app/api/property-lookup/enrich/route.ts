import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { detectDistressSignals } from "@/lib/distress-signals";
import { normalizeCounty, distressFingerprint } from "@/lib/dedup";
import { computeScore, getScoreLabel, type ScoringInput } from "@/lib/scoring";

/**
 * POST /api/property-lookup/enrich
 *
 * Enrichment-on-preview: accepts the raw PR data from a property-lookup,
 * upserts a property record, detects distress signals, scores, extracts photos,
 * and returns the fully enriched data for the preview modal.
 *
 * Called automatically when the PropertyPreviewModal opens — the agent sees
 * a fully enriched property file without waiting for the enrichment cron.
 */

// ── Helpers ─────────────────────────────────────────────────────────────

function isTruthy(val: unknown): boolean {
  return val === true || val === 1 || val === "1" || val === "Yes" || val === "True" || val === "true";
}

function toNumber(val: unknown): number | undefined {
  if (val == null) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function toInt(val: unknown): number | null {
  if (val == null) return null;
  const n = parseInt(String(val), 10);
  return isNaN(n) ? null : n;
}

// ── POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prRaw, apn, county, address, city, state, zip, ownerName, fullAddress } = body;

    if (!prRaw || !apn) {
      return NextResponse.json({ error: "prRaw and apn are required" }, { status: 400 });
    }

    const sb = createServerClient();
    const pr = prRaw;
    const now = new Date().toISOString();
    const normalizedCounty = normalizeCounty(county || pr.County || "", "Unknown");

    // ── Step 1: Upsert property record (no lead) ─────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ownerFlags: Record<string, any> = {
      source: "propertyradar",
      radar_id: pr.RadarID ?? null,
      last_enriched: now,
      enrichment_pending: false,
      enrichment_status: "enriched",
      enrichment_completed_at: now,
      pr_raw: pr,
    };

    // Extract photos from PR response (zero additional cost)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extractedPhotos: { url: string; source: string; capturedAt: string }[] = [];

    const prPhotos = pr.Photos || pr.photos;
    if (Array.isArray(prPhotos)) {
      for (const url of prPhotos) {
        if (typeof url === "string" && url.startsWith("http")) {
          extractedPhotos.push({ url, source: "assessor", capturedAt: now });
        }
      }
    }

    if (typeof pr.PropertyImageUrl === "string" && pr.PropertyImageUrl.startsWith("http")) {
      extractedPhotos.push({ url: pr.PropertyImageUrl, source: "assessor", capturedAt: now });
    }

    const lat = toNumber(pr.Latitude);
    const lng = toNumber(pr.Longitude);
    if (lat && lng) {
      extractedPhotos.push({
        url: `/api/street-view?lat=${lat}&lng=${lng}`,
        source: "google_street_view",
        capturedAt: now,
      });
    }

    if (extractedPhotos.length > 0) {
      ownerFlags.photos = extractedPhotos;
      ownerFlags.photos_fetched_at = now;
    }

    if (isTruthy(pr.isNotSameMailingOrExempt)) ownerFlags.absentee = true;
    if (isTruthy(pr.isSiteVacant)) ownerFlags.vacant = true;
    if (isTruthy(pr.isHighEquity)) ownerFlags.highEquity = true;
    if (isTruthy(pr.isFreeAndClear)) ownerFlags.freeAndClear = true;
    if (isTruthy(pr.isCashBuyer)) ownerFlags.cashBuyer = true;

    const estimatedValue = toNumber(pr.AVM);
    const equityPercent = toNumber(pr.EquityPercent);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propertyData: Record<string, any> = {
      apn: pr.APN ?? apn,
      county: normalizedCounty,
      address: address || [pr.Address, pr.City, pr.State, pr.ZipFive].filter(Boolean).join(", "),
      city: city || pr.City || "",
      state: state || pr.State || "",
      zip: zip || pr.ZipFive || "",
      owner_name: ownerName || pr.Owner || pr.Taxpayer || "Unknown",
      estimated_value: estimatedValue != null ? Math.round(estimatedValue) : null,
      equity_percent: equityPercent ?? null,
      bedrooms: toInt(pr.Beds),
      bathrooms: toNumber(pr.Baths) ?? null,
      sqft: toInt(pr.SqFt),
      year_built: toInt(pr.YearBuilt),
      lot_size: toInt(pr.LotSize),
      property_type: pr.PType ?? "SFR",
      owner_flags: ownerFlags,
      updated_at: now,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: upsertedProp, error: propErr } = await (sb.from("properties") as any)
      .upsert(propertyData, { onConflict: "apn,county" })
      .select("id")
      .single();

    if (propErr) {
      console.error("[enrich-preview] Property upsert failed:", propErr.message);
      return NextResponse.json({ error: "Property upsert failed" }, { status: 500 });
    }

    const propertyId = upsertedProp.id;

    // ── Step 2: Detect distress signals (canonical detection) ────────
    const detection = detectDistressSignals(pr);
    const signals = detection.signals;

    // Insert distress events (dedup by fingerprint)
    for (const signal of signals) {
      const fp = distressFingerprint(apn, normalizedCounty, signal.type, "propertyradar");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: evtErr } = await (sb.from("distress_events") as any).insert({
        property_id: propertyId,
        event_type: signal.type,
        source: "propertyradar",
        severity: signal.severity,
        fingerprint: fp,
        raw_data: { detected_from: signal.detectedFrom, radar_id: pr.RadarID },
        confidence: signal.severity >= 7 ? "0.900" : signal.severity >= 4 ? "0.750" : "0.600",
        status: "active",
        last_verified_at: now,
      });
      if (evtErr && !evtErr.message?.includes("duplicate")) {
        console.error(`[enrich-preview] Event insert error (${signal.type}):`, evtErr.message);
      }
    }

    // ── Step 3: Deterministic scoring ────────────────────────────────
    const loanBal = toNumber(pr.TotalLoanBalance) ?? 0;
    const avm = toNumber(pr.AVM) ?? 0;
    const compRatio = avm > 0 && loanBal > 0 ? avm / loanBal : 1.1;

    const scoringInput: ScoringInput = {
      signals: signals.map((s) => ({ type: s.type, severity: s.severity, daysSinceEvent: s.daysSinceEvent })),
      ownerFlags: {
        absentee: isTruthy(pr.isNotSameMailingOrExempt),
        corporate: false,
        inherited: isTruthy(pr.isDeceasedProperty),
        elderly: false,
        outOfState: isTruthy(pr.isNotSameMailingOrExempt),
      },
      equityPercent: toNumber(pr.EquityPercent) ?? 50,
      compRatio: Math.min(compRatio, 3.0),
      historicalConversionRate: 0,
    };

    const scoreOutput = computeScore(scoringInput);
    const blendedScore = scoreOutput.composite; // No predictive data yet for preview
    const scoreLabel = getScoreLabel(blendedScore);

    // Insert scoring record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_records") as any).insert({
      property_id: propertyId,
      model_version: "v2.2-preview",
      composite_score: scoreOutput.composite,
      motivation_score: scoreOutput.motivationScore,
      deal_score: scoreOutput.dealScore,
      severity_multiplier: scoreOutput.severityMultiplier,
      recency_decay: scoreOutput.recencyDecay,
      stacking_bonus: scoreOutput.stackingBonus,
      owner_factor_score: scoreOutput.ownerFactorScore,
      equity_factor_score: scoreOutput.equityFactorScore,
      ai_boost: scoreOutput.aiBoost,
      factors: scoreOutput.factors,
    }).then(() => {}).catch(() => {}); // Non-blocking

    // ── Step 4: Build enriched response ──────────────────────────────
    return NextResponse.json({
      success: true,
      propertyId,
      score: blendedScore,
      scoreLabel,
      signals: signals.map((s) => ({
        type: s.type,
        severity: s.severity,
        daysSinceEvent: s.daysSinceEvent,
        detectedFrom: s.detectedFrom,
      })),
      photos: extractedPhotos,
      enrichedAt: now,
      detection: {
        isMLSListed: detection.isMLSListed,
        isOutOfState: detection.isOutOfState,
        ownerAge: detection.ownerAge,
        ownershipYears: detection.ownershipYears,
      },
    });
  } catch (err) {
    console.error("[enrich-preview] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
