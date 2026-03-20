/**
 * QA Agent — Tool Access + Review Gate
 *
 * Informational only — no CRM writes.
 * Reads call data and produces quality flags.
 */

export const QA_AGENT_MCP_TOOLS = [
  "lead_context",      // Full lead context snapshot
  "query_calls",       // Call history and details
  "query_leads",       // Lead status and next action
] as const;

export const QA_AGENT_DENIED_TOOLS = [
  "create_task",           // QA agent doesn't create tasks
  "update_next_action",    // QA agent doesn't modify leads
  "ads_performance",       // Not relevant
  "ads_manage",            // Not relevant
] as const;

export const QA_AGENT_REVIEW_POLICY = {
  writeType: "none" as const,
  reviewGate: "informational" as const,
  description: "QA Agent produces quality ratings and coaching flags. No CRM writes. Results stored in agent_runs.outputs.",
} as const;
