/**
 * Inngest function: Process outbound call batch.
 *
 * Receives a list of leads, calls each one sequentially via Vapi
 * with a 3-second delay between calls to respect rate limits.
 *
 * Each call creates a voice_session with direction=outbound and
 * auto-cycle context (if the lead is enrolled). The webhook handler
 * takes over from there for status updates, function calls,
 * end-of-call processing, and auto-cycle outcome routing.
 */

import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import { initiateOutboundCall } from "@/providers/voice/vapi-adapter";
import { normalizePhoneForCompare } from "@/lib/dialer/auto-cycle";

interface BatchLead {
  id: string;
  phone: string;
  name: string;
}

function createSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const outboundBatchJob = inngest.createFunction(
  {
    id: "outbound-batch",
    retries: 1,
    concurrency: { limit: 1 }, // Only one batch at a time
    triggers: [{ event: "voice/outbound-batch.requested" }],
  },
  async ({ event, step }) => {
    const { batchId, leads, initiatedBy, siteUrl } = event.data as {
      batchId: string;
      leads: BatchLead[];
      initiatedBy: string;
      siteUrl: string;
    };

    const serverUrl = `${siteUrl}/api/voice/vapi/webhook`;
    const results: Array<{ leadId: string; status: string; voiceSessionId?: string; vapiCallId?: string; error?: string }> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];

      const result = await step.run(`call-${lead.id}`, async () => {
        const sb = createSupabase();

        // ── Look up auto-cycle context ──────────────────────────────
        let autoCycleLeadId: string | null = null;
        let autoCyclePhoneId: string | null = null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: cycleRow } = await (sb.from("dialer_auto_cycle_leads") as any)
          .select("id, cycle_status")
          .eq("lead_id", lead.id)
          .in("cycle_status", ["ready", "waiting", "paused"])
          .maybeSingle();

        if (cycleRow) {
          autoCycleLeadId = cycleRow.id;

          const normalizedPhone = normalizePhoneForCompare(lead.phone);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: cyclePhones } = await (sb.from("dialer_auto_cycle_phones") as any)
            .select("id, phone, phone_status")
            .eq("cycle_lead_id", cycleRow.id)
            .eq("phone_status", "active");

          if (cyclePhones) {
            const match = cyclePhones.find(
              (p: { phone: string }) => normalizePhoneForCompare(p.phone) === normalizedPhone,
            );
            if (match) autoCyclePhoneId = match.id;
          }
        }

        // ── Create voice_session ────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: session, error: sessErr } = await (sb.from("voice_sessions") as any)
          .insert({
            direction: "outbound",
            lead_id: lead.id,
            to_number: lead.phone,
            status: "ringing",
            caller_type: "seller",
            metadata: { batch_id: batchId, initiated_by: initiatedBy },
            auto_cycle_lead_id: autoCycleLeadId,
            auto_cycle_phone_id: autoCyclePhoneId,
          })
          .select("id")
          .single();

        if (sessErr || !session) {
          console.error("[outbound-batch] Session creation failed:", sessErr?.message, { leadId: lead.id, phone: `***${lead.phone.slice(-4)}` });
          return { leadId: lead.id, status: "failed", error: `Session creation failed: ${sessErr?.message}` };
        }

        console.log("[outbound-batch] Voice session created:", { sessionId: session.id, leadId: lead.id, phone: `***${lead.phone.slice(-4)}`, serverUrl });

        try {
          const { vapiCallId } = await initiateOutboundCall(lead.phone, serverUrl);

          // Update session with Vapi call ID
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("voice_sessions") as any)
            .update({ vapi_call_id: vapiCallId, status: "ai_handling" })
            .eq("id", session.id);

          console.log("[outbound-batch] Vapi call initiated:", { vapiCallId, sessionId: session.id });
          return { leadId: lead.id, status: "initiated", voiceSessionId: session.id, vapiCallId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[outbound-batch] Vapi call FAILED:", msg, { leadId: lead.id, phone: `***${lead.phone.slice(-4)}` });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("voice_sessions") as any)
            .update({ status: "failed" })
            .eq("id", session.id);

          return { leadId: lead.id, status: "failed", voiceSessionId: session.id, error: msg };
        }
      });

      results.push(result);

      // 3-second delay between calls (rate limit protection)
      if (i < leads.length - 1) {
        await step.sleep(`delay-after-${lead.id}`, "3s");
      }
    }

    console.log("[outbound-batch] Batch complete:", {
      batchId,
      total: leads.length,
      succeeded: results.filter((r) => r.status === "initiated").length,
      failed: results.filter((r) => r.status === "failed").length,
    });

    return { batchId, results };
  },
);
