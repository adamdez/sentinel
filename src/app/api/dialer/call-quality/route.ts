/**
 * GET /api/dialer/call-quality
 *
 * Read-only call quality snapshot for the operator review queue.
 *
 * Returns:
 *   - Aggregate counts from dialer_events (last N days): reviewed, flagged, corrections
 *   - Per-item unreviewed traces from dialer_ai_traces: the most recent items
 *     where review_flag = false (not yet reviewed by an operator)
 *   - Per-workflow breakdown (extract vs summarize)
 *   - Correction rate: how often operators overrode AI suggestions
 *
 * Query params:
 *   ?days=N  — lookback window (default 30, max 90)
 *
 * BOUNDARY RULES:
 *   - CRM auth: requireAuth + createServerClient (not dialer auth path)
 *   - Reads dialer_events and dialer_ai_traces — no CRM writes ever
 *   - dialer_events lead_id is in payload JSONB (not top-level column)
 *   - dialer_ai_traces has direct lead_id column
 *   - Does NOT import from any @/lib/dialer/* module (domain boundary)
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface QueueItem {
  runId: string;
  workflow: "extract" | "summarize" | string;
  promptVersion: string;
  model: string;
  leadId: string | null;
  /** Display label — address or owner name, resolved server-side */
  leadLabel: string | null;
  outputPreview: string | null;
  createdAt: string;
  /** Deep link to the lead detail surface */
  leadHref: string | null;
}

export interface WorkflowBreakdown {
  workflow: string;
  total: number;
  flagged: number;
  flagRate: number | null;
}

export interface CallQualitySnapshot {
  windowDays: number;
  since: string;
  generatedAt: string;
  // ── Aggregate event counts (from dialer_events) ──────────────
  eventsReviewed: number;
  eventsFlagged: number;
  eventsMotivationCorrected: number;
  eventsTimelineCorrected: number;
  /** pct of reviewed that were flagged */
  flagRatePct: number | null;
  /** pct of reviewed with any operator correction */
  correctionRatePct: number | null;
  // ── Trace counts (from dialer_ai_traces) ────────────────────
  tracesTotal: number;
  tracesUnreviewed: number;
  tracesFlagged: number;
  workflowBreakdown: WorkflowBreakdown[];
  // ── Queue: most recent unreviewed items ─────────────────────
  unreviewedQueue: QueueItem[];
  /** Most recently flagged items (may overlap with unreviewed) */
  flaggedQueue: QueueItem[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function pct(num: number, denom: number): number | null {
  return denom === 0 ? null : Math.round((num / denom) * 1000) / 10;
}

function outputPreview(text: string | null, maxLen = 120): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  return trimmed.length <= maxLen ? trimmed : trimmed.slice(0, maxLen) + "…";
}

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const daysParam = searchParams.get("days");
    let days = 30;
    if (daysParam) {
      const parsed = parseInt(daysParam, 10);
      if (!Number.isNaN(parsed) && parsed > 0) days = Math.min(parsed, 90);
    }

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // ── Dialer events aggregate (same logic as /api/dialer/v1/review) ─────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eventRows } = await (sb.from("dialer_events") as any)
      .select("event_type, payload")
      .in("event_type", ["ai_output.reviewed", "ai_output.flagged"])
      .gte("created_at", since);

    let eventsReviewed = 0;
    let eventsFlagged = 0;
    let eventsMotivationCorrected = 0;
    let eventsTimelineCorrected = 0;

    for (const row of (eventRows ?? []) as Array<{ event_type: string; payload: Record<string, unknown> | null }>) {
      if (row.event_type === "ai_output.reviewed") {
        eventsReviewed++;
        if (row.payload?.motivation_corrected === true) eventsMotivationCorrected++;
        if (row.payload?.timeline_corrected    === true) eventsTimelineCorrected++;
      } else if (row.event_type === "ai_output.flagged") {
        eventsFlagged++;
      }
    }

    const totalCorrected = eventsMotivationCorrected + eventsTimelineCorrected;

    // ── All recent traces in window ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allTraces } = await (sb.from("dialer_ai_traces") as any)
      .select("run_id, workflow, prompt_version, model, lead_id, review_flag, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    const traceList = (allTraces ?? []) as Array<{
      run_id: string;
      workflow: string;
      prompt_version: string;
      model: string;
      lead_id: string | null;
      review_flag: boolean;
      created_at: string;
    }>;

