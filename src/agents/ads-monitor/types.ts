/**
 * Ads Monitor Agent — Types
 *
 * Input/output types for the Ads Monitor Agent.
 * Phase 1: deterministic threshold checks.
 */

export interface AdsMonitorInput {
  /** "daily_cron" | "anomaly_trigger" | "manual" */
  triggerType: "daily_cron" | "anomaly_trigger" | "manual";
  /** Who/what triggered this run */
  triggerRef: string;
  /** Optional: limit to specific campaign IDs */
  campaignIds?: string[];
}

export type AlertSeverity = "critical" | "high" | "medium";

export type AlertCategory =
  | "high_cpl"
  | "zero_leads"
  | "low_ctr"
  | "high_cpc"
  | "underspend"
  | "overspend"
  | "low_conversion_rate"
  | "impression_drop"
  | "waste";

export interface AdsAlert {
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  /** Campaign name, if alert is campaign-specific */
  campaignName: string | null;
  /** The metric that triggered the alert */
  metric: string;
  /** Current value */
  value: number;
  /** Threshold that was breached */
  threshold: number;
}

export interface AdsMonitorReport {
  runId: string;
  generatedAt: string;
  alerts: AdsAlert[];
  summary: string;
  totals: {
    critical: number;
    high: number;
    medium: number;
    total: number;
  };
  /** Aggregate metrics for the report period */
  metrics?: {
    totalSpend: number;
    totalLeads: number;
    blendedCPL: number;
    avgCTR: number;
    avgCPC: number;
    budgetUtilization: number;
  };
}
