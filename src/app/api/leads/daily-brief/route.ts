/**
 * GET /api/leads/daily-brief
 *
 * Daily war-room brief: read-only summary of the 4 most actionable signals.
 *
 * Returns:
 *   - topCallbackSlippage  — dialer aggregate: callback_defaulted / task_created rate
 *   - topOverdueLead       — single most overdue follow-up lead
 *   - topOverdueTask       — single most overdue task
 *   - topFlaggedAiOutput   — single oldest unreviewed flagged AI output
 *   - topAttentionLeads    — top 3 leads needing attention now (combined signals)
 *   - dialerWindow         — aggregate counts from dialer_events (last 30 days)
 *
 * BOUNDARY RULES:
 *   - CRM auth path: requireAuth + createServerClient
 *   - Reads leads, tasks, properties, dialer_events — no CRM writes, ever
 *   - dialer_events lead_id is stored inside payload JSONB
 *   - Does not call the review or opportunity-queue HTTP routes internally
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface BriefLead {
  leadId: string;
  label: string;
  signal: "overdue_task" | "overdue_follow_up_lead" | "flagged_ai_output" | "defaulted_callback";
  missedAt: string | null;
  daysOverdue: number | null;
  detail: string | null;
}

export interface DialerWindow {
  windowDays: number;
  callsPublished: number;
  callsFollowUp: number;
  tasksCreated: number;
  callbacksDefaulted: number;
  aiReviewed: number;
  aiFlagged: number;
  /** Fraction of tasks with no operator date — null if no tasks yet */
  callbackSlippagePct: number | null;
  /** Fraction of follow_up calls that produced a task — null if no calls yet */
  taskCreationPct: number | null;
  /** Fraction of reviewed AI outputs flagged bad — null if no reviews yet */
  aiFlagRatePct: number | null;
}

export interface DailyBriefResponse {
  generatedAt: string;
  topCallbackSlippage: {
    pct: number | null;
    defaultedCount: number;
    taskCount: number;
    message: string;
  };
  topOverdueLead: BriefLead | null;
  topOverdueTask: BriefLead | null;
  topFlaggedAiOutput: BriefLead | null;
  topAttentionLeads: BriefLead[];
  dialerWindow: DialerWindow;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function daysOverdue(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function pct(num: number, denom: number): number | null {
  return denom === 0 ? null : Math.round((num / denom) * 1000) / 10;
}

function slippageMessage(slippagePct: number | null, defaulted: number, taskCount: number): string {
  if (slippagePct === null) return "No follow-up calls published yet this window.";
  if (defaulted === 0) return "No callback dates defaulted — operators set dates on every follow-up.";
  if (slippagePct >= 75) return `${slippagePct}% of tasks had no callback date set (${defaulted}/${taskCount}) — high slippage.`;
  if (slippagePct >= 40) return `${slippagePct}% callback slippage (${defaulted}/${taskCount}) — review follow-up discipline.`;
  return `${slippagePct}% callback slippage (${defaulted}/${taskCount}) — within acceptable range.`;
}

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── Dialer aggregate counts (last 30 days) ────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dialerRows } = await (sb.from("dialer_events") as any)
      .select("event_type, payload")
      .in("event_type", [
        "call.published",
        "follow_up.task_created",
        "follow_up.callback_date_defaulted",
        "ai_output.reviewed",
        "ai_output.flagged",
      ])
      .gte("created_at", thirtyDaysAgo);

    let callsPublished = 0;
    let callsFollowUp = 0;
    let tasksCreated = 0;
    let callbacksDefaulted = 0;
    let aiReviewed = 0;
    let aiFlagged = 0;

    for (const row of (dialerRows ?? []) as Array<{ event_type: string; payload: Record<string, unknown> | null }>) {
      switch (row.event_type) {
        case "call.published":
          callsPublished++;
          if (row.payload?.disposition === "follow_up" || row.payload?.disposition === "appointment") {
            callsFollowUp++;
          }
          break;
        case "follow_up.task_created":    tasksCreated++;         break;
        case "follow_up.callback_date_defaulted": callbacksDefaulted++; break;
        case "ai_output.reviewed":        aiReviewed++;           break;
        case "ai_output.flagged":         aiFlagged++;            break;
      }
    }

