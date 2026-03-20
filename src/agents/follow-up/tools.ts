/**
 * Follow-Up Agent — Tool Access + Review Gate
 *
 * Reads lead context and seller memory, produces drafts.
 * All drafts go to review_queue — operator approves before send.
 */

export const FOLLOW_UP_AGENT_MCP_TOOLS = [
  "lead_context",      // Full lead context snapshot
  "query_leads",       // Lead search for context
  "query_calls",       // Call history
  "query_dossiers",    // Intelligence dossiers
  "query_facts",       // Fact assertions
] as const;

export const FOLLOW_UP_AGENT_DENIED_TOOLS = [
  "create_task",           // Follow-up agent doesn't create tasks directly
  "update_next_action",    // Doesn't modify leads
  "ads_performance",       // Not relevant
  "ads_manage",            // Not relevant
  "run_sql",               // No raw SQL
] as const;

export const FOLLOW_UP_AGENT_REVIEW_POLICY = {
  writeType: "draft" as const,
  reviewGate: "operator_approval" as const,
  description: "Follow-Up Agent produces draft messages. All drafts go to review_queue. Operator must approve before any message is sent.",
} as const;
