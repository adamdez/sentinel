/**
 * QA Agent Types
 *
 * Post-call quality analysis. Informational only — no CRM writes.
 * Flags talk-ratio issues, premature pricing, missed mirrors, and coaching opportunities.
 */

export interface QAAgentInput {
  callLogId: string;
  leadId: string;
  triggerType: "post_call" | "manual" | "cron";
  triggerRef?: string;
}

export interface QAFlag {
  category: QAFlagCategory;
  severity: "info" | "warning" | "critical";
  description: string;
  timestamp?: string;     // Point in call where issue occurred
  suggestion?: string;    // Coaching suggestion
}

export type QAFlagCategory =
  | "talk_ratio"           // Operator talked too much (>60%)
  | "premature_price"      // Mentioned price/offer before qualifying
  | "missed_mirror"        // Missed opportunity to mirror/label seller emotion
  | "no_next_action"       // Call ended without setting next step
  | "short_call"           // Suspiciously short call (<30s with live answer)
  | "no_qualifying"        // Didn't ask qualifying questions (timeline, motivation, situation)
  | "interruption"         // Frequent interruptions of seller
  | "positive_rapport";    // Good rapport building (positive flag)

export interface QACallMetrics {
  durationSeconds: number;
  operatorTalkPercent: number | null;   // null if no transcript
  sellerTalkPercent: number | null;
  silencePercent: number | null;
  wordCount: number | null;
}

export interface QAResult {
  runId: string;
  callLogId: string;
  leadId: string;
  overallRating: "excellent" | "good" | "needs_improvement" | "poor" | "insufficient_data";
  score: number;              // 0-100
  metrics: QACallMetrics;
  flags: QAFlag[];
  summary: string;
  generatedAt: string;
}
