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

  if (leadIds.length > 50) {
    return NextResponse.json({ error: "Max 50 leads per batch" }, { status: 400 });
  }

  switch (operation) {
    case "stage_transition":
      return handleBatchStageTransition(sb, user, leadIds, opParams);

    case "set_next_action":
      return handleBatchSetNextAction(sb, user, leadIds, opParams);

    case "set_next_follow_up":
      return handleBatchSetNextFollowUp(sb, user, leadIds, opParams);

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
