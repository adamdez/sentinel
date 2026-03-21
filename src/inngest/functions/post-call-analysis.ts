import { inngest } from "../client";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const PROMPT = `You are analyzing a real estate seller call transcript. Extract the following in JSON:
{
  "promises_made": ["string array of what the buyer (Dominion) committed to"],
  "objections_raised": ["string array of seller concerns, verbatim where possible"],
  "deal_temperature": "hot|warm|cold|dead",
  "decision_maker_confidence": "weak|probable|strong",
  "next_action_suggestion": "string — specific next step Logan should take",
  "key_facts": ["string array of important facts mentioned"]
}
Only return valid JSON. If the transcript is too short or unclear, return empty arrays and deal_temperature: "cold".`;

export const postCallAnalysisJob = inngest.createFunction(
  {
    id: "post-call-analysis",
    retries: 3,
    concurrency: { limit: 3 },
    triggers: [{ event: "voice/post-call-analysis.requested" }],
  },
  async ({ event, step }) => {
    const { voiceSessionId, leadId, transcript, summary } = event.data;

    if (!transcript || transcript.length < 50) {
      return { skipped: true, reason: "transcript too short" };
    }

    const analysis = await step.run("analyze-transcript", async () => {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${PROMPT}\n\nTRANSCRIPT:\n${transcript}\n\nSUMMARY:\n${summary ?? ""}`,
          },
        ],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "{}";
      try {
        return JSON.parse(text);
      } catch {
        return {
          promises_made: [],
          objections_raised: [],
          deal_temperature: "cold",
          decision_maker_confidence: "weak",
          next_action_suggestion: "",
          key_facts: [],
        };
      }
    });

    await step.run("write-post-call-structures", async () => {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // post_call_structures table does not exist in schema — store in voice_sessions.extracted_facts
      await sb.from("voice_sessions").update({
        extracted_facts: [
          ...(analysis.promises_made ?? []).map((p: string) => ({ type: "promise", value: p })),
          ...(analysis.objections_raised ?? []).map((o: string) => ({ type: "objection", value: o })),
          { type: "deal_temperature", value: analysis.deal_temperature },
          { type: "next_action_suggestion", value: analysis.next_action_suggestion },
        ],
      }).eq("id", voiceSessionId);
    });

    return { voiceSessionId, leadId, analysis };
  }
);
