/**
 * Outbound Prep — bounded preparation and review layer that supports
 * the live Jeff outbound system.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: PREP / REVIEW ONLY — NOT THE LIVE CONTROL CENTER
 * ─────────────────────────────────────────────────────────────────────────────
 * This module assembles hypothetical call-prep frames for review.
 * It does NOT place calls, trigger Twilio, or produce executable automation.
 * The automation_tier field on every frame is locked to "prep_only".
 * Enabling live outbound calls requires an explicit migration + code change.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT A PREP FRAME IS:
 *   A snapshot of everything the system would assemble for a lead
 *   if an outbound opener were placed: qual signals, objections, trust snippets,
 *   seller page links, opener script reference, and a handoff-readiness verdict.
 *
 * WHY THIS EXISTS:
 *   1. Lets Adam evaluate Jeff readiness across leads before scaling outbound volume.
 *   2. Gives Logan a pre-call brief format for operator-led outbound.
 *   3. Establishes the review/annotation contract so quality evaluation runs
 *      on prep frames before any prompt or policy change is trusted broadly.
 *
 * DATA SOURCES (all read-side, no writes to CRM):
 *   - CRMLeadContext snapshot (qual signals, call history)
 *   - ObjectionTag rows (from lead_objection_tags)
 *   - TrustSnippet registry (static, from trust-language.ts)
 *   - SellerPage registry (static, from public-pages.ts)
 *   - Voice registry (opener script key / version)
 *
 * BOUNDARY:
 *   - Pure TypeScript logic. Zero DB imports.
 *   - Reusable on client and server.
 *   - Never writes to leads, calls_log, or tasks.
 */

import type { CRMLeadContext, ObjectionTag } from "@/lib/dialer/types";
import { getSnippetsForContext, type TrustSnippetKey } from "@/lib/trust-language";
import { inferRelevantPage, getAllSellerPages, type SellerPageKey } from "@/lib/public-pages";

// ── Automation guard ──────────────────────────────────────────────────────────

/**
 * The only valid tier for frames created in this prep layer.
 * A future migration is required to introduce a "live_pilot" tier.
 */
export const PREP_AUTOMATION_TIER = "prep_only" as const;
export type OutboundAutomationTier = typeof PREP_AUTOMATION_TIER;

// ── Qual snapshot ─────────────────────────────────────────────────────────────

/**
 * Subset of CRMLeadContext captured at frame-assembly time.
 * Stored as JSONB in outbound_prep_frames.qual_snapshot.
 */
export interface OutboundQualSnapshot {
  address:               string | null;
  phone:                 string | null;
  motivationLevel:       number | null;
  sellerTimeline:        string | null;
  qualificationRoute:    string | null;
  totalCalls:            number;
  liveAnswers:           number;
  lastCallDisposition:   string | null;
  lastCallDate:          string | null;
  lastCallNotes:         string | null;
  openTaskTitle:         string | null;
  openTaskDueAt:         string | null;
}

// ── Handoff readiness ─────────────────────────────────────────────────────────

export type HandoffReadinessVerdict = "ready" | "not_ready";

export interface HandoffReadiness {
  verdict:         HandoffReadinessVerdict;
  /** Human-readable reason when not_ready */
  fallbackReason:  string | null;
  /** Which required fields were missing */
  missingFields:   string[];
  /** Which objections are blocking (unresolved + high friction) */
  blockingObjections: ObjectionTag[];
}

/**
 * Required qual fields for handoff-readiness.
 * All must be non-null/non-zero for ready=true.
 */
const REQUIRED_QUAL_FIELDS: Array<{
  field: keyof OutboundQualSnapshot;
  label: string;
}> = [
  { field: "address",          label: "Subject address" },
  { field: "phone",            label: "Phone number" },
  { field: "motivationLevel",  label: "Motivation level (1–5)" },
  { field: "sellerTimeline",   label: "Seller timeline" },
];

/**
 * Objection tags that indicate strong seller resistance, blocking handoff readiness.
 * Uses only tags from the actual ObjectionTag union.
 */
