import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/analytics/operator-performance?period=today|week|month|all
 *
 * Operator performance dashboard for Adam.
 * Shows per-operator metrics: calls, contacts, leads progressed,
 * deals closed, tasks completed, and activity timeline.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "week";

  // Calculate date range
  const now = new Date();
  let since: Date;
  switch (period) {
    case "today":
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      since = new Date(2024, 0, 1); // all time
  }

  const sinceStr = since.toISOString();

  // Get team members
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: teamMembers } = await (sb.from("user_profiles") as any)
    .select("id, full_name, email, role");

  if (!teamMembers || teamMembers.length === 0) {
    return NextResponse.json({ operators: [], period });
  }

  const operators = [];

  for (const member of teamMembers) {
    const userId = member.id;

    // Calls made (from calls_log)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: calls } = await (sb.from("calls_log") as any)
      .select("id, disposition, duration_sec, created_at")
      .eq("user_id", userId)
      .gte("created_at", sinceStr);

    const totalCalls = calls?.length ?? 0;
    const liveAnswers = calls?.filter((c: Record<string, unknown>) =>
      ["answered", "interested", "callback", "appointment", "not_interested", "contract", "contracted", "under_contract"].includes(c.disposition as string),
    ).length ?? 0;
    const totalDuration = calls?.reduce((sum: number, c: Record<string, unknown>) =>
      sum + ((c.duration_sec as number) ?? 0), 0) ?? 0;

    // Tasks completed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: completedTasks } = await (sb.from("tasks") as any)
      .select("id")
      .eq("assigned_to", userId)
      .eq("status", "completed")
      .gte("completed_at", sinceStr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: overdueTasks } = await (sb.from("tasks") as any)
      .select("id")
      .eq("assigned_to", userId)
      .eq("status", "pending")
      .lt("due_at", now.toISOString());

    // Stage transitions (from event_log)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stageEvents } = await (sb.from("event_log") as any)
      .select("id, details")
      .eq("user_id", userId)
      .eq("action", "lead.stage_transition")
      .gte("created_at", sinceStr);

    // Deals influenced
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dealEvents } = await (sb.from("event_log") as any)
      .select("id, action, details")
      .eq("user_id", userId)
      .like("action", "deal.%")
      .gte("created_at", sinceStr);

    // Offers made
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: offersMade } = await (sb.from("offers") as any)
      .select("id, amount, status")
      .eq("offered_by", userId)
      .gte("offered_at", sinceStr);

    const acceptedOffers = offersMade?.filter((o: Record<string, unknown>) => o.status === "accepted") ?? [];
    const totalOfferValue = offersMade?.reduce((sum: number, o: Record<string, unknown>) =>
      sum + ((o.amount as number) ?? 0), 0) ?? 0;

    // Contact rate
    const contactRate = totalCalls > 0 ? Math.round((liveAnswers / totalCalls) * 100) : 0;

    operators.push({
      id: userId,
      name: member.full_name ?? member.email,
      role: member.role,
      metrics: {
        calls: {
          total: totalCalls,
          liveAnswers,
          contactRate,
          totalMinutes: Math.round(totalDuration / 60),
        },
        tasks: {
          completed: completedTasks?.length ?? 0,
          overdue: overdueTasks?.length ?? 0,
        },
        pipeline: {
          stageTransitions: stageEvents?.length ?? 0,
          dealEvents: dealEvents?.length ?? 0,
        },
        offers: {
          made: offersMade?.length ?? 0,
          accepted: acceptedOffers.length,
          totalValue: totalOfferValue,
        },
      },
    });
  }

  // Sort by total calls descending
  operators.sort((a, b) => b.metrics.calls.total - a.metrics.calls.total);

  return NextResponse.json({ operators, period, since: sinceStr });
}
