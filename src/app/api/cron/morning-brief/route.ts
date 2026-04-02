import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runExceptionScan } from "@/agents/exception";
import { notifyMorningDigest, notifyStaleFollowUp } from "@/lib/notify";
import { getFeatureFlag } from "@/lib/control-plane";
import { inngest } from "../../../../inngest/client";
import { withCronTracking } from "@/lib/cron-run-tracker";
import { parseFounderUserIds } from "@/lib/analytics-helpers";
import { computeFounderHoursFromWorkLogs, findFounderWorkLogGaps } from "@/lib/founder-worklog";

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

  return withCronTracking("morning-brief", async (run) => {
    const sb = createServerClient();
    const now = new Date();
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
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

    // ── Notify via Slack (fire-and-forget) ─────────────────────────────
    const founderIds = parseFounderUserIds(process.env.FOUNDER_USER_IDS);
    let founderWorkLogReminder: {
      windowLabel: string;
      missingFounders: Array<{ name: string; callCount: number; founderHours: number }>;
    } | null = null;

    if (founderIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: founderCallsRaw } = await (sb.from("calls_log") as any)
        .select("user_id")
        .in("user_id", founderIds)
        .gte("started_at", yesterdayStart)
        .lt("started_at", todayStart);

      const callCountByFounder = new Map<string, number>();
      for (const founderId of founderIds) callCountByFounder.set(founderId, 0);
      for (const row of (founderCallsRaw ?? []) as Array<{ user_id?: string | null }>) {
        const founderId = (row.user_id ?? "").trim();
        if (!founderId) continue;
        callCountByFounder.set(founderId, (callCountByFounder.get(founderId) ?? 0) + 1);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: founderWorkLogsRaw } = await (sb.from("founder_work_logs") as any)
        .select("user_id, started_at, ended_at")
        .in("user_id", founderIds)
        .lt("started_at", todayStart)
        .or(`ended_at.is.null,ended_at.gte.${yesterdayStart}`);

      const coverageRows = founderIds.map((founderId) => ({
        userId: founderId,
        callCount: callCountByFounder.get(founderId) ?? 0,
        founderHours: computeFounderHoursFromWorkLogs(
          (founderWorkLogsRaw ?? []) as Array<{ user_id?: string | null; started_at?: string | null; ended_at?: string | null }>,
          yesterdayStart,
          todayStart,
          [founderId],
        ).founderHours,
      }));

      const gaps = findFounderWorkLogGaps(coverageRows, {
        minCallsForReminder: 3,
        minHoursForReminder: 0.5,
      });

      if (gaps.length > 0) {
        const missingFounderIds = gaps.map((gap) => gap.userId);
        const profileNameById = new Map<string, string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profilesRaw } = await (sb.from("user_profiles") as any)
          .select("id, full_name, email")
          .in("id", missingFounderIds);
        for (const row of (profilesRaw ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null }>) {
          const name = row.full_name?.trim() || row.email?.trim() || row.id.slice(0, 8);
          profileNameById.set(row.id, name);
        }

        founderWorkLogReminder = {
          windowLabel: new Date(yesterdayStart).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }),
          missingFounders: gaps.map((gap) => ({
            name: profileNameById.get(gap.userId) ?? gap.userId.slice(0, 8),
            callCount: gap.callCount,
            founderHours: gap.founderHours,
          })),
        };
      }
    }

    const briefPayload = {
      ...brief,
      founder_worklog_reminder: founderWorkLogReminder,
    };

    notifyMorningDigest({
      date: brief.date,
      exceptionSummary: brief.exception_summary,
      exceptionTotals: brief.exception_totals,
      criticalItems: brief.critical_exceptions.map((e) => ({
        leadId: e.leadId,
        ownerName: e.ownerName ?? null,
        address: e.address ?? null,
        description: e.description ?? "",
      })),
      todayCallbackCount: brief.today_callbacks.length,
      topCallbacks: brief.today_callbacks.slice(0, 5).map((t: Record<string, unknown>) => {
        const lead = t.lead as Record<string, unknown> | null;
        const props = lead?.properties as Record<string, unknown> | null;
        return {
          title: (t.title as string) ?? "",
          dueAt: (t.due_at as string) ?? "",
          ownerName: (props?.owner_name as string) ?? null,
          address: props ? [props.address, props.city, props.state].filter(Boolean).join(", ") : null,
        };
      }),
      pipelineSnapshot: brief.pipeline_snapshot,
      activeOfferCount: brief.active_offers.length,
      founderWorkLogReminder,
    }).catch(() => {});

    // ── Dispatch stale follow-up nudge if overdue items exist ─────────
    const overdueItems = [
      ...exceptions.critical.filter((e) => e.category === "overdue_follow_up"),
      ...exceptions.high.filter((e) => e.category === "overdue_follow_up"),
    ];
    if (overdueItems.length > 0) {
      notifyStaleFollowUp({
        overdueLeads: overdueItems.slice(0, 10).map((e) => ({
          leadId: e.leadId,
          ownerName: e.ownerName,
          address: e.address,
          nextAction: e.currentNextAction,
          hoursOverdue: e.daysSinceLastContact ? e.daysSinceLastContact * 24 : 0,
          severity: e.severity,
        })),
        totalOverdue: overdueItems.length,
      }).catch(() => {});
    }

    // ── Auto-trigger Follow-Up Agent for top 3 overdue leads (fire-and-forget) ──
    const followUpFlag = await getFeatureFlag("agent.follow_up.enabled");
    if (followUpFlag?.enabled) {
      const overdueForAgent = overdueItems.slice(0, 3);
      for (const item of overdueForAgent) {
        if (item.leadId) {
          // Durable follow-up agent trigger — retried automatically by Inngest
          void inngest.send({
            name: "agent/follow-up.requested",
            data: {
              leadId: item.leadId,
              triggerType: "cron",
              triggerRef: "morning-brief",
              channel: "sms",
              operatorNotes: "Triggered by morning brief — stale lead needs follow-up",
            },
          }).catch((err) => {
            console.error(`[morning-brief] Inngest follow-up trigger failed for lead ${item.leadId}:`, err);
          });
        }
      }
    } else {
      console.debug("[morning-brief] Follow-up agent triggers skipped — feature flag agent.follow_up.enabled not enabled");
    }

    run.increment();
    return NextResponse.json({ ok: true, brief: briefPayload });
  });
}
