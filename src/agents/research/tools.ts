/**
 * Research Agent — MCP Tool Access List
 *
 * Principle of least privilege: only tools the Research Agent needs.
 * This agent is read-heavy — it reads from Sentinel MCP and writes
 * only to staging tables (artifacts, facts, proposed dossiers).
 */

/** Sentinel MCP tools this agent may use (read-only) */
export const RESEARCH_AGENT_MCP_TOOLS = [
  "lead_context",      // Full context snapshot for the lead
  "query_leads",       // Search leads (for related leads on same property)
  "query_property",    // Deep property details
  "query_distress",    // Existing distress signals
  "query_dossiers",    // Check for existing dossiers
  "query_artifacts",   // Check for existing artifacts
  "query_facts",       // Check for existing facts
  "run_sql",           // Read-only SQL for edge cases
] as const;

/** Tools this agent is NOT allowed to use */
export const RESEARCH_AGENT_DENIED_TOOLS = [
  "create_task",         // No task creation — agent proposes, doesn't create work
  "update_next_action",  // No lead mutation
  "ads_performance",     // Not in scope
  "ads_manage",          // Not in scope
] as const;

/** Review gate policy for this agent */
export const RESEARCH_AGENT_REVIEW_POLICY = {
  /** Agent writes to draft/staging tables only */
  writeType: "draft" as const,
  /** Dossiers are created as 'proposed' — operator must review + promote */
  reviewGate: "manual_review" as const,
  /** Operator promotes via POST /api/dossiers/[lead_id]/promote */
  promotionPath: "/api/dossiers/[lead_id]/promote",
  /** Rollback: DELETE FROM dossiers WHERE ai_run_id = $run_id (cascades) */
  rollbackStrategy: "delete_by_run_id",
};