const BLOCKING_OBJECTION_TAGS: ObjectionTag[] = [
  "price_too_low",
  "talking_to_realtor",
  "wants_full_retail",
  "inherited_dispute",
];

export function assessHandoffReadiness(
  qual:       OutboundQualSnapshot,
  objections: ObjectionTag[],
): HandoffReadiness {
  const missingFields: string[] = [];
  for (const { field, label } of REQUIRED_QUAL_FIELDS) {
    const v = qual[field];
    if (v == null || v === "" || v === 0) missingFields.push(label);
  }

  const blockingObjections = objections.filter(t =>
    BLOCKING_OBJECTION_TAGS.includes(t),
  );

  if (missingFields.length > 0 || blockingObjections.length > 0) {
    const parts: string[] = [];
    if (missingFields.length > 0)
      parts.push(`Missing: ${missingFields.join(", ")}`);
    if (blockingObjections.length > 0)
      parts.push(`Blocking objections: ${blockingObjections.join(", ")}`);
    return {
      verdict:            "not_ready",
      fallbackReason:     parts.join(". "),
      missingFields,
      blockingObjections,
    };
  }

  return { verdict: "ready", fallbackReason: null, missingFields: [], blockingObjections: [] };
}

// ── Trust snippet selection ───────────────────────────────────────────────────

/**
 * Determines which trust snippets are most relevant for a hypothetical
 * outbound opener for this lead. Prefers "always_available" + context snippets
 * that address likely opener needs.
 */
export function selectTrustSnippets(qual: OutboundQualSnapshot): TrustSnippetKey[] {
  const keys: TrustSnippetKey[] = [];

  // Always include how_got_info and who_we_are for outbound — these are the
  // first two objections any outbound call will face.
  keys.push("how_got_info", "who_we_are");

  // First call → include what_happens_next
  if (qual.totalCalls === 0) keys.push("what_happens_next");

  // If timeline is unknown → include timeline_flexibility
  if (!qual.sellerTimeline || qual.sellerTimeline === "unknown")
    keys.push("timeline_flexibility");

  // Deduplicate and validate against registry
  const validKeys = getSnippetsForContext("always_available").map(s => s.key);
  return [...new Set(keys)].filter(k => validKeys.includes(k as TrustSnippetKey)) as TrustSnippetKey[];
}

// ── Seller page selection ─────────────────────────────────────────────────────

export function selectSellerPages(
  qual:      OutboundQualSnapshot,
  objTags:   ObjectionTag[],
): SellerPageKey[] {
  const all = getAllSellerPages();
  const inferred = inferRelevantPage({
    tags:       objTags.map(String),
    totalCalls: qual.totalCalls,
  });

  const keys = new Set<SellerPageKey>([inferred]);

  // Also include about_us for all outbound (trust is the #1 concern)
  keys.add("about_us");

  // Validate against registry
  const validKeys = new Set(all.map(p => p.key));
  return [...keys].filter(k => validKeys.has(k));
}

// ── Frame assembly ────────────────────────────────────────────────────────────

export interface AssembleFrameInput {
  crmContext:        CRMLeadContext;
  objectionTags:     ObjectionTag[];
  openerScriptKey?:  string;
  openerScriptVersion?: string;
}

export interface OutboundPrepFrame {
  leadId:               string;
  automationTier:       OutboundAutomationTier;
  qualSnapshot:         OutboundQualSnapshot;
  objectionTags:        ObjectionTag[];
  trustSnippetsUsed:    TrustSnippetKey[];
  sellerPagesIncluded:  SellerPageKey[];
  openerScriptKey:      string | null;
  openerScriptVersion:  string | null;
  handoffReady:         boolean;
  fallbackReason:       string | null;
}

/**
 * Assembles a hypothetical prep frame from existing operator context.
 *
 * PURE FUNCTION — no side effects, no DB writes, no AI calls.
 * The result is what would be stored in outbound_prep_frames.
 */
