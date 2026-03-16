import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/leads/opportunity-queue
 *
 * Returns a narrow list of follow-up leakage signals from existing data:
 *   1. follow_up leads with next_follow_up_at now overdue
 *   2. pending follow_up tasks with due_at now overdue
 *   3. dialer_events with follow_up.callback_date_defaulted (last 30 days)
 *   4. dialer_events with ai_output.flagged that have no subsequent ai_output.reviewed
 *
 * Read-only. No mutations. No scoring. No migrations required.
 */

export type OpportunitySignal =
  | "overdue_follow_up_lead"
  | "overdue_task"
  | "defaulted_callback"
  | "flagged_ai_output";

export interface OpportunityItem {
  leadId: string;
  signal: OpportunitySignal;
  /** Display label — address or owner name */
  label: string;
  /** ISO timestamp of the missed moment */
  missedAt: string | null;
  /** Days overdue (positive = overdue) */
  daysOverdue: number | null;
  /** Task title if signal is overdue_task */
  taskTitle?: string | null;
  /** Dialer event id if signal is defaulted_callback or flagged_ai_output */
  eventId?: string | null;
}

export interface OpportunityQueueResponse {
  items: OpportunityItem[];
  counts: {
    overdue_follow_up_lead: number;
    overdue_task: number;
    defaulted_callback: number;
    flagged_ai_output: number;
  };
}

