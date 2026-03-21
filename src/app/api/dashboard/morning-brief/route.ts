import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runExceptionScan } from "@/agents/exception";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/dashboard/morning-brief
 *
 * Returns today's morning brief for the operator dashboard.
 * Combines: exception scan + today's callbacks + pipeline snapshot + top leads.
 *
 * Blueprint 3.1: "Every morning, Logan opens Sentinel and sees: top 10 priority
 * leads, overdue follow-ups, yesterday's missed opportunities, today's callbacks."
 *
 * Unlike the cron version, this does NOT dispatch to n8n — it only returns data
 * for the UI to render. Can be called on-demand.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    // Run exception scan (lightweight — all deterministic SQL queries)
    const exceptions = await runExceptionScan({
      triggerType: "manual" as const,
      triggerRef: "dashboard-brief",
    });

    // Today's callbacks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: todayCallbacks } = await (sb.from("tasks") as any)
      .select("id, title, due_at, priority, lead_id, leads(status, properties(address, city, state, owner_name))")
      .eq("status", "pending")
      .gte("due_at", todayStart)
      .lt("due_at", todayEnd)
      .order("due_at", { ascending: true })
      .limit(20);

    // Top 10 priority leads (active, with next_action, ordered by priority + motivation)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: topLeads } = await (sb.from("leads") as any)
      .select(`
        id, status, priority, motivation_level, next_action, next_action_due_at,
        last_contact_at, total_calls, live_answers, source,
        seller_situation_summary_short, recommended_call_angle, top_fact_1,
        opportunity_score, confidence_score,
        properties(address, city, state, zip, owner_name, county)
      `)
      .in("status", ["prospect", "lead", "negotiation"])
      .not("next_action", "is", null)
      .order("priority", { ascending: false })
      .order("motivation_level", { ascending: false })
      .limit(10);

    // Pipeline snapshot
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pipeline } = await (sb.from("leads") as any)
      .select("status")
      .in("status", ["prospect", "lead", "negotiation", "disposition", "nurture"]);

    const pipelineCounts: Record<string, number> = {};
    for (const row of pipeline ?? []) {
      pipelineCounts[row.status] = (pipelineCounts[row.status] ?? 0) + 1;
    }

    // Active offers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: activeOffers } = await (sb.from("offers") as any)
      .select("id, amount, status, leads(properties(address, city, state))")
      .in("status", ["draft", "sent", "countered"])
      .limit(10);

    // Pending review queue items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pendingReviews } = await (sb.from("review_queue") as any)
      .select("id, agent_name, action, entity_type, priority, created_at")
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(10);

    return NextResponse.json({
      ok: true,
      brief: {
        date: now.toISOString().slice(0, 10),
        generatedAt: now.toISOString(),
        exceptionSummary: exceptions.summary,
        exceptionTotals: exceptions.totals,
        criticalExceptions: exceptions.critical.slice(0, 10),
        highExceptions: exceptions.high.slice(0, 5),
        todayCallbacks: (todayCallbacks ?? []).map((t: Record<string, unknown>) => ({
          id: t.id,
          title: t.title,
          dueAt: t.due_at,
          priority: t.priority,
          leadId: t.lead_id,
          lead: t.leads,
        })),
        topLeads: topLeads ?? [],
        pipelineSnapshot: pipelineCounts,
        activeOffers: activeOffers ?? [],
        pendingReviewCount: pendingReviews?.length ?? 0,
        pendingReviews: pendingReviews ?? [],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dashboard/morning-brief] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
