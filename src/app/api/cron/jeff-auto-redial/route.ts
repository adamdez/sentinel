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
import { initiateOutboundCall, isBusinessHours } from "@/providers/voice/vapi-adapter";
import { scrubLead } from "@/lib/compliance";
import { nextAttemptPlan } from "@/lib/dialer/auto-cycle";

const MAX_CALLS_PER_RUN = 10;
const DELAY_BETWEEN_CALLS_MS = 3_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

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

  // ── Business hours gate (belt + suspenders — schedule alone isn't enough) ──
  const hours = isBusinessHours();
  if (!hours.isOpen) {
    return NextResponse.json({ skipped: true, reason: `Outside business hours. Next: ${hours.nextOpenTime}` });
  }

  // ── Feature flag gate ────────────────────────────────────────────────
  const flag = await getFeatureFlag("cron.jeff_auto_redial.enabled");
  if (!flag?.enabled) {
    return NextResponse.json({ skipped: true, reason: "Feature flag disabled" });
  }

  return withCronTracking("jeff-auto-redial", async (run) => {
    const sb = createServerClient();
    const now = new Date().toISOString();

    // B5: Daily call cap — prevent runaway spend
    const maxDailyCalls = parseInt(process.env.MAX_DAILY_AUTO_CALLS ?? "200", 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: todayCallCount } = await (sb.from("voice_sessions") as any)
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .gte("created_at", new Date(new Date().toISOString().slice(0, 10)).toISOString());

    if ((todayCallCount ?? 0) >= maxDailyCalls) {
      console.warn(`[jeff-auto-redial] Daily cap reached: ${todayCallCount}/${maxDailyCalls}`);
      return NextResponse.json({ skipped: true, reason: `Daily cap reached (${todayCallCount}/${maxDailyCalls})` });
    }

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
        consecutive_failures,
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

    // ── Exclude Logan's active dialer leads ──────────────────────────
    // If Logan has leads loaded in his dialer session, Jeff must not
    // call them simultaneously — that's confusing for the seller and
    // wastes a Vapi minute on someone Logan is about to dial manually.
    const dueLeadIds = [...new Set(duePhones.map((p: { lead_id: string }) => p.lead_id))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: loganSessionLeads } = await (sb.from("dialer_sessions") as any)
      .select("current_lead_id")
      .eq("status", "active");

    const loganActiveLeadIds = new Set(
      (loganSessionLeads ?? [])
        .map((s: { current_lead_id: string | null }) => s.current_lead_id)
        .filter(Boolean),
    );

    // Also check tasks assigned to Logan that are due today (active follow-ups)
    // Use Pacific time for "today" since that's our operating timezone
    const pacificNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const todayStart = new Date(pacificNow);
    todayStart.setHours(0, 0, 0, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: loganTasks } = await (sb.from("tasks") as any)
      .select("lead_id")
      .eq("status", "pending")
      .in("task_type", ["follow_up", "callback"])
      .gte("due_at", todayStart.toISOString())
      .lte("due_at", new Date(todayStart.getTime() + 24 * 60 * 60_000).toISOString())
      .in("lead_id", dueLeadIds);

    for (const t of (loganTasks ?? [])) {
      loganActiveLeadIds.add(t.lead_id);
    }

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
    const claimedLeadIds = new Set<string>();

    for (let i = 0; i < duePhones.length; i++) {
      const dp = duePhones[i];
      const leadId = dp.lead_id as string;
      const phone = dp.phone as string;

      // B3: Per-lead exclusion — don't call two numbers for the same seller simultaneously
      if (claimedLeadIds.has(leadId)) {
        skipped.push({ leadId, phone, reason: "already_claimed_another_phone_for_lead" });
        continue;
      }

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

      // Skip if Logan is actively working this lead
      if (loganActiveLeadIds.has(leadId)) {
        skipped.push({ leadId, phone, reason: "Logan active on lead" });
        continue;
      }

      // B4: Full compliance scrub (DNC + litigants + opt-outs)
      try {
        const scrub = await scrubLead(phone, SYSTEM_USER_ID, false);
        if (!scrub.allowed) {
          skipped.push({ leadId, phone, reason: `Compliance: ${scrub.blockedReasons.join(", ")}` });
          continue;
        }
      } catch {
        // Compliance check failed — proceed with caution
      }

      // B3: Atomic claim — prevent concurrent cron runs from double-dialing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: claimed, error: claimErr } = await (sb.from("dialer_auto_cycle_phones") as any)
        .update({ next_due_at: null, last_attempt_at: new Date().toISOString() })
        .eq("id", dp.id)
        .eq("phone_status", "active")
        .lte("next_due_at", now)
        .select("id")
        .maybeSingle();

      if (claimErr || !claimed) {
        skipped.push({ leadId, phone, reason: "claim_lost (concurrent cron)" });
        continue;
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

        // Reset consecutive failure counter on successful API call
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("dialer_auto_cycle_phones") as any)
          .update({ consecutive_failures: 0 })
          .eq("id", dp.id);

        // Mark lead as in-flight so we don't double-dial
        inFlightLeadIds.add(leadId);
        claimedLeadIds.add(leadId);

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

        // ── CRITICAL: Advance the auto-cycle even on Vapi failure ────
        // Without this, the phone stays active with a past next_due_at,
        // causing infinite retry every 2 minutes (the 2,420-call bug).
        const currentAttempt = (dp.attempt_count ?? 0);
        const consecutiveFailures = (dp.consecutive_failures ?? 0) + 1;

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Too many consecutive API failures — exit this phone
          // Uses "exited" (valid CHECK constraint value) with descriptive exit_reason
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dialer_auto_cycle_phones") as any)
            .update({
              phone_status: "exited",
              exit_reason: `vapi_failures_${consecutiveFailures}`,
              last_attempt_at: new Date().toISOString(),
              last_outcome: "api_error",
              next_due_at: null,
              consecutive_failures: consecutiveFailures,
            })
            .eq("id", dp.id);

          console.warn("[jeff-auto-redial] Phone EXITED after consecutive failures:", {
            leadId: leadId.slice(0, 8),
            phone: `***${phone.slice(-4)}`,
            consecutiveFailures,
          });
        } else {
          // Push next_due_at forward with exponential backoff (10min, 30min, 60min)
          const backoffMs = Math.min(10 * 60_000 * Math.pow(3, consecutiveFailures - 1), 60 * 60_000);
          const retryAt = new Date(Date.now() + backoffMs).toISOString();

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("dialer_auto_cycle_phones") as any)
            .update({
              next_due_at: retryAt,
              last_attempt_at: new Date().toISOString(),
              last_outcome: "api_error",
              consecutive_failures: consecutiveFailures,
            })
            .eq("id", dp.id);

          console.warn("[jeff-auto-redial] Vapi failed, backoff retry:", {
            leadId: leadId.slice(0, 8),
            phone: `***${phone.slice(-4)}`,
            consecutiveFailures,
            retryAt,
          });
        }

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
