/**
 * Dispo Agent — Tool Access + Review Gate
 *
 * Reads deal context, runs buyer-fit scoring, generates outreach drafts.
 * All drafts go to review_queue — operator selects buyer and approves.
 */

export const DISPO_AGENT_MCP_TOOLS = [
  "lead_context",      // Full lead context
  "query_leads",       // Lead search
  "query_pipeline",    // Pipeline context
  "run_sql",           // Buyer queries
] as const;

export const DISPO_AGENT_DENIED_TOOLS = [
  "update_next_action",    // Dispo agent doesn't modify leads
  "ads_performance",       // Not relevant
  "ads_manage",            // Not relevant
] as const;

export const DISPO_AGENT_REVIEW_POLICY = {
  writeType: "draft" as const,
  reviewGate: "operator_selection" as const,
  description: "Dispo Agent ranks buyers and generates outreach drafts. Operator selects which buyer to contact and approves the message before send.",
} as const;
