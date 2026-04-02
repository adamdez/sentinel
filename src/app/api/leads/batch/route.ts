import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { validateStageTransition } from "@/lib/lead-guardrails";
import type { LeadStatus } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/leads/batch
 *
 * Batch operations on multiple leads. Supports:
 *   - stage_transition: Move multiple leads to a new stage
 *   - set_next_action: Set next_action on multiple leads
 *   - set_next_follow_up: Set next_follow_up_at on multiple leads
 *   - delete_customer_files: Delete many leads in one DB transaction
 *
 * Each operation validates individually — partial success is possible.
 * Returns per-lead results so the UI can show what succeeded/failed.
 *
 * Auth: Requires authenticated operator.
 * Write path: leads table (action core) + event_log (audit trail).
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { operation, leadIds, params: opParams } = body as {
    operation: string;
    leadIds: string[];
    params: Record<string, unknown>;
  };

  if (!operation || !Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "operation and leadIds[] required" }, { status: 400 });
  }

  const maxLeadIds = operation === "delete_customer_files" ? 500 : 50;
  if (leadIds.length > maxLeadIds) {
    return NextResponse.json({ error: `Max ${maxLeadIds} leads per batch for ${operation}` }, { status: 400 });
  }

  switch (operation) {
    case "stage_transition":
      return handleBatchStageTransition(sb, user, leadIds, opParams);

    case "set_next_action":
      return handleBatchSetNextAction(sb, user, leadIds, opParams);

    case "set_next_follow_up":
      return handleBatchSetNextFollowUp(sb, user, leadIds, opParams);

    case "delete_customer_files":
      return handleBatchDeleteCustomerFiles(sb, user, leadIds);

    default:
      return NextResponse.json({ error: `Unknown operation: ${operation}` }, { status: 400 });
  }
}

// ── Batch stage transition ─────────────────────────────────────────────────

async function handleBatchStageTransition(
  sb: ReturnType<typeof createServerClient>,
  user: { id: string },
  leadIds: string[],
  params: Record<string, unknown>,
) {
  const targetStatus = params.to as string;
  const nextAction = params.next_action as string | undefined;
  const nextActionDueAt = params.next_action_due_at as string | undefined;

  if (!targetStatus) {
    return NextResponse.json({ error: "params.to (target status) required" }, { status: 400 });
  }

  // Fetch all leads at once
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id, status, lock_version")
    .in("id", leadIds);

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: "No leads found" }, { status: 404 });
  }

  const results: Array<{ leadId: string; success: boolean; error?: string }> = [];
  const now = new Date().toISOString();

  for (const lead of leads) {
    const current = lead.status as LeadStatus;
    const target = targetStatus as LeadStatus;

    // Validate transition
    const validation = validateStageTransition(current, target, nextAction);
    if (!validation.valid) {
      results.push({ leadId: lead.id, success: false, error: validation.message });
      continue;
    }

    // Update with optimistic lock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (sb.from("leads") as any)
      .update({
        status: target,
        next_action: nextAction?.trim() ?? null,
        next_action_due_at: nextActionDueAt ?? null,
        lock_version: (lead.lock_version ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", lead.id)
      .eq("lock_version", lead.lock_version ?? 0);

    if (updateError) {
      results.push({ leadId: lead.id, success: false, error: updateError.message });
      continue;
    }

    // Audit log (non-blocking)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "lead.batch_stage_transition",
      entity_type: "lead",
      entity_id: lead.id,
      details: { from: current, to: target, next_action: nextAction ?? null, batch: true },
    }).then(() => {}).catch(() => {});

    if (nextAction) {
      try {
        const { evictFromDialQueueIfDriveBy } = await import("@/lib/dial-queue");
        await evictFromDialQueueIfDriveBy(sb, lead.id, nextAction);
      } catch { /* non-fatal */ }
    }

    results.push({ leadId: lead.id, success: true });
  }

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({ ok: true, total: leads.length, succeeded, failed: leads.length - succeeded, results });
}

