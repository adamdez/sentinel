/**
 * Scoring Persistence Layer
 *
 * Connects the deterministic scoring engine to Supabase.
 * Scoring Domain: reads distress_events, writes scoring_records.
 * Never mutates workflow tables.
 */

import { supabase, createServerClient } from "./supabase";
import { computeScore, SCORING_MODEL_VERSION, type ScoringInput, type ScoringOutput } from "./scoring";

export interface StoredScoringRecord {
  id: string;
  property_id: string;
  model_version: string;
  composite_score: number;
  motivation_score: number;
  deal_score: number;
  severity_multiplier: number;
  recency_decay: number;
  stacking_bonus: number;
  owner_factor_score: number;
  equity_factor_score: number;
  ai_boost: number;
  factors: Record<string, unknown>[];
  created_at: string;
}

/**
 * Score a property and persist the result to scoring_records.
 * Append-only — never updates existing records.
 */
export async function scoreAndPersist(
  propertyId: string,
  input: ScoringInput,
  options: { useServerClient?: boolean } = {}
): Promise<{ output: ScoringOutput; persisted: boolean }> {
  const output = computeScore(input);

  const record = {
    property_id: propertyId,
    model_version: output.modelVersion,
    composite_score: output.composite,
    motivation_score: output.motivationScore,
    deal_score: output.dealScore,
    severity_multiplier: output.severityMultiplier,
    recency_decay: output.recencyDecay,
    stacking_bonus: output.stackingBonus,
    owner_factor_score: output.ownerFactorScore,
    equity_factor_score: output.equityFactorScore,
    ai_boost: output.aiBoost,
    factors: output.factors as unknown as Record<string, unknown>[],
  };

  try {
    const client = options.useServerClient ? createServerClient() : supabase;
    // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client.from("scoring_records") as any)
      .insert(record) as { error: { message: string } | null };

    if (error) {
      console.warn("[Scoring] Persistence failed:", error.message);
      return { output, persisted: false };
    }
    return { output, persisted: true };
  } catch {
    return { output, persisted: false };
  }
}

/**
 * Get the latest scoring record for a property.
 */
export async function getLatestScore(
  propertyId: string
): Promise<StoredScoringRecord | null> {
  // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("scoring_records") as any)
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: StoredScoringRecord | null; error: unknown };

  if (error || !data) return null;
  return data;
}

/**
 * Get top-scored properties (for leaderboard / My Top Prospects).
 * Paginated to avoid N+1.
 */
export async function getTopScoredProperties(options: {
  limit?: number;
  offset?: number;
  minScore?: number;
  modelVersion?: string;
} = {}): Promise<StoredScoringRecord[]> {
  const { limit = 25, offset = 0, minScore = 0, modelVersion } = options;

  // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("scoring_records") as any)
    .select("*")
    .gte("composite_score", minScore)
    .order("composite_score", { ascending: false })
    .range(offset, offset + limit - 1);

  if (modelVersion) {
    query = query.eq("model_version", modelVersion);
  }

  const { data, error } = await query as { data: StoredScoringRecord[] | null; error: { message: string } | null };
  if (error) {
    console.warn("[Scoring] Failed to fetch leaderboard:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Replay scoring for all properties.
 * Reads distress_events, recomputes, writes new scoring_records.
 * Used for model recalibration.
 *
 * TODO: Implement as a background job with queue isolation.
 */
export async function replayAllScores(): Promise<{
  processed: number;
  errors: number;
}> {
  console.log(`[Scoring] Replay started — model ${SCORING_MODEL_VERSION}`);

  // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: propertiesData, error } = await (supabase.from("properties") as any)
    .select("id, equity_percent, owner_flags")
    .order("created_at", { ascending: true }) as {
      data: { id: string; equity_percent: number | null; owner_flags: Record<string, boolean> }[] | null;
      error: { message: string } | null;
    };

  if (error || !propertiesData) {
    console.error("[Scoring] Replay failed to fetch properties:", error?.message);
    return { processed: 0, errors: 1 };
  }

  let processed = 0;
  let errors = 0;

  for (const property of propertiesData) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: events } = await (supabase.from("distress_events") as any)
        .select("event_type, severity, created_at")
        .eq("property_id", property.id) as {
          data: { event_type: string; severity: number; created_at: string }[] | null;
        };

      if (!events || events.length === 0) continue;

      const now = Date.now();
      const input: ScoringInput = {
        signals: events.map((e) => ({
          type: e.event_type as ScoringInput["signals"][0]["type"],
          severity: e.severity,
          daysSinceEvent: Math.floor((now - new Date(e.created_at).getTime()) / 86400000),
        })),
        ownerFlags: (property.owner_flags as Record<string, boolean>) ?? {},
        equityPercent: Number(property.equity_percent) || 0,
        compRatio: 1.0,
        historicalConversionRate: 0,
      };

      const { persisted } = await scoreAndPersist(property.id, input, {
        useServerClient: true,
      });

      if (persisted) processed++;
      else errors++;
    } catch {
      errors++;
    }
  }

  console.log(`[Scoring] Replay complete — ${processed} scored, ${errors} errors`);
  return { processed, errors };
}
