/**
 * Exception Agent — MCP Tool Access List
 *
 * Blueprint: "Every agent must have: system prompt, MCP tool access list,
 * review gate policy, run ID logging, rollback capability."
 *
 * The Exception Agent is read-only — it only uses query tools.
 * No write tools (create_task, update_next_action) are permitted.
 */

export const EXCEPTION_AGENT_TOOLS = [
  // Sentinel MCP read tools
  "lead_context",      // Full context snapshot for a single lead
  "query_leads",       // Search/filter leads + scores
  "query_pipeline",    // Funnel counts by stage
  "query_calls",       // Call KPIs + details
  "query_property",    // Deep dive single property
  "query_distress",    // Distress signal search
  "run_sql",           // Arbitrary read-only SQL for complex exception logic
] as const;

export type ExceptionAgentTool = typeof EXCEPTION_AGENT_TOOLS[number];

/**
 * Review gate policy for Exception Agent.
 * Informational only — no CRM writes, no review gate needed.
 * Output goes to: event_log + morning brief + n8n delivery.
 */
export const EXCEPTION_REVIEW_POLICY = {
  type: "informational" as const,
  writesToCRM: false,
  requiresApproval: false,
  deliveryChannels: ["event_log", "morning_brief", "n8n_sms"],
};
