import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isDnc } from "@/lib/dnc-check";
import { getFeatureFlag } from "@/lib/control-plane";
import { withCronTracking } from "@/lib/cron-run-tracker";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/campaign-dialer
 * Schedule: Every 15 minutes during business hours Mon-Sat (9am-5pm PT)
 * Cron: every 15min 17-1 UTC Mon-Sat (9am-5pm PT)
 *
 * Processes active campaigns:
 * 1. Finds campaigns with status="active"
 * 2. For each, finds leads where next_touch_at <= now and status="pending" or "in_progress"
 * 3. Initiates outbound calls via Twilio or creates call tasks
 * 4. Updates touch count, schedules next touch based on cadence
 * 5. Marks leads as "completed" when all touches exhausted
 *
 * Hard limits: max 20 leads per cron run (protect Twilio rate limits)
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Feature flag gate
  const campaignDialerFlag = await getFeatureFlag("agent.campaign_dialer.enabled");
  if (!campaignDialerFlag?.enabled) {
    return NextResponse.json({ skipped: true, reason: "Feature flag disabled" });
  }

  return withCronTracking("campaign-dialer", async (run) => {
    const sb = createServerClient();
    const now = new Date().toISOString();
    const results: CampaignResult[] = [];

    // Get active campaigns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campaigns } = await (sb.from("campaigns") as any)
      .select("id, name, campaign_type, audience_filter")
      .eq("status", "active");

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ message: "No active campaigns", results: [] });
    }

    let totalProcessed = 0;
    const MAX_PER_RUN = 20;

  for (const campaign of campaigns) {
    if (totalProcessed >= MAX_PER_RUN) break;

    const remaining = MAX_PER_RUN - totalProcessed;
    const cadence = campaign.audience_filter?.cadence ?? {
      touchCount: 3,
      intervalDays: 2,
      channels: ["call"],
    };

    // Find leads ready for their next touch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: readyLeads } = await (sb.from("campaign_leads") as any)
      .select("id, lead_id, current_touch, status, leads(id, first_name, last_name, phone, status, next_action)")
      .eq("campaign_id", campaign.id)
      .in("status", ["pending", "in_progress"])
      .or(`next_touch_at.is.null,next_touch_at.lte.${now}`)
      .limit(remaining);

    if (!readyLeads || readyLeads.length === 0) {
      results.push({ campaignId: campaign.id, name: campaign.name, processed: 0, skipped: 0, completed: 0 });
      continue;
    }

    let processed = 0;
    let skipped = 0;
    let completed = 0;

    for (const cl of readyLeads) {
      const lead = cl.leads;
      if (!lead || !lead.phone) {
        // Skip — no phone number
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("campaign_leads") as any)
          .update({ status: "skipped", skip_reason: "no_phone", updated_at: now })
          .eq("id", cl.id);
        skipped++;
        continue;
      }

      // DNC check
      const dncResult = await isDnc(lead.phone);
      if (dncResult.isDnc) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("campaign_leads") as any)
          .update({ status: "skipped", skip_reason: dncResult.reason ?? "dnc", updated_at: now })
          .eq("id", cl.id);
        skipped++;
        continue;
      }

      // Check if all touches exhausted
      const newTouch = (cl.current_touch ?? 0) + 1;
      if (newTouch > cadence.touchCount) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("campaign_leads") as any)
          .update({ status: "completed", skip_reason: "all_touches_exhausted", updated_at: now })
          .eq("id", cl.id);
        completed++;
        continue;
      }

      // Determine channel for this touch
      const channelIndex = (newTouch - 1) % cadence.channels.length;
      const channel = cadence.channels[channelIndex] ?? "call";

      // Create a priority task for the operator
      const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
      const touchLabel = `Touch ${newTouch}/${cadence.touchCount}`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("tasks") as any).insert({
        title: `${channel === "call" ? "📞" : "💬"} Campaign: ${campaign.name} — ${touchLabel} — ${leadName}`,
        description: `Campaign "${campaign.name}" (${campaign.campaign_type})\n${touchLabel} via ${channel}\nPhone: ${lead.phone}\nLead status: ${lead.status}\nNext action: ${lead.next_action ?? "none"}`,
        assigned_to: process.env.ESCALATION_TARGET_USER_ID ?? "00000000-0000-0000-0000-000000000000",
        lead_id: lead.id,
        priority: 8, // High priority for campaign touches
        status: "pending",
        due_at: now,
      });

      // If channel is SMS and we have Twilio, send directly
      if (channel === "sms") {
        try {
          const twilioSid = process.env.TWILIO_ACCOUNT_SID;
          const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
          const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
          if (twilioSid && twilioAuth && twilioFrom) {
            const smsBody = buildCampaignSMS(campaign, lead, newTouch);
            const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
            await fetch(url, {
              method: "POST",
              headers: {
                "Authorization": "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({ To: lead.phone, From: twilioFrom, Body: smsBody }),
            });
          }
        } catch (smsErr) {
          console.error(`[campaign-dialer] SMS send failed for lead=${lead.id}:`, smsErr instanceof Error ? smsErr.message : smsErr);
        }
      }

      // Calculate next touch time
      const nextTouchAt = new Date(Date.now() + cadence.intervalDays * 24 * 60 * 60 * 1000).toISOString();

      // Update campaign lead record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("campaign_leads") as any)
        .update({
          status: newTouch >= cadence.touchCount ? "completed" : "in_progress",
          current_touch: newTouch,
          last_touch_at: now,
          next_touch_at: newTouch >= cadence.touchCount ? null : nextTouchAt,
          updated_at: now,
        })
        .eq("id", cl.id);

      processed++;
      totalProcessed++;
      run.increment();
    }

    // Update campaign stats using a targeted count query instead of reading all statuses.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: sentCount } = await (sb.from("campaign_leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .neq("status", "pending");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("campaigns") as any)
      .update({ sent_count: sentCount ?? 0, updated_at: now })
      .eq("id", campaign.id);

    results.push({ campaignId: campaign.id, name: campaign.name, processed, skipped, completed });
  }

    return NextResponse.json({
      totalProcessed,
      campaigns: results,
      timestamp: now,
    });
  });
}

interface CampaignResult {
  campaignId: string;
  name: string;
  processed: number;
  skipped: number;
  completed: number;
}

function buildCampaignSMS(
  campaign: Record<string, unknown>,
  lead: Record<string, unknown>,
  touchNum: number,
): string {
  const name = lead.first_name ?? "";
  const type = campaign.campaign_type as string;

  if (type === "follow_up" && touchNum === 1) {
    return `Hi${name ? ` ${name}` : ""}, this is Logan with Dominion Home Deals. I tried reaching you about your property — when's a good time to chat? No pressure, just wanted to connect.`;
  }
  if (type === "follow_up" && touchNum >= 2) {
    return `Hey${name ? ` ${name}` : ""}, Logan here from Dominion. Just following up one more time — if you're still thinking about selling, I'm happy to walk through your options. Give me a call anytime.`;
  }
  if (type === "cold_call") {
    return `Hi${name ? ` ${name}` : ""}, this is Logan with Dominion Home Deals in Spokane. We buy homes in any condition — if you've ever thought about selling, I'd love to chat. No obligation.`;
  }
  if (type === "reactivation") {
    return `Hey${name ? ` ${name}` : ""}, it's Logan from Dominion. We spoke a while back about your property — just checking in to see if anything has changed. Happy to help whenever you're ready.`;
  }
  return `Hi${name ? ` ${name}` : ""}, this is Logan with Dominion Home Deals. I'd love to connect about your property when you have a moment. Call or text anytime.`;
}
