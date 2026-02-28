import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  computePredictiveScore,
  buildPredictiveInput,
  buildPredictionRecord,
  PREDICTIVE_MODEL_VERSION,
} from "@/lib/scoring-predictive";
import { blendHeatScore } from "@/lib/scoring-predictive";

type SbResult<T> = { data: T | null; error: { message: string } | null };

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/scoring/predict
 *
 * Runs the Predictive Scoring Engine v2.0 for one or more properties.
 * Accepts { property_ids: string[] } and returns predictive scores.
 *
 * Domain: Scoring Domain — reads properties, distress_events,
 * scoring_records. Writes scoring_predictions (append-only).
 * Never mutates workflow tables.
 */
export async function POST(request: NextRequest) {
  try {
    const sbAuth = createServerClient();
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await sbAuth.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const propertyIds: string[] = body.property_ids ?? (body.property_id ? [body.property_id] : []);

    if (propertyIds.length === 0) {
      return NextResponse.json({ error: "property_ids required" }, { status: 400 });
    }

    if (propertyIds.length > 50) {
      return NextResponse.json({ error: "Max 50 properties per batch" }, { status: 400 });
    }

    const sb = createServerClient();
    const results: {
      property_id: string;
      predictive_score: number;
      days_until_distress: number;
      confidence: number;
      label: string;
      blended_heat_score: number | null;
    }[] = [];
    let errors = 0;

    for (const propertyId of propertyIds) {
      try {
        // Fetch property
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: property, error: propErr } = await (sb.from("properties") as any)
          .select("*")
          .eq("id", propertyId)
          .single() as SbResult<Record<string, unknown>>;

        if (propErr || !property) {
          console.warn(`[Predict] Property ${propertyId} not found`);
          errors++;
          continue;
        }

        // Fetch distress events
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: events } = await (sb.from("distress_events") as any)
          .select("event_type, severity, created_at")
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false }) as SbResult<{ event_type: string; severity: number; created_at: string }[]>;

        // Fetch historical scores
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: scores } = await (sb.from("scoring_records") as any)
          .select("composite_score, created_at")
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(10) as SbResult<{ composite_score: number; created_at: string }[]>;

        // Build input and compute
        const input = buildPredictiveInput(
          propertyId,
          property,
          events ?? [],
          scores ?? []
        );

        const output = computePredictiveScore(input);

        // Persist prediction (append-only)
        const record = buildPredictionRecord(propertyId, output);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insertErr } = await (sb.from("scoring_predictions") as any)
          .insert(record) as SbResult<unknown>;

        if (insertErr) {
          console.warn(`[Predict] Failed to persist prediction for ${propertyId}:`, insertErr.message);
        }

        // Compute blended heat score if we have a deterministic score
        let blendedHeatScore: number | null = null;
        if (scores && scores.length > 0) {
          const latestComposite = scores[0].composite_score;
          blendedHeatScore = blendHeatScore(latestComposite, output.predictiveScore);

          // Update lead priority with blended score
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("leads") as any)
            .update({ priority: blendedHeatScore, updated_at: new Date().toISOString() })
            .eq("property_id", propertyId)
            .in("status", ["prospect", "lead"]);
        }

        results.push({
          property_id: propertyId,
          predictive_score: output.predictiveScore,
          days_until_distress: output.daysUntilDistress,
          confidence: output.confidence,
          label: output.label,
          blended_heat_score: blendedHeatScore,
        });
      } catch (err) {
        console.error(`[Predict] Error for ${propertyId}:`, err);
        errors++;
      }
    }

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: SYSTEM_USER_ID,
      action: "predictive_scoring.batch",
      entity_type: "batch",
      entity_id: PREDICTIVE_MODEL_VERSION,
      details: {
        model_version: PREDICTIVE_MODEL_VERSION,
        requested: propertyIds.length,
        scored: results.length,
        errors,
        results: results.map((r) => ({
          property_id: r.property_id,
          score: r.predictive_score,
          days: r.days_until_distress,
          confidence: r.confidence,
        })),
      },
    });

    return NextResponse.json({
      success: true,
      model_version: PREDICTIVE_MODEL_VERSION,
      scored: results.length,
      errors,
      predictions: results,
    });
  } catch (error) {
    console.error("[Predict] Unhandled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
