import { inngest } from "../client";
import { runResearchAgent } from "../../agents/research";

export const researchAgentJob = inngest.createFunction(
  {
    id: "research-agent",
    retries: 3,
    concurrency: { limit: 5, key: "event.data.leadId" },
    triggers: [{ event: "agent/research.requested" }],
  },
  async ({ event, step }) => {
    const result = await step.run("run-research-agent", async () => {
      return await runResearchAgent({
        leadId: event.data.leadId,
        triggeredBy: event.data.triggeredBy ?? "system",
        propertyId: event.data.propertyId,
        focusAreas: event.data.focusAreas,
        operatorNotes: event.data.operatorNotes,
      });
    });
    return result;
  }
);
