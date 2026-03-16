/**
 * Voice Consent / Source-Policy Ledger — pure logic module
 *
 * Provides typed definitions, deterministic risk derivation, and
 * ledger-entry builder for voice_interaction_ledger rows.
 *
 * BOUNDARY:
 *   - Zero DB imports. Pure TypeScript.
 *   - Used by: classify route, transfer route, ledger API routes.
 *   - Never writes directly — writes go through the caller (route handler).
 *   - Reusable for future outbound flows without modification.
 */

// ── Interaction type ──────────────────────────────────────────────────────────

export type VoiceInteractionType =
  | "inbound_seller"        // inbound classified as seller
  | "inbound_buyer"         // inbound classified as buyer
  | "inbound_unknown"       // inbound, caller type not yet determined
  | "inbound_spam_vendor"   // spam or vendor (low risk)
  | "outbound_follow_up"    // operator-initiated outbound
  | "warm_transfer_attempt" // warm transfer from an inbound call
  | "automation_prep";      // flagged for future automation (prep only, not live)

export const VOICE_INTERACTION_TYPES: VoiceInteractionType[] = [
  "inbound_seller",
  "inbound_buyer",
  "inbound_unknown",
  "inbound_spam_vendor",
  "outbound_follow_up",
  "warm_transfer_attempt",
  "automation_prep",
];

export const VOICE_INTERACTION_LABELS: Record<VoiceInteractionType, string> = {
  inbound_seller:        "Inbound — Seller",
  inbound_buyer:         "Inbound — Buyer",
  inbound_unknown:       "Inbound — Unknown",
  inbound_spam_vendor:   "Inbound — Spam / Vendor",
  outbound_follow_up:    "Outbound Follow-up",
  warm_transfer_attempt: "Warm Transfer",
  automation_prep:       "Automation Prep (future)",
};

// ── Consent basis ─────────────────────────────────────────────────────────────

export type ConsentBasis =
  | "inbound_response"  // caller initiated (cleanest)
  | "prior_opt_in"      // prior inquiry / existing relationship
  | "marketing_list"    // purchased or generated list (higher scrutiny)
  | "referral"          // referred by another party
  | "unknown";          // not determined

export const CONSENT_BASIS_LABELS: Record<ConsentBasis, string> = {
  inbound_response: "Inbound (caller initiated)",
  prior_opt_in:     "Prior opt-in / existing relationship",
  marketing_list:   "Marketing list",
  referral:         "Referral",
  unknown:          "Unknown",
};

/** Higher-scrutiny basis values that should raise risk tier */
export const HIGH_SCRUTINY_BASIS: ReadonlySet<ConsentBasis> = new Set([
  "marketing_list",
]);

// ── Automation tier ───────────────────────────────────────────────────────────

export type AutomationTier =
  | "operator_led"    // human operator handled call manually
  | "ai_assisted"     // AI content (draft, routing suggestion) was used
  | "automation_prep"; // flagged for future outbound automation (NOT active)

export const AUTOMATION_TIER_LABELS: Record<AutomationTier, string> = {
  operator_led:    "Operator-led",
  ai_assisted:     "AI-assisted",
  automation_prep: "Automation prep (future, not active)",
};

// ── Risk tier ─────────────────────────────────────────────────────────────────

export type RiskTier = "low" | "medium" | "high" | "review";

export const RISK_TIER_LABELS: Record<RiskTier, string> = {
  low:    "Low",
  medium: "Medium",
  high:   "High",
  review: "Needs review",
};

