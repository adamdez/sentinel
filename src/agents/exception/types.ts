/**
 * Exception Agent — Input/Output Types
 */

export interface ExceptionItem {
  leadId: string;
  ownerName: string | null;
  address: string | null;
  status: string;
  category: ExceptionCategory;
  severity: "critical" | "high" | "medium";
  description: string;
  currentNextAction: string | null;
  nextActionDueAt: string | null;
  daysSinceLastContact: number | null;
  totalCalls: number;
  liveAnswers: number;
}

export type ExceptionCategory =
  | "missing_next_action"
  | "overdue_follow_up"
  | "speed_to_lead_violation"
  | "stale_contact"
  | "contactability_failure"
  | "stale_dispo"
  | "contradiction_unresolved";

export interface ExceptionReport {
  runId: string;
  generatedAt: string;
  critical: ExceptionItem[];
  high: ExceptionItem[];
  medium: ExceptionItem[];
  summary: string;
  totals: {
    critical: number;
    high: number;
    medium: number;
    total: number;
  };
}

export interface ExceptionAgentInput {
  triggerType: "cron" | "manual";
  triggerRef?: string;
}
