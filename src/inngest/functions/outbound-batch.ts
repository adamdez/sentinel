/**
 * Inngest function: Process outbound call batch.
 *
 * Receives a list of leads, calls each one sequentially via Vapi
 * with a 3-second delay between calls to respect rate limits.
 *
 * Each call creates a voice_session with direction=outbound.
 * The webhook handler takes over from there for status updates,
 * function calls, and end-of-call processing.
 */

import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import { initiateOutboundCall } from "@/providers/voice/vapi-adapter";

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

        // Create voice_session
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: session, error: sessErr } = await (sb.from("voice_sessions") as any)
          .insert({
            direction: "outbound",
            lead_id: lead.id,
            from_number: lead.phone,
            status: "initiating",
            caller_type: "seller",
            initiated_by: initiatedBy,
            metadata: { batch_id: batchId },
          })
          .select("id")
          .single();

        if (sessErr || !session) {
          return { leadId: lead.id, status: "failed", error: `Session creation failed: ${sessErr?.message}` };
        }

        try {
          const { vapiCallId } = await initiateOutboundCall(lead.phone, serverUrl);

          // Update session with Vapi call ID
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("voice_sessions") as any)
            .update({ vapi_call_id: vapiCallId, status: "ai_handling" })
            .eq("id", session.id);

          return { leadId: lead.id, status: "initiated", voiceSessionId: session.id, vapiCallId };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);

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
