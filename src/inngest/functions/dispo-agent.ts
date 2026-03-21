import { inngest } from "../client";
import { runDispoAgent } from "../../agents/dispo";

export const dispoAgentJob = inngest.createFunction(
  {
    id: "dispo-agent",
    retries: 2,
    concurrency: { limit: 5, key: "event.data.dealId" },
    triggers: [{ event: "agent/dispo.requested" }],
  },
  async ({ event, step }) => {
    const result = await step.run("run-dispo-agent", async () => {
      return await runDispoAgent({
        dealId: event.data.dealId,
        leadId: event.data.leadId,
        triggerType: event.data.triggerType ?? "operator_request",
        triggerRef: event.data.triggerRef,
        maxBuyers: event.data.maxBuyers,
        operatorNotes: event.data.operatorNotes,
      });
    });
    return result;
  }
);
