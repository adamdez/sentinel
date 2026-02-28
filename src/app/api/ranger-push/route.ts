import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createServerClient } from "@/lib/supabase";
import {
  computePredictiveScore,
  buildPredictionRecord,
  blendHeatScore,
  type PredictiveInput,
} from "@/lib/scoring-predictive";

type SbResult<T> = { data: T | null; error: { code?: string; message: string } | null };

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

interface RangerPushPayload {
  prowler_id: string;
  apn: string;
  heat_score: number;
  tags: string[];
  breakdown: Record<string, unknown>;
  ghost_mode_used: boolean;
  pushed_at: string;
  audit_url: string;
  address: string;
  owner_name: string;
  county?: string;
}

/**
 * POST /api/ranger-push
 *
 * Receives a Dominion Ranger prowler push and inserts the lead into
 * the Prospect stage. Upserts the property (APN + county identity),
 * creates a scoring record from the breakdown, and promotes to a
 * lead_instance at "prospect" status.
 *
 * Domain: Signal Domain (property upsert, event append) →
 *         Promotion Domain (lead creation at prospect).
 *
 * Respects Charter invariants:
 *   - Idempotent property upsert (ON CONFLICT APN+county)
 *   - Distress event dedup by fingerprint hash
 *   - Append-only event_log audit trail
 *   - Deterministic scoring record from breakdown
 */
