/**
 * Follow-Up Agent Types
 *
 * Generates personalized follow-up drafts using seller memory.
 * All outputs go to review_queue — operator approves before send.
 */

export interface FollowUpAgentInput {
  leadId: string;
  triggerType: "stale_lead" | "scheduled" | "operator_request";
  triggerRef?: string;
  channel?: "call" | "sms" | "email";   // Preferred outreach channel
  operatorNotes?: string;                 // Additional context from operator
}

export interface FollowUpDraft {
  channel: "call" | "sms" | "email";
  subject?: string;       // Email subject
  body: string;            // Message body or call script talking points
  callScript?: string;     // Optional call talking points
  reasoning: string;       // Why this approach was chosen
  sellerMemoryUsed: string[];  // Which seller memory facts informed the draft
}

export interface FollowUpAgentResult {
  runId: string;
  leadId: string;
  drafts: FollowUpDraft[];
  status: "queued_for_review" | "failed" | "disabled";
  summary: string;
}