    const tracesTotal      = traceList.length;
    const tracesUnreviewed = traceList.filter((t) => !t.review_flag).length;
    const tracesFlagged    = traceList.filter((t) => t.review_flag).length;

    // Per-workflow breakdown
    const workflowMap: Record<string, { total: number; flagged: number }> = {};
    for (const t of traceList) {
      if (!workflowMap[t.workflow]) workflowMap[t.workflow] = { total: 0, flagged: 0 };
      workflowMap[t.workflow].total++;
      if (t.review_flag) workflowMap[t.workflow].flagged++;
    }
    const workflowBreakdown: WorkflowBreakdown[] = Object.entries(workflowMap).map(([wf, v]) => ({
      workflow: wf,
      total: v.total,
      flagged: v.flagged,
      flagRate: pct(v.flagged, v.total),
    }));

    // ── Top unreviewed + flagged items with output preview ────────────────────
    const unreviewedTraces = traceList.filter((t) => !t.review_flag).slice(0, 10);
    const flaggedTraces    = traceList.filter((t) => t.review_flag).slice(0, 5);

    const queueLeadIds = [
      ...new Set([
        ...unreviewedTraces.filter((t) => t.lead_id).map((t) => t.lead_id!),
        ...flaggedTraces.filter((t) => t.lead_id).map((t) => t.lead_id!),
      ]),
    ].slice(0, 100);

    // Fetch output_text for queue items
    const queueRunIds = [
      ...unreviewedTraces.map((t) => t.run_id),
      ...flaggedTraces.map((t) => t.run_id),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: outputRows } = queueRunIds.length > 0
      ? await (sb.from("dialer_ai_traces") as any)
          .select("run_id, output_text")
          .in("run_id", queueRunIds)
      : { data: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputMap: Record<string, string | null> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (outputRows ?? []).forEach((r: any) => { outputMap[r.run_id] = r.output_text ?? null; });

    // Build label map
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labelMap: Record<string, string> = {};

    if (queueLeadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsForLabels } = await (sb.from("leads") as any)
        .select("id, property_id")
        .in("id", queueLeadIds);

      const propIds = [
        ...new Set(
          (leadsForLabels ?? [])
            .filter((l: { property_id: string | null }) => l.property_id)
            .map((l: { property_id: string }) => l.property_id)
        ),
      ].slice(0, 100);

      if (propIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: props } = await (sb.from("properties") as any)
          .select("id, address, owner_name")
          .in("id", propIds);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const propMap: Record<string, { address: string | null; owner_name: string | null }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props ?? []).forEach((p: any) => { propMap[p.id] = p; });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (leadsForLabels ?? []).forEach((l: any) => {
          const prop = propMap[l.property_id] ?? {};
          labelMap[l.id] = prop.address ?? prop.owner_name ?? l.id.slice(0, 8);
        });
      }
    }

    function toQueueItem(
      t: { run_id: string; workflow: string; prompt_version: string; model: string; lead_id: string | null; created_at: string }
    ): QueueItem {
      const leadLabel = t.lead_id ? (labelMap[t.lead_id] ?? t.lead_id.slice(0, 8)) : null;
      return {
        runId: t.run_id,
        workflow: t.workflow,
        promptVersion: t.prompt_version,
        model: t.model,
        leadId: t.lead_id,
        leadLabel,
        outputPreview: outputPreview(outputMap[t.run_id] ?? null),
        createdAt: t.created_at,
        leadHref: t.lead_id ? `/leads?open=${t.lead_id}` : null,
      };
    }

    const snapshot: CallQualitySnapshot = {
      windowDays: days,
      since,
      generatedAt: new Date().toISOString(),
      eventsReviewed,
      eventsFlagged,
      eventsMotivationCorrected,
      eventsTimelineCorrected,
      flagRatePct:      pct(eventsFlagged,  eventsReviewed),
      correctionRatePct: pct(totalCorrected, eventsReviewed),
      tracesTotal,
      tracesUnreviewed,
      tracesFlagged,
      workflowBreakdown,
      unreviewedQueue: unreviewedTraces.map(toQueueItem),
      flaggedQueue:    flaggedTraces.map(toQueueItem),
    };

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[API/dialer/call-quality] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
