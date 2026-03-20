import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runExceptionScan } from "@/agents/exception";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/morning-brief
 *
 * Morning priority brief for Logan and Adam. Runs at 7am Mon-Sat.
 * Combines: exception scan + today's callbacks + pipeline snapshot.
 *
 * Blueprint Section 14: "Every morning, Logan opens Sentinel and sees:
 * top 10 priority leads, overdue follow-ups, yesterday's missed opportunities,
 * today's callbacks."
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = createServerClient();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    // Run exception scan
    const exceptions = await runExceptionScan({
      triggerType: "cron",
      triggerRef: "morning-brief",
    });

    // Today's callbacks (tasks due today)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: todayCallbacks } = await (sb.from("tasks") as any)
      .select("id, title, due_at, priority, lead_id, leads(status, properties(address, city, state, owner_name))")
      .eq("status", "pending")
      .gte("due_at", todayStart)
      .lt("due_at", todayEnd)
      .order("due_at", { ascending: true })
      .limit(20);

    // Pipeline snapshot
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pipeline } = await (sb.from("leads") as any)
      .select("status")
      .in("status", ["prospect", "lead", "qualified", "negotiation", "disposition", "nurture"]);

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

    const brief = {
      date: now.toISOString().slice(0, 10),
      generated_at: now.toISOString(),
      exception_summary: exceptions.summary,
      exception_totals: exceptions.totals,
      critical_exceptions: exceptions.critical.slice(0, 5),
      high_exceptions: exceptions.high.slice(0, 5),
      today_callbacks: (todayCallbacks ?? []).map((t: Record<string, unknown>) => ({
        id: t.id,
        title: t.title,
        due_at: t.due_at,
        priority: t.priority,
        lead_id: t.lead_id,
        lead: t.leads,
      })),
      pipeline_snapshot: pipelineCounts,
      active_offers: activeOffers ?? [],
    };

    return NextResponse.json({ ok: true, brief });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/morning-brief] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