export const RISK_TIER_COLORS: Record<RiskTier, { bg: string; text: string; border: string }> = {
  low:    { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  medium: { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/20"   },
  high:   { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-500/20"     },
  review: { bg: "bg-orange-500/10",  text: "text-orange-400",  border: "border-orange-500/20"  },
};

// ── Ledger row shape ──────────────────────────────────────────────────────────

export interface VoiceLedgerEntry {
  id:                   string;
  event_id:             string | null;
  lead_id:              string | null;
  interaction_type:     VoiceInteractionType;
  consent_basis:        ConsentBasis;
  automation_tier:      AutomationTier;
  risk_tier:            RiskTier;
  script_class:         string | null;
  handoff_rule_version: string | null;
  dnc_flag:             boolean;
  ai_assisted:          boolean;
  operator_led:         boolean;
  review_status:        "pending" | "reviewed" | "corrected" | "dismissed";
  review_note:          string | null;
  reviewed_by:          string | null;
  reviewed_at:          string | null;
  context_notes:        string | null;
  created_by:           string | null;
  created_at:           string;
  updated_at:           string;
}

// ── Input shape for building a ledger entry ───────────────────────────────────

export interface BuildLedgerInput {
  eventId:             string | null;
  leadId:              string | null;
  interactionType:     VoiceInteractionType;
  consentBasis?:       ConsentBasis;
  automationTier?:     AutomationTier;
  scriptClass?:        string | null;   // e.g. "seller_qualifying@1.0.0"
  handoffRuleVersion?: string | null;
  dncFlag?:            boolean;
  aiAssisted?:         boolean;
  operatorLed?:        boolean;
  contextNotes?:       string | null;
  createdBy:           string | null;
}

// ── deriveRiskTier ────────────────────────────────────────────────────────────
/**
 * Deterministic risk tier from consent basis + automation tier + flags.
 *
 * Rules (evaluated in priority order):
 *   high   — automation_prep, OR marketing_list consent, OR dnc_flag = true
 *   review — ai_assisted AND consent_basis = "unknown"
 *   medium — ai_assisted OR consent_basis = "unknown"
 *   low    — operator_led AND inbound_response/prior_opt_in/referral
 */
export function deriveRiskTier(input: {
  consentBasis:    ConsentBasis;
  automationTier:  AutomationTier;
  dncFlag:         boolean;
  aiAssisted:      boolean;
}): RiskTier {
  const { consentBasis, automationTier, dncFlag, aiAssisted } = input;

  if (dncFlag)                                              return "high";
  if (automationTier === "automation_prep")                 return "high";
  if (consentBasis === "marketing_list")                    return "high";
  if (aiAssisted && consentBasis === "unknown")             return "review";
  if (aiAssisted || consentBasis === "unknown")             return "medium";
  return "low";
}

// ── buildLedgerEntry ──────────────────────────────────────────────────────────
/**
 * Builds the INSERT-ready object for voice_interaction_ledger.
 * Computes risk_tier deterministically from other fields.
 * Returns a plain object with snake_case keys matching the DB column names.
 */
export function buildLedgerEntry(input: BuildLedgerInput): Omit<VoiceLedgerEntry, "id" | "created_at" | "updated_at"> {
  const consentBasis    = input.consentBasis   ?? "unknown";
  const automationTier  = input.automationTier ?? "operator_led";
  const dncFlag         = input.dncFlag        ?? false;
  const aiAssisted      = input.aiAssisted     ?? false;
  const operatorLed     = input.operatorLed    ?? true;

  const riskTier = deriveRiskTier({
    consentBasis,
    automationTier,
    dncFlag,
    aiAssisted,
  });

  return {
    event_id:             input.eventId,
    lead_id:              input.leadId,
    interaction_type:     input.interactionType,
    consent_basis:        consentBasis,
    automation_tier:      automationTier,
    risk_tier:            riskTier,
    script_class:         input.scriptClass        ?? null,
    handoff_rule_version: input.handoffRuleVersion ?? null,
    dnc_flag:             dncFlag,
    ai_assisted:          aiAssisted,
    operator_led:         operatorLed,
    review_status:        riskTier === "high" || riskTier === "review" ? "pending" : "reviewed",
    review_note:          null,
    reviewed_by:          null,
    reviewed_at:          null,
    context_notes:        input.contextNotes ?? null,
    created_by:           input.createdBy,
  };
}

// ── callerTypeToInteractionType ───────────────────────────────────────────────
/**
 * Maps an InboundCallerType string to the appropriate VoiceInteractionType.
 * Used by classify route.
 */
export function callerTypeToInteractionType(
  callerType: string,
  warmTransferReady?: boolean,
): VoiceInteractionType {
  if (warmTransferReady) return "warm_transfer_attempt";
  switch (callerType) {
    case "seller":  return "inbound_seller";
    case "buyer":   return "inbound_buyer";
    case "vendor":
    case "spam":    return "inbound_spam_vendor";
    default:        return "inbound_unknown";
  }
}

// ── Review status helpers ─────────────────────────────────────────────────────

export type LedgerReviewStatus = "pending" | "reviewed" | "corrected" | "dismissed";

export const LEDGER_REVIEW_STATUS_LABELS: Record<LedgerReviewStatus, string> = {
  pending:   "Pending review",
  reviewed:  "Reviewed",
  corrected: "Corrected",
  dismissed: "Dismissed",
};
