/**
 * DELETE /api/dialer/v1/dial-queue?leadId=...
 *
 * POST adds one or more leads to the operator's explicit dial queue.
 * DELETE removes a lead from the operator's explicit dial queue without
 * clearing ownership.
 * Logs a dialer_event for audit trail so the removal is traceable.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { queueLeadIdsForUser, removeLeadFromDialQueue } from "@/lib/dial-queue";
import { ensureAutoCycleEnrollmentForQueuedLeads } from "@/lib/dialer/auto-cycle-enrollment";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const user = await getDialerUser(authHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  if (leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds is required" }, { status: 400 });
  }

  const sb = createDialerClient(authHeader);

  try {
    const result = await queueLeadIdsForUser({ sb, userId: user.id, leadIds });
    try {
      await ensureAutoCycleEnrollmentForQueuedLeads({
        sb,
        userId: user.id,
        leadIds: result.queuedIds,
      });
    } catch (enrollmentError) {
      console.error("[dial-queue] auto-cycle enrollment after queue add failed:", enrollmentError);
    }

    // Keep queueing success from being masked by an audit-log failure.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("dialer_events") as any)
      .insert({
        event_type: "queue.added",
        user_id: user.id,
        metadata: {
          queued_count: result.queuedIds.length,
          conflicted_count: result.conflictedIds.length,
          missing_count: result.missingIds.length,
          lead_ids: result.queuedIds,
        },
      })
      .then(({ error: eventError }: { error: { message?: string | null } | null }) => {
        if (eventError) {
          console.error("[dial-queue] queue add event log failed:", eventError.message ?? eventError);
        }
      })
      .catch((eventError: unknown) => {
        console.error("[dial-queue] queue add event log failed:", eventError);
      });

    return NextResponse.json({
      ok: true,
      queuedIds: result.queuedIds,
      conflictedIds: result.conflictedIds,
      missingIds: result.missingIds,
    });
  } catch (error) {
    console.error("[dial-queue] queue add failed:", error);
    return NextResponse.json({ error: "Failed to add leads to dial queue" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const user = await getDialerUser(authHeader);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const sb = createDialerClient(authHeader);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("id, assigned_to, status")
    .eq("id", leadId)
    .maybeSingle();

  try {
    const removal = await removeLeadFromDialQueue({ sb, leadId, userId: user.id });
    if (removal === "not_found") {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (removal === "not_owned") {
      return NextResponse.json({ error: "Lead is not assigned to you" }, { status: 403 });
    }
  } catch (error) {
    console.error("[dial-queue] remove failed:", error);
    return NextResponse.json({ error: "Failed to remove from queue" }, { status: 500 });
  }

  // Log audit event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dialer_events") as any)
    .insert({
      event_type: "queue.removed",
      user_id: user.id,
      lead_id: leadId,
      metadata: {
        previous_status: lead?.status ?? null,
        action: "manual_queue_removal",
      },
    })
    .then(({ error: evErr }: { error: { message: string } | null }) => {
      if (evErr) console.error("[dial-queue] event log failed:", evErr.message);
    });

  return NextResponse.json({ ok: true, lead_id: leadId });
}