    const callbackSlippagePct = pct(callbacksDefaulted, tasksCreated);
    const taskCreationPct     = pct(tasksCreated,       callsFollowUp);
    const aiFlagRatePct       = pct(aiFlagged,          aiReviewed);

    const dialerWindow: DialerWindow = {
      windowDays: 30,
      callsPublished,
      callsFollowUp,
      tasksCreated,
      callbacksDefaulted,
      aiReviewed,
      aiFlagged,
      callbackSlippagePct,
      taskCreationPct,
      aiFlagRatePct,
    };

    // ── Overdue follow-up leads ───────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdueLeadsRaw } = await (sb.from("leads") as any)
      .select("id, next_follow_up_at, next_call_scheduled_at, property_id")
      .in("status", ["lead", "prospect", "negotiation", "nurture"])
      .or(`next_follow_up_at.lt.${now},next_call_scheduled_at.lt.${now}`)
      .not("next_follow_up_at", "is", null)
      .order("next_follow_up_at", { ascending: true })
      .limit(20);

    // ── Overdue tasks linked to leads ─────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdueTasksRaw } = await (sb.from("tasks") as any)
      .select("id, title, due_at, lead_id")
      .eq("status", "pending")
      .lt("due_at", now)
      .not("lead_id", "is", null)
      .is("completed_at", null)
      .order("due_at", { ascending: true })
      .limit(20);