export function assembleFrame(input: AssembleFrameInput): OutboundPrepFrame {
  const { crmContext, objectionTags, openerScriptKey, openerScriptVersion } = input;

  const qualSnapshot: OutboundQualSnapshot = {
    address:             crmContext.address,
    phone:               crmContext.phone,
    motivationLevel:     crmContext.motivationLevel,
    sellerTimeline:      crmContext.sellerTimeline,
    qualificationRoute:  crmContext.qualificationRoute,
    totalCalls:          crmContext.totalCalls,
    liveAnswers:         crmContext.liveAnswers,
    lastCallDisposition: crmContext.lastCallDisposition,
    lastCallDate:        crmContext.lastCallDate,
    lastCallNotes:       crmContext.lastCallNotes,
    openTaskTitle:       crmContext.openTaskTitle,
    openTaskDueAt:       crmContext.openTaskDueAt,
  };

  const readiness    = assessHandoffReadiness(qualSnapshot, objectionTags);
  const snippetKeys  = selectTrustSnippets(qualSnapshot);
  const pageKeys     = selectSellerPages(qualSnapshot, objectionTags);

  return {
    leadId:               crmContext.leadId,
    automationTier:       PREP_AUTOMATION_TIER,
    qualSnapshot,
    objectionTags,
    trustSnippetsUsed:    snippetKeys,
    sellerPagesIncluded:  pageKeys,
    openerScriptKey:      openerScriptKey ?? null,
    openerScriptVersion:  openerScriptVersion ?? null,
    handoffReady:         readiness.verdict === "ready",
    fallbackReason:       readiness.fallbackReason,
  };
}

// ── Review status ─────────────────────────────────────────────────────────────

export type PrepFrameReviewStatus = "pending" | "approved" | "flagged" | "rejected";

export const PREP_FRAME_REVIEW_STATUS_LABELS: Record<PrepFrameReviewStatus, string> = {
  pending:  "Pending review",
  approved: "Approved",
  flagged:  "Flagged",
  rejected: "Rejected",
};

export const PREP_FRAME_REVIEW_STATUS_COLORS: Record<PrepFrameReviewStatus, string> = {
  pending:  "bg-muted/10 text-foreground border-border/20",
  approved: "bg-muted/10 text-foreground border-border/20",
  flagged:  "bg-muted/10 text-foreground border-border/20",
  rejected: "bg-muted/10 text-foreground border-border/20",
};

// ── Pilot readiness summary ───────────────────────────────────────────────────

export interface PilotReadinessSummary {
  totalFrames:      number;
  readyFrames:      number;
  notReadyFrames:   number;
  pendingReview:    number;
  approvedFrames:   number;
  flaggedFrames:    number;
  readyPct:         number | null;
  topFallbackReasons: Array<{ reason: string; count: number }>;
}

/** Derive a pilot readiness summary from a list of stored frame rows. */
export function derivePilotReadiness(frames: Array<{
  handoff_ready:  boolean;
  fallback_reason: string | null;
  review_status:  PrepFrameReviewStatus;
}>): PilotReadinessSummary {
  const total    = frames.length;
  const ready    = frames.filter(f => f.handoff_ready).length;
  const notReady = total - ready;
  const pending  = frames.filter(f => f.review_status === "pending").length;
  const approved = frames.filter(f => f.review_status === "approved").length;
  const flagged  = frames.filter(f => f.review_status === "flagged").length;

  // Tally fallback reasons
  const reasonCounts = new Map<string, number>();
  for (const f of frames) {
    if (f.fallback_reason) {
      reasonCounts.set(f.fallback_reason, (reasonCounts.get(f.fallback_reason) ?? 0) + 1);
    }
  }
  const topFallbackReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    totalFrames:      total,
    readyFrames:      ready,
    notReadyFrames:   notReady,
    pendingReview:    pending,
    approvedFrames:   approved,
    flaggedFrames:    flagged,
    readyPct:         total > 0 ? Math.round((ready / total) * 100) : null,
    topFallbackReasons,
  };
}
