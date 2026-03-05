/**
 * Sentinel Conversion Tracking
 *
 * Captures lead state at every stage transition for conversion analytics.
 * Enables: signal-to-deal conversion rates, pipeline velocity,
 * score calibration, dead lead analysis, and feedback loop for scoring weights.
 *
 * Called from the PATCH /api/prospects handler when lead status changes.
 */

import { createServerClient } from "@/lib/supabase";
import { getScoreLabel } from "@/lib/scoring";

/**
 * Capture a stage transition snapshot for conversion tracking.
 *
 * Loads current lead + property + distress_events + scoring data,
 * builds a signal combination fingerprint, calculates days in previous stage,
 * and inserts a snapshot row.
 *
 * Non-fatal: errors are logged but do not block the status update.
 */
export async function captureStageTransition(
  leadId: string,
  fromStatus: string | null,
  toStatus: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (name: string) => sb.from(name) as any;

    // Load lead + property
    const { data: lead } = await tbl("leads")
      .select("property_id, priority, tags, created_at, updated_at")
      .eq("id", leadId)
      .single();

    if (!lead?.property_id) return;

    // Load active distress events for signal combination
    const { data: events } = await tbl("distress_events")
      .select("event_type")
      .eq("property_id", lead.property_id)
      .in("status", ["active", "unknown"])
      .limit(20);

    // Build signal types array and combination string (sorted + joined)
    const signalTypes = [...new Set((events ?? []).map((e: { event_type: string }) => e.event_type))].sort();
    const signalCombination = signalTypes.length > 0 ? signalTypes.join("+") : null;

    // Score and tier at transition
    const score = lead.priority ?? null;
    const tier = score != null ? getScoreLabel(score) : null;

    // Determine import source from property flags
    const { data: prop } = await tbl("properties")
      .select("owner_flags")
      .eq("id", lead.property_id)
      .single();

    const flags = (prop?.owner_flags ?? {}) as Record<string, unknown>;
    let importSource: string = "unknown";
    if (typeof flags.source === "string") {
      if (flags.source.startsWith("csv:")) importSource = "csv";
      else importSource = flags.source as string;
    }
    if (flags.bulk_seed) importSource = "propertyradar";

    // Calculate days in previous stage from the last snapshot or lead created_at
    let daysInPrevious: number | null = null;
    if (fromStatus) {
      const { data: lastSnapshot } = await tbl("lead_stage_snapshots")
        .select("created_at")
        .eq("lead_id", leadId)
        .eq("to_status", fromStatus)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const enteredAt = lastSnapshot?.created_at ?? lead.created_at;
      if (enteredAt) {
        daysInPrevious = Math.round((Date.now() - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    // Insert snapshot
    const { error } = await tbl("lead_stage_snapshots").insert({
      lead_id: leadId,
      property_id: lead.property_id,
      from_status: fromStatus,
      to_status: toStatus,
      score_at_transition: score,
      tier_at_transition: tier,
      signal_types: signalTypes.length > 0 ? signalTypes : null,
      signal_combination: signalCombination,
      import_source: importSource,
      days_in_previous_stage: daysInPrevious,
      metadata: metadata ?? {},
    });

    if (error) {
      console.error(`[ConversionTracking] Snapshot insert failed for lead ${leadId}:`, error.message);
    }
  } catch (err) {
    // Non-fatal — never block the status update
    console.error("[ConversionTracking] Error capturing stage transition:", err);
  }
}
