import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/stale-leads
 *
 * Stale lead detection cron — runs nightly (configured in vercel.json crons).
 *
 * Flags three categories:
 *   1. Active leads with no next_action set
 *   2. Active leads with overdue next_action_due_at
 *   3. Active leads with no contact in >7 days (stale contact)
 *
 * Does NOT write to leads table. Returns a structured report that feeds:
 *   - The morning brief queue (/api/leads/daily-brief)
 *   - The missed opportunity queue widget
 *   - The nightly DB audit log
 *
 * Security: requires CRON_SECRET header matching env var.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const ACTIVE_STATUSES = ["lead", "qualified", "negotiation", "prospect", "nurture"];

  // ── 1. Active leads with no next_action ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: missingAction, error: e1 } = await (sb.from("leads") as any)
    .select("id, status, assigned_to, last_contact_at, created_at")
    .in("status", ACTIVE_STATUSES)
    .is("next_action", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (e1) {
    console.error("[stale-leads] Error fetching missing-action leads:", e1.message);
  }

  // ── 2. Leads with overdue next_action_due_at ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overdueAction, error: e2 } = await (sb.from("leads") as any)
    .select("id, status, assigned_to, next_action, next_action_due_at")
    .in("status", ACTIVE_STATUSES)
    .not("next_action_due_at", "is", null)
    .lt("next_action_due_at", now.toISOString())
    .order("next_action_due_at", { ascending: true })
    .limit(100);

  if (e2) {
    console.error("[stale-leads] Error fetching overdue-action leads:", e2.message);
  }

  // ── 3. Leads with no contact in >7 days ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: staleContact, error: e3 } = await (sb.from("leads") as any)
    .select("id, status, assigned_to, last_contact_at, next_action")
    .in("status", ["lead", "qualified", "negotiation"])
    .not("last_contact_at", "is", null)
    .lt("last_contact_at", sevenDaysAgo)
    .order("last_contact_at", { ascending: true })
    .limit(100);

  if (e3) {
    console.error("[stale-leads] Error fetching stale-contact leads:", e3.message);
  }

  // ── 4. Speed-to-lead violations — leads >24h with no contact ──
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: speedViolations, error: e4 } = await (sb.from("leads") as any)
    .select("id, status, assigned_to, created_at, promoted_at")
    .in("status", ["lead", "negotiation"])
    .is("last_contact_at", null)
    .lt("created_at", twentyFourHoursAgo)
    .order("created_at", { ascending: true })
    .limit(50);

  if (e4) {
    console.error("[stale-leads] Error fetching speed violations:", e4.message);
  }

  const report = {
    generated_at: now.toISOString(),
    summary: {
      missing_next_action: missingAction?.length ?? 0,
      overdue_next_action: overdueAction?.length ?? 0,
      stale_contact: staleContact?.length ?? 0,
      speed_to_lead_violations: speedViolations?.length ?? 0,
      total_flags: (missingAction?.length ?? 0) + (overdueAction?.length ?? 0) +
        (staleContact?.length ?? 0) + (speedViolations?.length ?? 0),
    },
    missing_next_action: missingAction ?? [],
    overdue_next_action: overdueAction ?? [],
    stale_contact: staleContact ?? [],
    speed_to_lead_violations: speedViolations ?? [],
  };

  // Log summary for Vercel function logs
  console.log(`[stale-leads] Report: ${JSON.stringify(report.summary)}`);

  return NextResponse.json(report);
}
