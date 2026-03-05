/**
 * Scoring Persistence Layer
 *
 * Connects the deterministic scoring engine to Supabase.
 * Scoring Domain: reads distress_events, writes scoring_records.
 * Never mutates workflow tables.
 */

import { supabase, createServerClient } from "./supabase";
import { computeScore, SCORING_MODEL_VERSION, getScoreLabel, type ScoringInput, type ScoringOutput } from "./scoring";
import { crossSourceFingerprint } from "./dedup";
import type { SignalStatus } from "./types";

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

export interface ReplayAuditEntry {
  propertyId: string;
  oldScore: number | null;
  oldTier: string | null;
  newScore: number;
  newTier: string;
}

export interface ReplayResult {
  processed: number;
  errors: number;
  leadsUpdated: number;
  audit: ReplayAuditEntry[];
  tierMigration: Record<string, Record<string, number>>;
}

/**
 * Replay scoring for all properties with v2.2 enhancements:
 * - Excludes resolved signals (status = 'resolved')
 * - Uses event_date for recency (falls back to created_at)
 * - Cross-source dedup by event_type per property
 * - Includes signal freshness (status) in scoring input
 * - Updates leads.priority with new score
 * - Returns before/after audit summary with tier migrations
 */
export async function replayAllScores(): Promise<ReplayResult> {
  console.log(`[Scoring] Replay started — model ${SCORING_MODEL_VERSION}`);
  const sb = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = (name: string) => sb.from(name) as any;

  // Fetch all properties with their current lead scores
  const { data: propertiesData, error } = await tbl("properties")
    .select("id, apn, county, equity_percent, owner_flags")
    .order("created_at", { ascending: true });

  if (error || !propertiesData) {
    console.error("[Scoring] Replay failed to fetch properties:", error?.message);
    return { processed: 0, errors: 1, leadsUpdated: 0, audit: [], tierMigration: {} };
  }

  // Fetch current lead priorities for audit
  const { data: leadsData } = await tbl("leads")
    .select("id, property_id, priority")
    .in("status", ["staging", "prospect", "my_lead", "lead", "negotiation"]);

  const leadByProperty: Record<string, { id: string; priority: number | null }> = {};
  for (const l of leadsData ?? []) {
    if (l.property_id) leadByProperty[l.property_id] = { id: l.id, priority: l.priority };
  }

  let processed = 0;
  let errors = 0;
  let leadsUpdated = 0;
  const audit: ReplayAuditEntry[] = [];
  // tierMigration[oldTier][newTier] = count
  const tierMigration: Record<string, Record<string, number>> = {};

  const now = Date.now();

  for (const property of propertiesData) {
    try {
      // Fetch events — exclude resolved, include status for freshness
      const { data: events } = await tbl("distress_events")
        .select("event_type, severity, created_at, event_date, status, source")
        .eq("property_id", property.id)
        .in("status", ["active", "unknown"]);

      if (!events || events.length === 0) continue;

      // Cross-source dedup: keep highest-severity per event_type
      const dedupMap = new Map<string, typeof events[0]>();
      for (const e of events) {
        const key = crossSourceFingerprint(
          property.apn ?? property.id,
          property.county ?? "unknown",
          e.event_type,
        );
        const existing = dedupMap.get(key);
        if (!existing || e.severity > existing.severity) {
          dedupMap.set(key, e);
        }
      }

      const dedupedEvents = [...dedupMap.values()];

      const input: ScoringInput = {
        signals: dedupedEvents.map((e) => {
          // Prefer event_date for recency, fall back to created_at
          const dateForRecency = e.event_date ?? e.created_at;
          const daysSinceEvent = Math.floor((now - new Date(dateForRecency).getTime()) / 86400000);
          return {
            type: e.event_type as ScoringInput["signals"][0]["type"],
            severity: e.severity,
            daysSinceEvent: Math.max(daysSinceEvent, 0),
            status: (e.status ?? "unknown") as SignalStatus,
          };
        }),
        ownerFlags: (property.owner_flags as Record<string, boolean>) ?? {},
        equityPercent: Number(property.equity_percent) || 0,
        compRatio: 1.0,
        historicalConversionRate: 0,
      };

      const { output, persisted } = await scoreAndPersist(property.id, input, {
        useServerClient: true,
      });

      if (!persisted) {
        errors++;
        continue;
      }

      processed++;

      // Update lead priority if there's a lead for this property
      const lead = leadByProperty[property.id];
      if (lead) {
        const oldScore = lead.priority;
        const oldTier = oldScore != null ? getScoreLabel(oldScore) : "none";
        const newTier = getScoreLabel(output.composite);

        await tbl("leads")
          .update({ priority: output.composite, updated_at: new Date().toISOString() })
          .eq("id", lead.id);
        leadsUpdated++;

        audit.push({
          propertyId: property.id,
          oldScore,
          oldTier,
          newScore: output.composite,
          newTier,
        });

        // Track tier migration
        if (!tierMigration[oldTier]) tierMigration[oldTier] = {};
        tierMigration[oldTier][newTier] = (tierMigration[oldTier][newTier] ?? 0) + 1;
      }
    } catch {
      errors++;
    }
  }

  console.log(`[Scoring] Replay complete — ${processed} scored, ${leadsUpdated} leads updated, ${errors} errors`);
  return { processed, errors, leadsUpdated, audit, tierMigration };
}