// ── Batch set next action ──────────────────────────────────────────────────

async function handleBatchSetNextAction(
  sb: ReturnType<typeof createServerClient>,
  user: { id: string },
  leadIds: string[],
  params: Record<string, unknown>,
) {
  const nextAction = params.next_action as string;
  const nextActionDueAt = params.next_action_due_at as string | undefined;

  if (!nextAction) {
    return NextResponse.json({ error: "params.next_action required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (sb.from("leads") as any)
    .update({
      next_action: nextAction.trim(),
      next_action_due_at: nextActionDueAt ?? null,
      updated_at: now,
    })
    .in("id", leadIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "lead.batch_set_next_action",
    entity_type: "lead",
    entity_id: null,
    details: { leadIds, next_action: nextAction, next_action_due_at: nextActionDueAt ?? null, count },
  }).then(() => {}).catch(() => {});

  // Drive By queue eviction (bulk — clear all affected leads at once)
  try {
    const { isDriveByNextAction } = await import("@/lib/dial-queue");
    if (isDriveByNextAction(nextAction)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({ dial_queue_active: false, dial_queue_added_at: null, dial_queue_added_by: null })
        .in("id", leadIds)
        .eq("dial_queue_active", true);
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, updated: count ?? leadIds.length });
}

// ── Batch set next follow-up ───────────────────────────────────────────────

async function handleBatchSetNextFollowUp(
  sb: ReturnType<typeof createServerClient>,
  user: { id: string },
  leadIds: string[],
  params: Record<string, unknown>,
) {
  const nextFollowUpAt = params.next_follow_up_at as string;

  if (!nextFollowUpAt) {
    return NextResponse.json({ error: "params.next_follow_up_at required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, count } = await (sb.from("leads") as any)
    .update({
      next_follow_up_at: nextFollowUpAt,
      updated_at: now,
    })
    .in("id", leadIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "lead.batch_set_follow_up",
    entity_type: "lead",
    entity_id: null,
    details: { leadIds, next_follow_up_at: nextFollowUpAt, count },
  }).then(() => {}).catch(() => {});

  return NextResponse.json({ ok: true, updated: count ?? leadIds.length });
}

// —— Batch delete customer files ————————————————————————————————————————————————

async function handleBatchDeleteCustomerFiles(
  sb: ReturnType<typeof createServerClient>,
  user: { id: string; email?: string | null },
  leadIds: string[],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcErr } = await (sb as any).rpc("delete_customer_files", {
    p_lead_ids: leadIds,
  });

  if (rpcErr) {
    console.error("[API/leads/batch] delete_customer_files RPC error:", rpcErr);
    return NextResponse.json(
      { ok: false, error: rpcErr.message },
      { status: 500 },
    );
  }

  const result = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
  if (!result || result.success === false) {
    return NextResponse.json(
      { ok: false, error: result?.error ?? "Delete failed" },
      { status: 500 },
    );
  }

  const deletedLeadIds = Array.isArray(result.deleted_lead_ids)
    ? result.deleted_lead_ids.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const skippedLeadIds = Array.isArray(result.skipped_lead_ids)
    ? result.skipped_lead_ids.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const deletedProperties = typeof result.deleted_properties === "number" ? result.deleted_properties : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "lead.batch_delete_customer_files",
    entity_type: "lead",
    entity_id: null,
    details: {
      requested_lead_ids: leadIds,
      deleted_lead_ids: deletedLeadIds,
      skipped_lead_ids: skippedLeadIds,
      deleted_properties: deletedProperties,
      deleted_by: user.id,
      deleted_by_email: user.email ?? null,
    },
  }).then(() => {}).catch((error: unknown) => {
    console.error("[API/leads/batch] Batch delete audit log failed (non-fatal):", error);
  });

  return NextResponse.json({
    ok: true,
    deletedLeadIds,
    skippedLeadIds,
    deletedProperties,
    failed: [],
  });
}
