/**
 * GET /api/dialer/v1/review
 *
 * Dialer operational review — reads dialer_events to compute:
 *   1. Callback slippage rate
 *      (follow_up.callback_date_defaulted / follow_up.task_created)
 *   2. Follow-up task creation rate
 *      (follow_up.task_created / call.published with follow_up or appointment)
 *   3. AI output flag rate
 *      (ai_output.flagged / ai_output.reviewed)
 *
 * Query params:
 *   ?days=N  — lookback window in days (default: 30, max: 90)
 *
 * BOUNDARY RULES:
 *   - Auth via getDialerUser() — dialer auth path only
 *   - DB via createDialerClient() — never imports createServerClient
 *   - Reads dialer_events only — never queries CRM-owned tables
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface EventCounts {
  call_published:                number;
  call_published_follow_up:      number;  // call.published where disposition is follow_up|appointment
  follow_up_task_created:        number;
  follow_up_callback_defaulted:  number;
  ai_reviewed:                   number;
  ai_flagged:                    number;
}

export interface WarmTransferCounts {
  flagged_ready:   number;  // inbound.classified with warm_transfer_ready=true
  connected:       number;  // transfer.connected
  failed_fallback: number;  // transfer.failed_fallback (all fallback reasons)
  no_answer:       number;  // transfer.failed_fallback with outcome=no_answer specifically
  callback_booked: number;  // transfer.failed_fallback with outcome=callback_fallback
}

export interface DialerReviewResult {
  window_days:              number;
  since:                    string;   // ISO timestamp
  counts:                   EventCounts;
  /**
   * Fraction of follow_up/appointment calls where no callback date was set
   * and the task due_at was defaulted to next business morning.
   * null when no tasks have been created yet.
   */
  callback_slippage_pct:    number | null;
  /**
   * Fraction of follow_up/appointment calls that produced a task row.
   * null when no follow_up/appointment calls have been published yet.
   * A low rate here may indicate task creation is failing or being skipped.
   */
  task_creation_pct:        number | null;
  /**
   * Fraction of AI-reviewed outputs that were flagged as bad by the operator.
   * null when no AI outputs have been reviewed yet.
   */
  ai_flag_rate_pct:         number | null;
  /** Warm-transfer reliability — null when no warm-transfer events in the window. */
  warm_transfer:            WarmTransferCounts | null;
  /**
   * Fraction of warm-transfer-ready sellers that resulted in a connected transfer.
   * null when no transfers have been logged yet.
   */
  warm_transfer_connect_pct: number | null;
}

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse ?days param — default 30, max 90
  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get("days");
  let days = 30;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      days = Math.min(parsed, 90);
    }
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sb = createDialerClient();

  // Fetch all relevant event types in the window in one query.
  // dialer_events has no CRM-owned columns — safe to read directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (sb.from("dialer_events") as any)
    .select("event_type, payload")
    .in("event_type", [
      "call.published",
      "follow_up.task_created",
      "follow_up.callback_date_defaulted",
      "ai_output.reviewed",
      "ai_output.flagged",
    ])
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[dialer/review] dialer_events query failed:", error.message);
    return NextResponse.json({ error: "Failed to load review data" }, { status: 500 });
  }

  // Aggregate counts
  const counts: EventCounts = {
    call_published:               0,
    call_published_follow_up:     0,
    follow_up_task_created:       0,
    follow_up_callback_defaulted: 0,
    ai_reviewed:                  0,
    ai_flagged:                   0,
  };

  for (const row of (rows ?? []) as Array<{ event_type: string; payload: Record<string, unknown> | null }>) {
    switch (row.event_type) {
      case "call.published":
        counts.call_published++;
        // call.published payload carries disposition — count follow_up and appointment separately
        if (
          row.payload?.disposition === "follow_up" ||
          row.payload?.disposition === "appointment"
        ) {
          counts.call_published_follow_up++;
        }
        break;
      case "follow_up.task_created":
        counts.follow_up_task_created++;
        break;
      case "follow_up.callback_date_defaulted":
        counts.follow_up_callback_defaulted++;
        break;
      case "ai_output.reviewed":
        counts.ai_reviewed++;
        break;
      case "ai_output.flagged":
        counts.ai_flagged++;
        break;
    }
  }

  // ── Warm-transfer reliability (separate query — different event types) ──────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: transferRows } = await (sb.from("dialer_events") as any)
    .select("event_type, metadata")
    .in("event_type", [
      "inbound.classified",
      "transfer.connected",
      "transfer.failed_fallback",
    ])
    .gte("created_at", since);

  const wt: WarmTransferCounts = {
    flagged_ready:   0,
    connected:       0,
    failed_fallback: 0,
    no_answer:       0,
    callback_booked: 0,
  };

  for (const row of (transferRows ?? []) as Array<{ event_type: string; metadata: Record<string, unknown> | null }>) {
    const meta = row.metadata ?? {};
    switch (row.event_type) {
      case "inbound.classified":
        if (meta.warm_transfer_ready === true) wt.flagged_ready++;
        break;
      case "transfer.connected":
        wt.connected++;
        break;
      case "transfer.failed_fallback":
        wt.failed_fallback++;
        if (meta.outcome === "no_answer")         wt.no_answer++;
        if (meta.outcome === "callback_fallback")  wt.callback_booked++;
        break;
    }
  }

  const hasTransferData = wt.flagged_ready > 0 || wt.connected > 0 || wt.failed_fallback > 0;

  // Compute rates — null when denominator is zero (no data yet)
  const pct = (num: number, denom: number): number | null =>
    denom === 0 ? null : Math.round((num / denom) * 1000) / 10; // one decimal

  const result: DialerReviewResult = {
    window_days:             days,
    since,
    counts,
    // Slippage: of tasks created, how many had no operator date?
    callback_slippage_pct:   pct(counts.follow_up_callback_defaulted, counts.follow_up_task_created),
    // Task creation: of follow_up/appointment calls, how many produced a task?
    task_creation_pct:       pct(counts.follow_up_task_created,       counts.call_published_follow_up),
    // AI flag rate: of reviewed outputs, how many were flagged bad?
    ai_flag_rate_pct:        pct(counts.ai_flagged,                   counts.ai_reviewed),
    // Warm transfer reliability
    warm_transfer:             hasTransferData ? wt : null,
    warm_transfer_connect_pct: hasTransferData
      ? pct(wt.connected, wt.flagged_ready)
      : null,
  };

  return NextResponse.json(result);
}
