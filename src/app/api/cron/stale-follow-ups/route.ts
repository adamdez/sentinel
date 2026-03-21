import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isAgentEnabled } from "@/lib/control-plane";
import { withCronTracking } from "@/lib/cron-run-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/stale-follow-ups
 *
 * Runs daily at 10am PT. Finds active leads with no contact in >5 days
 * (WA leads) or >7 days (other states), and triggers the Follow-Up Agent
 * to generate personalized re-engagement drafts.
 *
 * Blueprint: "Follow-Up Agent triggered by stale lead detection."
 * Washington outbound follow-up is call-only unless explicitly changed.
 *
 * Secured by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if follow-up agent is enabled
  const enabled = await isAgentEnabled("follow-up");
  if (!enabled) {
    return NextResponse.json({ ok: true, message: "Follow-Up Agent disabled", triggered: 0 });
  }

  return withCronTracking("stale-follow-ups", async (run) => {
    const sb = createServerClient();
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Find active leads with stale contact
    const ACTIVE_STATUSES = ["prospect", "lead", "negotiation"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staleLeads } = await (sb.from("leads") as any)
      .select("id, status, last_contact_at, next_action, properties(state)")
      .in("status", ACTIVE_STATUSES)
      .or(`last_contact_at.lt.${sevenDaysAgo},last_contact_at.is.null`)
      .order("last_contact_at", { ascending: true, nullsFirst: true })
      .limit(20);

    if (!staleLeads || staleLeads.length === 0) {
      return NextResponse.json({ ok: true, staleLeads: 0, triggered: 0 });
    }

    // Filter by state-specific thresholds
    // WA leads: 5 days (more aggressive follow-up for primary market)
    // Other states: 7 days
    const qualified = staleLeads.filter((lead: Record<string, unknown>) => {
      const prop = lead.properties as Record<string, unknown> | null;
      const state = prop?.state as string ?? "";
      const lastContact = lead.last_contact_at as string | null;

      if (!lastContact) return true; // Never contacted = definitely stale

      const isWA = state.toUpperCase() === "WA";
      const threshold = isWA ? fiveDaysAgo : sevenDaysAgo;
      return lastContact < threshold;
    });

    // Trigger Follow-Up Agent for each stale lead
    let triggered = 0;
    const { runFollowUpAgent } = await import("@/agents/follow-up");

    for (const lead of qualified.slice(0, 10)) {
      try {
        const prop = lead.properties as Record<string, unknown> | null;
        const isWA = (prop?.state as string ?? "").toUpperCase() === "WA";

        await runFollowUpAgent({
          leadId: lead.id as string,
          triggerType: "stale_lead",
          triggerRef: `cron-stale-${now.toISOString().slice(0, 10)}`,
          // WA outbound is call-only per blueprint rules
          channel: isWA ? "call" : undefined,
        });
        triggered++;
        run.increment();
      } catch (err) {
        console.error(`[stale-follow-ups] Failed for lead ${lead.id}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      staleLeads: qualified.length,
      triggered,
      skipped: qualified.length - triggered,
    });
  });
}