function daysOverdue(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date().toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ── 1. Overdue follow-up leads ────────────────────────────────────────────
    // leads in active pipeline stages where next_follow_up_at is in the past
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdueLeads } = await (sb.from("leads") as any)
      .select("id, next_follow_up_at, next_call_scheduled_at, property_id")
      .in("status", ["lead", "prospect", "negotiation", "nurture"])
      .or(`next_follow_up_at.lt.${now},next_call_scheduled_at.lt.${now}`)
      .not("next_follow_up_at", "is", null)
      .order("next_follow_up_at", { ascending: true })
      .limit(50);

    // ── 2. Overdue follow-up tasks linked to leads ────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdueTasks } = await (sb.from("tasks") as any)
      .select("id, title, due_at, lead_id")
      .eq("status", "pending")
      .lt("due_at", now)
      .not("lead_id", "is", null)
      .is("completed_at", null)
      .order("due_at", { ascending: true })
      .limit(50);

    // ── 3. Defaulted callback events (last 30 days) ───────────────────────────
    // lead_id is stored inside payload JSONB — select payload and extract in JS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: defaultedEventsRaw } = await (sb.from("dialer_events") as any)
      .select("id, payload, created_at")
      .eq("event_type", "follow_up.callback_date_defaulted")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultedEvents = (defaultedEventsRaw ?? []).map((e: any) => ({
      id: e.id,
      lead_id: (e.payload?.lead_id as string | null) ?? null,
      created_at: e.created_at,
    }));

    // ── 4. Flagged AI outputs without a subsequent reviewed event ─────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: flaggedEventsRaw } = await (sb.from("dialer_events") as any)
      .select("id, payload, created_at")
      .eq("event_type", "ai_output.flagged")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flaggedEvents = (flaggedEventsRaw ?? []).map((e: any) => ({
      id: e.id,
      lead_id: (e.payload?.lead_id as string | null) ?? null,
      created_at: e.created_at,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: reviewedEventsRaw } = await (sb.from("dialer_events") as any)
      .select("payload")
      .eq("event_type", "ai_output.reviewed")
      .gte("created_at", thirtyDaysAgo);

    const reviewedLeadIds = new Set<string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (reviewedEventsRaw ?? []).map((e: any) => e.payload?.lead_id as string | null).filter(Boolean) as string[]
    );

    const unreviewedFlagged = flaggedEvents.filter(
      (e: { id: string; lead_id: string | null; created_at: string }) => e.lead_id && !reviewedLeadIds.has(e.lead_id)
    );

    // ── Enrich with property/contact labels ──────────────────────────────────
    const allLeadIds = [
      ...new Set([
        ...(overdueLeads ?? []).map((l: { id: string }) => l.id),
        ...(overdueTasks ?? []).filter((t: { lead_id: string | null }) => t.lead_id).map((t: { lead_id: string }) => t.lead_id),
        ...(defaultedEvents ?? []).filter((e: { lead_id: string | null }) => e.lead_id).map((e: { lead_id: string }) => e.lead_id),
        ...unreviewedFlagged.filter((e: { lead_id: string | null }) => e.lead_id).map((e: { lead_id: string }) => e.lead_id),
      ]),
    ].slice(0, 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let labelMap: Record<string, string> = {};

    if (allLeadIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leads } = await (sb.from("leads") as any)
        .select("id, property_id")
        .in("id", allLeadIds);

      const propIds = [
        ...new Set(
          (leads ?? [])
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
        (leads ?? []).forEach((l: any) => {
          const prop = propMap[l.property_id] ?? {};
          labelMap[l.id] = prop.address ?? prop.owner_name ?? l.id.slice(0, 8);
        });
      }
    }

    function labelFor(leadId: string | null): string {
      if (!leadId) return "Unknown lead";
      return labelMap[leadId] ?? leadId.slice(0, 8);
    }

    // ── Deduplicate by leadId — one item per lead, most urgent signal wins ────
    // Priority: flagged_ai_output > overdue_task > overdue_follow_up_lead > defaulted_callback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seenLeadIds = new Set<string>();
    const items: OpportunityItem[] = [];

    // Flagged AI outputs first (highest review urgency)
    for (const e of unreviewedFlagged) {
      if (!e.lead_id || seenLeadIds.has(e.lead_id)) continue;
      seenLeadIds.add(e.lead_id);
      items.push({
        leadId: e.lead_id,
        signal: "flagged_ai_output",
        label: labelFor(e.lead_id),
        missedAt: e.created_at,
        daysOverdue: daysOverdue(e.created_at),
        eventId: e.id,
      });
    }

    // Overdue tasks
    for (const t of (overdueTasks ?? [])) {
      if (!t.lead_id || seenLeadIds.has(t.lead_id)) continue;
      seenLeadIds.add(t.lead_id);
      items.push({
        leadId: t.lead_id,
        signal: "overdue_task",
        label: labelFor(t.lead_id),
        missedAt: t.due_at,
        daysOverdue: daysOverdue(t.due_at),
        taskTitle: t.title ?? null,
      });
    }

    // Overdue follow-up leads
    for (const l of (overdueLeads ?? [])) {
      if (seenLeadIds.has(l.id)) continue;
      seenLeadIds.add(l.id);
      const missedAt = l.next_follow_up_at ?? l.next_call_scheduled_at ?? null;
      items.push({
        leadId: l.id,
        signal: "overdue_follow_up_lead",
        label: labelFor(l.id),
        missedAt,
        daysOverdue: daysOverdue(missedAt),
      });
    }

    // Defaulted callbacks (lowest priority — informational)
    for (const e of (defaultedEvents ?? [])) {
      if (!e.lead_id || seenLeadIds.has(e.lead_id)) continue;
      seenLeadIds.add(e.lead_id);
      items.push({
        leadId: e.lead_id,
        signal: "defaulted_callback",
        label: labelFor(e.lead_id),
        missedAt: e.created_at,
        daysOverdue: daysOverdue(e.created_at),
        eventId: e.id,
      });
    }

    const counts = {
      overdue_follow_up_lead: items.filter((i) => i.signal === "overdue_follow_up_lead").length,
      overdue_task: items.filter((i) => i.signal === "overdue_task").length,
      defaulted_callback: items.filter((i) => i.signal === "defaulted_callback").length,
      flagged_ai_output: items.filter((i) => i.signal === "flagged_ai_output").length,
    };

    return NextResponse.json({ items, counts } satisfies OpportunityQueueResponse);
  } catch (err) {
    console.error("[API/leads/opportunity-queue] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
