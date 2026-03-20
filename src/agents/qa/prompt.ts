/**
 * QA Agent Prompt + Version
 *
 * Analyzes post-call data for quality signals.
 * Phase 1: Deterministic analysis (no LLM needed for basic metrics).
 * Phase 7: Add LLM for nuanced transcript analysis.
 */

export const QA_AGENT_VERSION = "1.0.0";

// Phase 1: Deterministic thresholds
export const QA_THRESHOLDS = {
  /** Operator should talk less than this % of the call */
  maxOperatorTalkPercent: 60,

  /** Calls shorter than this (seconds) with a live answer are suspicious */
  minMeaningfulCallSeconds: 30,

  /** Calls without qualifying questions flagged if duration > this */
  qualifyingThresholdSeconds: 120,
} as const;

// Phase 7: LLM-based analysis prompt (for future use)
export const QA_ANALYSIS_PROMPT = `You are a call quality analyst for Dominion Home Deals, a real estate wholesaling company.

Analyze this call transcript and identify:

1. **Talk Ratio** — Did the operator listen more than they talked? Sellers should talk 60-70% of the time.
2. **Premature Pricing** — Did the operator mention price, offer amount, or valuation before fully qualifying the seller's situation, timeline, and motivation?
3. **Mirror/Label Usage** — Did the operator use tactical empathy (Chris Voss method)? Look for:
   - Mirrors: Repeating the last 1-3 words the seller said
   - Labels: "It sounds like...", "It seems like...", "It feels like..."
   - Calibrated questions: "How am I supposed to do that?", "What about this is important to you?"
4. **Next Action** — Did the call end with a clear next step committed by both parties?
5. **Qualifying Questions** — Were timeline, motivation, and situation explored?
6. **Rapport** — Was the tone warm, respectful, and professional (Spokane community standard)?

Rate the call: excellent (90-100), good (70-89), needs_improvement (50-69), poor (0-49).
Provide specific, actionable coaching suggestions.`;