export async function POST(request: NextRequest) {
  try {
    const payload: RangerPushPayload = await request.json();

    console.log("🚀 RANGER PUSH RECEIVED", {
      prowler_id: payload.prowler_id,
      apn: payload.apn,
      heat_score: payload.heat_score,
      tags: payload.tags,
      ghost_mode_used: payload.ghost_mode_used,
      pushed_at: payload.pushed_at,
      address: payload.address,
      owner_name: payload.owner_name,
      audit_url: payload.audit_url,
    });

    if (!payload.apn || !payload.address || !payload.owner_name) {
      return NextResponse.json(
        { error: "Missing required fields: apn, address, owner_name" },
        { status: 400 }
      );
    }

    if (typeof payload.heat_score !== "number" || payload.heat_score < 0 || payload.heat_score > 100) {
      return NextResponse.json(
        { error: "heat_score must be a number between 0 and 100" },
        { status: 400 }
      );
    }

    const sb = createServerClient();
    const county = payload.county ?? "maricopa";

    // ── 1. Idempotent property upsert (APN + county = canonical identity) ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propError } = await (sb.from("properties") as any)
      .upsert(
        {
          apn: payload.apn,
          county,
          address: payload.address,
          owner_name: payload.owner_name,
          owner_flags: { ranger_pushed: true, ghost_mode: payload.ghost_mode_used },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "apn,county" }
      )
      .select("id")
      .single() as SbResult<{ id: string }>;

    if (propError || !property) {
      console.error("[RangerPush] Property upsert failed:", propError);
      return NextResponse.json(
        { error: "Property upsert failed", detail: propError?.message },
        { status: 500 }
      );
    }

    // ── 2. Append distress event (dedup by fingerprint) ──

    const primaryTag = payload.tags?.[0] ?? "ranger_push";
    const distressType = mapTagToDistressType(primaryTag);

    const fingerprint = createHash("sha256")
      .update(`${payload.apn}:${county}:${distressType}:ranger:${payload.prowler_id}`)
      .digest("hex");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: eventError } = await (sb.from("distress_events") as any)
      .insert({
        property_id: property.id,
        event_type: distressType,
        source: "ranger_push",
        severity: Math.round(payload.heat_score / 10),
        fingerprint,
        raw_data: {
          prowler_id: payload.prowler_id,
          heat_score: payload.heat_score,
          tags: payload.tags,
          breakdown: payload.breakdown,
          ghost_mode_used: payload.ghost_mode_used,
          pushed_at: payload.pushed_at,
          audit_url: payload.audit_url,
        },
        confidence: payload.heat_score >= 80 ? "0.950" : payload.heat_score >= 60 ? "0.800" : "0.650",
      }) as SbResult<unknown>;

    const eventDeduped = eventError?.code === "23505";
    if (eventError && !eventDeduped) {
      console.error("[RangerPush] Event insert failed:", eventError);
    }

    // ── 3. Create scoring record from breakdown ──

    const composite = payload.heat_score;
    const motivation = (payload.breakdown?.motivation as number) ?? Math.round(composite * 0.85);
    const deal = (payload.breakdown?.deal as number) ?? Math.round(composite * 0.75);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_records") as any).insert({
      property_id: property.id,
      model_version: "ranger-v1",
      composite_score: composite,
      motivation_score: motivation,
      deal_score: deal,
      severity_multiplier: (payload.breakdown?.severity_multiplier as number) ?? 1.0,
      recency_decay: 1.0,
      stacking_bonus: (payload.breakdown?.stacking_bonus as number) ?? 0,
      owner_factor_score: (payload.breakdown?.owner_factor as number) ?? 0,
      equity_factor_score: (payload.breakdown?.equity_factor as number) ?? 0,
      ai_boost: (payload.breakdown?.ai_boost as number) ?? 0,
      factors: payload.breakdown ?? {},
    });

    // ── 3b. Predictive scoring (v2.0) ──

    const predInput: PredictiveInput = {
      propertyId: property.id,
      ownerName: payload.owner_name ?? "Unknown",
      ownershipYears: null,
      lastSaleDate: null,
      lastSalePrice: null,
      estimatedValue: null,
      equityPercent: null,
      previousEquityPercent: null,
      equityDeltaMonths: null,
      totalLoanBalance: null,
      isAbsentee: (payload.tags ?? []).includes("absentee"),
      absenteeSinceDate: null,
      isVacant: (payload.tags ?? []).includes("vacant"),
      isCorporateOwner: false,
      isFreeClear: false,
      ownerAgeKnown: null,
      delinquentAmount: null,
      previousDelinquentAmount: null,
      delinquentYears: 0,
      taxAssessedValue: null,
      activeSignals: [{
        type: distressType as PredictiveInput["activeSignals"][0]["type"],
        severity: Math.round(payload.heat_score / 10),
        daysSinceEvent: 0,
      }],
      historicalScores: [],
      foreclosureStage: (payload.breakdown?.foreclosure_stage as string) ?? null,
      defaultAmount: (payload.breakdown?.default_amount as number) ?? null,
    };

    const predOutput = computePredictiveScore(predInput);
    const blendedScore = blendHeatScore(composite, predOutput.predictiveScore);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("scoring_predictions") as any)
      .insert(buildPredictionRecord(property.id, predOutput));

    // ── 4. Promote to lead at prospect status (blended score) ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id")
      .eq("property_id", property.id)
      .eq("status", "prospect")
      .maybeSingle() as SbResult<{ id: string } | null>;

    let leadId = existingLead?.id;

    if (!leadId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newLead, error: leadError } = await (sb.from("leads") as any)
        .insert({
          property_id: property.id,
          status: "prospect",
          priority: blendedScore,
          source: "ranger_push",
          tags: payload.tags ?? [],
          notes: `Ranger push from prowler ${payload.prowler_id}. Heat ${blendedScore} (det:${composite} + pred:${predOutput.predictiveScore}). Distress ~${predOutput.daysUntilDistress}d. Audit: ${payload.audit_url}`,
          promoted_at: payload.pushed_at ?? new Date().toISOString(),
        })
        .select("id")
        .single() as SbResult<{ id: string }>;

      if (leadError || !newLead) {
        console.error("[RangerPush] Lead creation failed:", leadError);
        return NextResponse.json(
          { error: "Lead creation failed", detail: leadError?.message },
          { status: 500 }
        );
      }
      leadId = newLead.id;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({
          priority: blendedScore,
          tags: payload.tags ?? [],
          notes: `Ranger push from prowler ${payload.prowler_id}. Heat ${blendedScore} (det:${composite} + pred:${predOutput.predictiveScore}). Distress ~${predOutput.daysUntilDistress}d. Audit: ${payload.audit_url}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);
    }

    // ── 5. Append-only audit trail ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: SYSTEM_USER_ID,
      action: "ranger_push.received",
      entity_type: "lead",
      entity_id: leadId,
      details: {
        prowler_id: payload.prowler_id,
        apn: payload.apn,
        county,
        heat_score: payload.heat_score,
        tags: payload.tags,
        ghost_mode_used: payload.ghost_mode_used,
        audit_url: payload.audit_url,
        event_deduped: eventDeduped,
        property_id: property.id,
      },
    });

    console.log("✅ RANGER PUSH COMPLETE", {
      apn: payload.apn,
      property_id: property.id,
      lead_id: leadId,
      heat_score: payload.heat_score,
      event_deduped: eventDeduped,
    });

    return NextResponse.json({
      success: true,
      apn: payload.apn,
      property_id: property.id,
      lead_id: leadId,
      heat_score: payload.heat_score,
      event_deduped: eventDeduped,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[RangerPush] Unhandled error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function mapTagToDistressType(tag: string): string {
  const mapping: Record<string, string> = {
    probate: "probate",
    pre_foreclosure: "pre_foreclosure",
    foreclosure: "pre_foreclosure",
    tax_lien: "tax_lien",
    code_violation: "code_violation",
    vacant: "vacant",
    divorce: "divorce",
    bankruptcy: "bankruptcy",
    fsbo: "fsbo",
    absentee: "absentee",
    inherited: "inherited",
  };
  const normalized = tag.toLowerCase().replace(/[\s-]+/g, "_");
  return mapping[normalized] ?? "vacant";
}
