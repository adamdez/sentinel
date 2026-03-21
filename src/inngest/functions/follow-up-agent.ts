import { inngest } from "../client";
import { runFollowUpAgent } from "../../agents/follow-up";

export const followUpAgentJob = inngest.createFunction(
  {
    id: "follow-up-agent",
    retries: 3,
    concurrency: { limit: 5, key: "event.data.leadId" },
    triggers: [{ event: "agent/follow-up.requested" }],
  },
  async ({ event, step }) => {
    const result = await step.run("run-follow-up-agent", async () => {
      return await runFollowUpAgent({
        leadId: event.data.leadId,
        triggerType: event.data.triggerType ?? "operator_request",
        triggerRef: event.data.triggerRef,
        channel: event.data.channel,
        operatorNotes: event.data.operatorNotes,
      });
    });
    return result;
  }
);
