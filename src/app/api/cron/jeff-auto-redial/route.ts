/**
 * GET /api/cron/jeff-auto-redial
 * Schedule: Every 2 minutes during business hours Mon-Sat (9am-6pm PT)
 * Cron: every 2min 17:00-02:00 UTC Mon-Sat (9am-6pm PT)
 *
 * Automatically fires Jeff (Vapi outbound) on auto-cycle phones that are due.
 * The retry cadence is managed by nextAttemptPlan():
 *   attempt 1 → call
 *   attempt 2 → 5 min later (voicemail drop)
 *   attempt 3 → 24 hrs later
 *   attempt 4 → 5 min later (voicemail drop)
 *   attempt 5 → 24 hrs later → completed
 *
 * This cron picks up phones where next_due_at <= NOW() and fires Jeff.
 * The webhook end-of-call handler calls processAutoCycleOutcome() which
 * schedules the next attempt — closing the loop automatically.
 *
 * Hard limits: max 10 calls per cron run (Vapi rate protection)
 */

export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getFeatureFlag } from "@/lib/control-plane";
import { withCronTracking } from "@/lib/cron-run-tracker";
import { initiateOutboundCall } from "@/providers/voice/vapi-adapter";
import { isDnc } from "@/lib/dnc-check";

const MAX_CALLS_PER_RUN = 10;
const DELAY_BETWEEN_CALLS_MS = 3_000;

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://localhost:3000")
  );
}

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Feature flag gate ────────────────────────────────────────────────
  const flag = await getFeatureFlag("cron.jeff_auto_redial.enabled");
  if (!flag?.enabled) {
    return NextResponse.json({ skipped: true, reason: "Feature flag disabled" });
  }

  return withCronTracking("jeff-auto-redial", async (run) => {
    const sb = createServerClient();
    const now = new Date().toISOString();

    // ── Find due phones ──────────────────────────────────────────────
    // Active auto-cycle phones where next_due_at has passed.
    // Each phone on a lead has its own independent cadence — Jeff calls
    // every number, not just one. The in-flight check below prevents
    // calling two numbers for the same person simultaneously.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: duePhones, error: queryErr } = await (sb.from("dialer_auto_cycle_phones") as any)
      .select(`
        id,
        cycle_lead_id,
        lead_id,
        phone,
        phone_position,
        attempt_count,
        voicemail_drop_next,
        dialer_auto_cycle_leads!inner (
          id,
          lead_id,
          cycle_status,
          user_id
        )
      `)
      .eq("phone_status", "active")
      .lte("next_due_at", now)
      .in("dialer_auto_cycle_leads.cycle_status", ["ready", "waiting"])
      .order("next_due_at", { ascending: true })
      .limit(MAX_CALLS_PER_RUN);

    if (queryErr) {
      console.error("[jeff-auto-redial] Query failed:", queryErr.message);
      run.fail(queryErr.message);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!duePhones || duePhones.length === 0) {
      return NextResponse.json({ message: "No due phones", called: 0, skipped: 0 });
    }

    console.log(`[jeff-auto-redial] Found ${duePhones.length} due phone(s)`);

    // ── Check for in-flight calls ────────────────────────────────────
    // Don't fire Jeff on a lead that already has an active call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: activeSessions } = await (sb.from("voice_sessions") as any)
      .select("lead_id")
      .in("status", ["ringing", "ai_handling", "transferred"])
      .in(
        "lead_id",
        duePhones.map((p: { lead_id: string }) => p.lead_id),
      );

    const inFlightLeadIds = new Set(
      (activeSessions ?? []).map((s: { lead_id: string }) => s.lead_id),
    );

    // ── Fire Jeff on each due phone ──────────────────────────────────
    const siteUrl = getSiteUrl();
    const serverUrl = `${siteUrl}/api/voice/vapi/webhook`;

    const results: Array<{
      leadId: string;
      phone: string;
      status: string;
      vapiCallId?: string;
      voiceSessionId?: string;
      error?: string;
    }> = [];
    const skipped: Array<{ leadId: string; phone: string; reason: string }> = [];

    for (let i = 0; i < duePhones.length; i++) {
      const dp = duePhones[i];
      const leadId = dp.lead_id as string;
      const phone = dp.phone as string;
      const cycleLeadRow = dp.dialer_auto_cycle_leads as {
        id: string;
        lead_id: string;
        cycle_status: string;
        user_id: string;
      };

      // Skip if lead already has an in-flight call
      if (inFlightLeadIds.has(leadId)) {
        skipped.push({ leadId, phone, reason: "in-flight call" });
        continue;
      }

      // DNC check
      try {
        const dncResult = await isDnc(phone);
        if (dncResult.isDnc) {
          skipped.push({ leadId, phone, reason: `DNC: ${dncResult.reason}` });
          continue;
        }
      } catch {
        // DNC check failed — proceed with caution
      }

      // Create voice_session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: session, error: sessErr } = await (sb.from("voice_sessions") as any)
        .insert({
          direction: "outbound",
          lead_id: leadId,
          to_number: phone,
          status: "ringing",
          caller_type: "seller",
          metadata: {
            source: "jeff-auto-redial",
            auto_cycle_lead_id: cycleLeadRow.id,
            attempt_number: (dp.attempt_count ?? 0) + 1,
            voicemail_drop: dp.voicemail_drop_next ?? false,
          },
          auto_cycle_lead_id: cycleLeadRow.id,
          auto_cycle_phone_id: dp.id,
        })
        .select("id")
        .single();

      if (sessErr || !session) {
        console.error("[jeff-auto-redial] Session creation failed:", sessErr?.message, { leadId });
        skipped.push({ leadId, phone, reason: `Session: ${sessErr?.message}` });
        continue;
      }

      // Fire Jeff via Vapi
      try {
        const { vapiCallId } = await initiateOutboundCall(phone, serverUrl);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("voice_sessions") as any)
          .update({ vapi_call_id: vapiCallId, status: "ai_handling" })
          .eq("id", session.id);

        // Mark lead as in-flight so we don't double-dial
        inFlightLeadIds.add(leadId);

        console.log("[jeff-auto-redial] Call placed:", {
          leadId: leadId.slice(0, 8),
          phone: `***${phone.slice(-4)}`,
          vapiCallId: vapiCallId.slice(0, 8),
          attempt: (dp.attempt_count ?? 0) + 1,
        });

        results.push({
          leadId,
          phone: `***${phone.slice(-4)}`,
          status: "initiated",
          vapiCallId,
          voiceSessionId: session.id,
        });
        run.increment();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[jeff-auto-redial] Vapi call FAILED:", msg, { leadId });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("voice_sessions") as any)
          .update({ status: "failed" })
          .eq("id", session.id);

        skipped.push({ leadId, phone: `***${phone.slice(-4)}`, reason: `Vapi: ${msg}` });
      }

      // 3s delay between calls
      if (i < duePhones.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));
      }
    }

    const summary = {
      dueFound: duePhones.length,
      called: results.length,
      skipped: skipped.length,
      results,
      skipped_details: skipped,
    };

    console.log("[jeff-auto-redial] Run complete:", {
      due: duePhones.length,
      called: results.length,
      skipped: skipped.length,
    });

    return NextResponse.json(summary);
  });
}
