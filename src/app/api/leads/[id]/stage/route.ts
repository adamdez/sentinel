import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { validateStageTransition, incrementLockVersion } from "@/lib/lead-guardrails";
import { n8nLeadStageChanged } from "@/lib/n8n-dispatch";
import { getFeatureFlag } from "@/lib/control-plane";
import { inngest } from "@/inngest/client";
import type { LeadStatus, StageTransitionRequest, StageTransitionResult, StageTransitionError } from "@/lib/types";

/**
 * PATCH /api/leads/[id]/stage
 *
 * Guarded stage transition endpoint. Enforces:
 *   1. Valid state machine transition (ALLOWED_TRANSITIONS)
 *   2. next_action required for all forward-moving transitions
 *   3. Optimistic locking — request must include current lock_version
 *   4. Authenticated operator only
 *
 * On lock conflict (another operator saved first), returns 409.
 * On invalid transition, returns 422 with specific code.
 *
 * Writes to:
 *   - leads.status
 *   - leads.next_action
 *   - leads.next_action_due_at
 *   - leads.lock_version (incremented)
 *   - leads.updated_at
 * Also appends to event_log for audit trail.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = (await req.json()) as Partial<StageTransitionRequest>;

    // ── Validate request shape ──
    if (!body.to) {
      return NextResponse.json<StageTransitionError>(
        { success: false, error: "Field 'to' (target status) is required", code: "invalid_transition" },
        { status: 400 }
      );
    }
    if (body.lock_version === undefined || body.lock_version === null) {
      return NextResponse.json<StageTransitionError>(
        { success: false, error: "Field 'lock_version' is required for optimistic locking", code: "lock_conflict" },
        { status: 400 }
      );
    }

    // ── Fetch current lead state ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: fetchError } = await (sb.from("leads") as any)
      .select("id, status, lock_version, next_action")
      .eq("id", id)
      .single() as { data: { id: string; status: string; lock_version: number; next_action: string | null } | null; error: { message: string; code?: string } | null };

    if (fetchError || !lead) {
      return NextResponse.json<StageTransitionError>(
        { success: false, error: "Lead not found", code: "not_found" },
        { status: 404 }
      );
    }

    const current = lead.status as LeadStatus;
    const target = body.to as LeadStatus;

    // ── Validate the transition ──
    const validation = validateStageTransition(current, target, body.next_action);
    if (!validation.valid) {
      const status = validation.code === "missing_next_action" ? 422 : 422;
      return NextResponse.json<StageTransitionError>(
        { success: false, error: validation.message, code: validation.code },
        { status }
      );
    }

    // ── Optimistic lock check — compare-and-swap ──
    if (lead.lock_version !== body.lock_version) {
      return NextResponse.json<StageTransitionError>(
        {
          success: false,
          error: `Lock version mismatch. Expected ${lead.lock_version}, got ${body.lock_version}. Reload and retry.`,
          code: "lock_conflict",
        },
        { status: 409 }
      );
    }

    const newLockVersion = incrementLockVersion(lead.lock_version);
    const now = new Date().toISOString();

    // ── Write new stage + next_action ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (sb.from("leads") as any)
      .update({
        status: target,
        next_action: body.next_action?.trim() ?? null,
        next_action_due_at: body.next_action_due_at ?? null,
        lock_version: newLockVersion,
        updated_at: now,
      })
      .eq("id", id)
      .eq("lock_version", body.lock_version) // double-check via DB predicate
      .select("id, status, next_action, next_action_due_at, lock_version")
      .single();

    if (updateError) {
      // If no rows returned from the eq lock_version check, it's a true conflict
      if (updateError.code === "PGRST116") {
        return NextResponse.json<StageTransitionError>(
          { success: false, error: "Lock conflict — lead was modified concurrently. Reload and retry.", code: "lock_conflict" },
          { status: 409 }
        );
      }
      return NextResponse.json<StageTransitionError>(
        { success: false, error: updateError.message, code: "invalid_transition" },
        { status: 500 }
      );
    }

    // ── Audit log ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "lead.stage_transition",
      entity_type: "lead",
      entity_id: id,
      details: {
        from: current,
        to: target,
        next_action: body.next_action?.trim() ?? null,
        next_action_due_at: body.next_action_due_at ?? null,
        lock_version_before: body.lock_version,
        lock_version_after: newLockVersion,
      },
    });

    // Drive By queue eviction
    if (body.next_action) {
      try {
        const { evictFromDialQueueIfDriveBy } = await import("@/lib/dial-queue");
        await evictFromDialQueueIfDriveBy(sb, id, body.next_action);
      } catch { /* non-fatal */ }
    }

    // ── Auto-trigger Dispo Agent on disposition stage entry (fire-and-forget) ──
    if (target === "disposition") {
      getFeatureFlag("agent.dispo.enabled").then((flag) => {
        if (!flag?.enabled) {
          console.debug(`[stage-transition] Dispo agent trigger skipped — feature flag agent.dispo.enabled not enabled`);
          return;
        }
        // Durable dispo agent trigger — retried automatically by Inngest if it fails
        void inngest.send({
          name: "agent/dispo.requested",
          data: {
            dealId: "",    // deal lookup handled inside the Inngest function
            leadId: id,
            triggerType: "stage_transition",
            triggerRef: `stage:${target}`,
          },
        }).catch((err) => {
          console.error(`[stage] Inngest dispo trigger failed for lead ${id}:`, err);
        });
      });
    }

    // ── n8n outbound webhook (fire-and-forget) ──
    n8nLeadStageChanged({
      leadId: id,
      previousStage: current,
      newStage: target,
      nextAction: body.next_action?.trim() ?? null,
      ownerName: null, // filled by n8n if needed
      address: null,
      operatorId: user.id,
    }).catch(() => {});

    // ── Auto-trigger Research Agent on negotiation stage entry (fire-and-forget) ──
    if (target === "negotiation") {
      getFeatureFlag("agent.research.enabled").then((flag) => {
        if (!flag?.enabled) {
          console.debug(`[stage-transition] Research agent trigger skipped — feature flag agent.research.enabled not enabled`);
          return;
        }
        // Durable research agent trigger — retried automatically by Inngest if it fails
        void inngest.send({
          name: "agent/research.requested",
          data: {
            leadId: id,
            triggeredBy: "stage_transition",
            operatorNotes: `Triggered by stage transition to ${target}`,
          },
        }).catch((err) => {
          console.error(`[stage] Inngest research trigger failed for lead ${id}:`, err);
        });
      });
    }

    return NextResponse.json<StageTransitionResult>({
      success: true,
      lead_id: id,
      previous_status: current,
      new_status: updated.status,
      next_action: updated.next_action,
      next_action_due_at: updated.next_action_due_at,
      lock_version: updated.lock_version,
    });
  } catch (err) {
    console.error("[API/leads/id/stage] PATCH error:", err);
    return NextResponse.json<StageTransitionError>(
      { success: false, error: "Internal server error", code: "invalid_transition" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/leads/[id]/stage
 *
 * Returns the current stage state + allowed transitions for this lead.
 * Cursor uses this to render the stage transition UI with correct options.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error } = await (sb.from("leads") as any)
      .select("id, status, lock_version, next_action, next_action_due_at")
      .eq("id", id)
      .single() as { data: { id: string; status: string; lock_version: number; next_action: string | null; next_action_due_at: string | null } | null; error: { message: string } | null };

    if (error || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { getAllowedTransitions, requiresNextAction } = await import("@/lib/lead-guardrails");
    const current = lead.status as LeadStatus;
    const allowed = getAllowedTransitions(current);

    return NextResponse.json({
      lead_id: id,
      current_status: current,
      lock_version: lead.lock_version,
      next_action: lead.next_action,
      next_action_due_at: lead.next_action_due_at,
      allowed_transitions: allowed.map((s) => ({
        status: s,
        requires_next_action: requiresNextAction(s),
      })),
    });
  } catch (err) {
    console.error("[API/leads/id/stage] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

