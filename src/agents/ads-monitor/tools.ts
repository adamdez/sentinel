/**
 * Ads Monitor Agent — MCP Tool Access List
 *
 * This agent reads from both Google Ads MCP (when available) and
 * Sentinel's ads tables (campaign_daily_stats, google_ads_campaigns).
 * It is read-only — no CRM writes, no ad modifications.
 */

/** Sentinel MCP tools this agent may use */
export const ADS_MONITOR_TOOLS = [
  "ads_performance",   // Campaign performance data from Sentinel tables
  "query_leads",       // Lead source attribution (which campaigns produce leads)
  "query_pipeline",    // Pipeline stage counts for conversion analysis
  "run_sql",           // Read-only SQL for custom aggregations
] as const;

export type AdsMonitorTool = typeof ADS_MONITOR_TOOLS[number];

/** Tools this agent is NOT allowed to use */
export const ADS_MONITOR_DENIED_TOOLS = [
  "ads_manage",          // No ad modifications — informational only
  "create_task",         // No task creation
  "update_next_action",  // No lead mutation
] as const;

/** Review gate policy for Ads Monitor Agent */
export const ADS_MONITOR_REVIEW_POLICY = {
  /** Informational only — no CRM or ad account writes */
  type: "informational" as const,
  writesToCRM: false,
  writesToAds: false,
  requiresApproval: false,
  /** Alert delivery channels */
  deliveryChannels: ["event_log", "morning_brief", "n8n_slack"],
  /** Rollback: N/A — agent only reads and reports */
  rollbackStrategy: "none",
};
