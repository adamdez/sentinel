/**
 * Dispo Agent Types
 *
 * Ranks buyers by fit, generates outreach drafts for top candidates.
 * Operator selects buyer and approves outreach before send.
 */

export interface DispoAgentInput {
  dealId: string;
  leadId: string;
  triggerType: "deal_under_contract" | "operator_request" | "stale_dispo";
  triggerRef?: string;
  maxBuyers?: number;       // Max buyers to generate drafts for (default 5)
  operatorNotes?: string;
}

export interface BuyerOutreachDraft {
  buyerId: string;
  buyerName: string;
  fitScore: number;
  fitFlags: string[];
  channel: "phone" | "email" | "sms";
  subject?: string;         // Email subject
  body: string;             // Message body or call talking points
  reasoning: string;        // Why this buyer and this approach
}

export interface DispoAgentResult {
  runId: string;
  dealId: string;
  leadId: string;
  totalBuyers: number;
  qualifiedBuyers: number;
  eliminatedBuyers: number;
  drafts: BuyerOutreachDraft[];
  status: "queued_for_review" | "no_buyers" | "failed" | "disabled";
  summary: string;
}