    // ── Flagged AI outputs (unreviewed) ───────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: flaggedRaw } = await (sb.from("dialer_events") as any)
      .select("id, payload, created_at")
      .eq("event_type", "ai_output.flagged")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: true })
      .limit(20);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reviewedRaw } = await (sb.from("dialer_events") as any)
      .select("payload")
      .eq("event_type", "ai_output.reviewed")
      .gte("created_at", thirtyDaysAgo);

    const reviewedLeadIds = new Set<string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (reviewedRaw ?? []).map((e: any) => e.payload?.lead_id as string | null).filter(Boolean) as string[]
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flaggedEvents = (flaggedRaw ?? []).map((e: any) => ({
      id: e.id as string,
      lead_id: (e.payload?.lead_id as string | null) ?? null,
      created_at: e.created_at as string,
    })).filter((e: { id: string; lead_id: string | null; created_at: string }) => e.lead_id && !reviewedLeadIds.has(e.lead_id));

    // ── Defaulted callbacks ───────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defaultedRaw } = await (sb.from("dialer_events") as any)
      .select("id, payload, created_at")
      .eq("event_type", "follow_up.callback_date_defaulted")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultedEvents = (defaultedRaw ?? []).map((e: any) => ({
      id: e.id as string,
      lead_id: (e.payload?.lead_id as string | null) ?? null,
      created_at: e.created_at as string,
    }));

    // ── Build label map (property address / owner name) ───────────────────────
    const allLeadIds = [
      ...new Set([
        ...(overdueLeadsRaw ?? []).map((l: { id: string }) => l.id),
        ...(overdueTasksRaw ?? []).filter((t: { lead_id: string | null }) => t.lead_id).map((t: { lead_id: string }) => t.lead_id),
        ...flaggedEvents.map((e: { lead_id: string | null }) => e.lead_id!),
        ...defaultedEvents.filter((e: { lead_id: string | null }) => e.lead_id).map((e: { lead_id: string | null }) => e.lead_id!),
      ]),
    ].slice(0, 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labelMap: Record<string, string> = {};

    if (allLeadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsForLabels } = await (sb.from("leads") as any)
        .select("id, property_id")
        .in("id", allLeadIds);

      const propIds = [
        ...new Set(
          (leadsForLabels ?? [])
            .filter((l: { property_id: string | null }) => l.property_id)
            .map((l: { property_id: string }) => l.property_id)
        ),
      ].slice(0, 200);

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

    function labelFor(id: string | null): string {
      if (!id) return "Unknown";
      return labelMap[id] ?? id.slice(0, 8);
    }

    // ── Shape the 4 top items ─────────────────────────────────────────────────

    const topOverdueLead: BriefLead | null = (() => {
      const l = (overdueLeadsRaw ?? [])[0];
      if (!l) return null;
      const missedAt = l.next_follow_up_at ?? l.next_call_scheduled_at ?? null;
      return {
        leadId: l.id,
        label: labelFor(l.id),
        signal: "overdue_follow_up_lead",
        missedAt,
        daysOverdue: daysOverdue(missedAt),
        detail: null,
      };
    })();

    const topOverdueTask: BriefLead | null = (() => {
      const t = (overdueTasksRaw ?? [])[0];
      if (!t) return null;
      return {
        leadId: t.lead_id,
        label: labelFor(t.lead_id),
        signal: "overdue_task",
        missedAt: t.due_at,
        daysOverdue: daysOverdue(t.due_at),
        detail: t.title ?? null,
      };
    })();

    const topFlaggedAiOutput: BriefLead | null = (() => {
      const e = flaggedEvents[0];
      if (!e) return null;
      return {
        leadId: e.lead_id!,
        label: labelFor(e.lead_id),
        signal: "flagged_ai_output",
        missedAt: e.created_at,
        daysOverdue: daysOverdue(e.created_at),
        detail: "AI output flagged — needs operator review",
      };
    })();

    // ── Top 3 attention leads (deduped, priority order) ───────────────────────
    const seenLeadIds = new Set<string>();
    const attentionCandidates: BriefLead[] = [];

    // 1. Flagged AI outputs
    for (const e of flaggedEvents) {
      if (!e.lead_id || seenLeadIds.has(e.lead_id)) continue;
      seenLeadIds.add(e.lead_id);
      attentionCandidates.push({
        leadId: e.lead_id,
        label: labelFor(e.lead_id),
        signal: "flagged_ai_output",
        missedAt: e.created_at,
        daysOverdue: daysOverdue(e.created_at),
        detail: "AI output flagged",
      });
    }

    // 2. Overdue tasks
    for (const t of (overdueTasksRaw ?? [])) {
      if (!t.lead_id || seenLeadIds.has(t.lead_id)) continue;
      seenLeadIds.add(t.lead_id);
      attentionCandidates.push({
        leadId: t.lead_id,
        label: labelFor(t.lead_id),
        signal: "overdue_task",
        missedAt: t.due_at,
        daysOverdue: daysOverdue(t.due_at),
        detail: t.title ?? null,
      });
    }

    // 3. Overdue follow-up leads
    for (const l of (overdueLeadsRaw ?? [])) {
      if (seenLeadIds.has(l.id)) continue;
      seenLeadIds.add(l.id);
      const missedAt = l.next_follow_up_at ?? l.next_call_scheduled_at ?? null;
      attentionCandidates.push({
        leadId: l.id,
        label: labelFor(l.id),
        signal: "overdue_follow_up_lead",
        missedAt,
        daysOverdue: daysOverdue(missedAt),
        detail: null,
      });
    }

    // 4. Defaulted callbacks (lowest priority)
    for (const e of defaultedEvents) {
      if (!e.lead_id || seenLeadIds.has(e.lead_id)) continue;
      seenLeadIds.add(e.lead_id);
      attentionCandidates.push({
        leadId: e.lead_id,
        label: labelFor(e.lead_id),
        signal: "defaulted_callback",
        missedAt: e.created_at,
        daysOverdue: daysOverdue(e.created_at),
        detail: "Callback date not set at publish",
      });
    }

    const topAttentionLeads = attentionCandidates.slice(0, 3);

    // ── Assemble response ─────────────────────────────────────────────────────
    const response: DailyBriefResponse = {
      generatedAt: new Date().toISOString(),
      topCallbackSlippage: {
        pct: callbackSlippagePct,
        defaultedCount: callbacksDefaulted,
        taskCount: tasksCreated,
        message: slippageMessage(callbackSlippagePct, callbacksDefaulted, tasksCreated),
      },
      topOverdueLead,
      topOverdueTask,
      topFlaggedAiOutput,
      topAttentionLeads,
      dialerWindow,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[API/leads/daily-brief] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
