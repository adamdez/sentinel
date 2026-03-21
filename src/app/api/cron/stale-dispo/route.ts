import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getFeatureFlag } from "@/lib/control-plane";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/stale-dispo
 *
 * Runs daily at 11am PT. Finds deals in disposition for >48 hours
 * with no buyer outreach, and re-triggers the Dispo Agent.
 *
 * Blueprint: "Stale dispo detection — deal in dispo for >48h with no outreach."
 *
 * Secured by CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  try {
    // Find leads in disposition status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dispoLeads } = await (sb.from("leads") as any)
      .select("id")
      .eq("status", "disposition")
      .lt("updated_at", fortyEightHoursAgo);

    if (!dispoLeads || dispoLeads.length === 0) {
      return NextResponse.json({ ok: true, staleDeals: 0, triggered: 0 });
    }

    const leadIds = dispoLeads.map((l: { id: string }) => l.id);

    // Find their deals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals } = await (sb.from("deals") as any)
      .select("id, lead_id")
      .in("lead_id", leadIds)
      .in("status", ["under_contract", "active", "pending"]);

    if (!deals || deals.length === 0) {
      return NextResponse.json({ ok: true, staleDeals: 0, triggered: 0 });
    }

    // Filter to deals with no buyer outreach (no deal_buyers contacts)
    const dealIds = deals.map((d: { id: string }) => d.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contactedDeals } = await (sb.from("deal_buyers") as any)
      .select("deal_id")
      .in("deal_id", dealIds)
      .not("contacted_at", "is", null);

    const contactedSet = new Set(
      (contactedDeals ?? []).map((db: { deal_id: string }) => db.deal_id),
    );

    const staleDeals = deals.filter(
      (d: { id: string }) => !contactedSet.has(d.id),
    ) as Array<{ id: string; lead_id: string }>;

    // Trigger Dispo Agent for each stale deal (fire-and-forget)
    const dispoFlag = await getFeatureFlag("agent.dispo.enabled");
    if (!dispoFlag?.enabled) {
      return NextResponse.json({ ok: true, staleDeals: staleDeals.length, triggered: 0, skipped: staleDeals.length, reason: "Feature flag agent.dispo.enabled not enabled" });
    }

    let triggered = 0;
    for (const deal of staleDeals.slice(0, 10)) {
      try {
        const { runDispoAgent } = await import("@/agents/dispo");
        await runDispoAgent({
          dealId: deal.id,
          leadId: deal.lead_id,
          triggerType: "stale_dispo",
          triggerRef: `cron-stale-dispo-${now.toISOString().slice(0, 10)}`,
        });
        triggered++;
      } catch (err) {
        console.error(`[stale-dispo] Failed for deal ${deal.id}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      staleDeals: staleDeals.length,
      triggered,
      skipped: staleDeals.length - triggered,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/stale-dispo] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
