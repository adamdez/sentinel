import type { CoachItem, CoachContext } from "./coach-types";

// ── Helper: check if qualification is mostly complete ──
function qualMostlyComplete(ctx: CoachContext): boolean {
  return (ctx.lead?.qualification_completeness ?? 0) >= 0.6;
}

// ── Helper: check if follow-up is overdue ──
function isOverdue(ctx: CoachContext): boolean {
  if (!ctx.lead?.next_action_at) return false;
  return new Date(ctx.lead.next_action_at) < new Date();
}

// ── Helper: stage label ──
const STAGE_LABELS: Record<string, string> = {
  staging:
    "Staging — being enriched by the system. Will auto-promote to Prospect.",
  prospect: "Prospect — awaiting first contact. Call this seller.",
  lead: "Lead — active seller conversation. Keep qualifying and moving toward an offer.",
  negotiation:
    "Negotiation — under active offer discussion. Work toward agreement.",
  disposition:
    "Disposition — post-negotiation logistics. Coordinate closing.",
  nurture:
    "Nurture — scheduled re-engagement. Follow up on the date you set.",
  dead: "Dead — disqualified or opted out. Can be revived to Nurture if circumstances change.",
  closed:
    "Closed — terminal. Deal completed or permanently resolved. Hidden from daily inbox.",
};

// ── Helper: route label ──
const ROUTE_LABELS: Record<string, string> = {
  offer_ready:
    "Offer Ready — qualification supports making an offer. Pull comps, run your numbers, and prep the offer.",
  follow_up:
    "Follow Up — callback scheduled. Call back on the date you set and continue qualifying.",
  nurture:
    "Nurture — back-burner lead. Check in periodically but don't prioritize daily.",
  dead: "Dead — disqualified. Seller not motivated, property doesn't fit, or opted out.",
  escalate:
    "Escalate — flagged for Adam's review. You still own the lead. Adam will review and may adjust the route.",
};

export const COACH_ITEMS: CoachItem[] = [
  // ════════════════════════════════════════════
  // LEAD DETAIL — BLOCKERS
  // ════════════════════════════════════════════
  {
    id: "ld-block-assign-negotiate",
    type: "hard_rule",
    category: "blocker",
    title: "Assignment required",
    body: "Assign this lead to yourself or a team member before moving to Negotiation. The system needs to know who owns the deal.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      (ctx.lead?.status === "prospect" || ctx.lead?.status === "lead") &&
      !ctx.lead?.assigned_to,
    priority: 1,
  },
  {
    id: "ld-block-assign-escalate",
    type: "hard_rule",
    category: "blocker",
    title: "Assignment required for escalation",
    body: "Assign this lead before escalating. Escalation creates a review task for Adam — he needs to know who's working the lead.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      ctx.lead?.qualification_route !== "escalate" && !ctx.lead?.assigned_to,
    priority: 2,
  },
  {
    id: "ld-block-nurture-no-action",
    type: "hard_rule",
    category: "blocker",
    title: "Next action required for Nurture",
    body: "Set a follow-up date before moving to Nurture. Without a scheduled date, the lead goes dark and gets lost.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      ctx.lead?.status === "nurture" && !ctx.lead?.next_action_at,
    priority: 3,
  },
  {
    id: "ld-block-dead-no-reason",
    type: "hard_rule",
    category: "blocker",
    title: "Dead reason required",
    body: "Add a note, set a disposition, or choose a dead route before marking this lead Dead. Prevents accidental disqualification.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      ctx.lead?.status !== "dead" &&
      !ctx.lead?.has_note_context &&
      !ctx.lead?.has_disposition &&
      ctx.lead?.qualification_route !== "dead",
    priority: 4,
  },
  {
    id: "ld-block-lock-conflict",
    type: "hard_rule",
    category: "blocker",
    title: "Another operator updated this lead",
    body: "Refresh the page and try again. Someone else saved changes since you opened this lead.",
    surfaces: ["lead_detail"],
    condition: () => false, // activated dynamically on save error
    priority: 0,
  },

  // ════════════════════════════════════════════
  // LEAD DETAIL — NEXT STEPS
  // ════════════════════════════════════════════
  {
    id: "ld-next-first-call",
    type: "suggestion",
    category: "next_step",
    title: "Call this seller",
    body: "No contact attempts yet. Speed-to-lead matters — try calling now.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      (ctx.lead?.status === "prospect" || ctx.lead?.status === "lead") &&
      ctx.lead?.calls_count === 0,
    priority: 10,
  },
  {
    id: "ld-next-qualify",
    type: "recommended",
    category: "next_step",
    title: "Finish qualification",
    body: "You've made contact. Complete the motivation, timeline, condition, and price fields to determine the route.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      (ctx.lead?.calls_count ?? 0) >= 1 &&
      (ctx.lead?.qualification_completeness ?? 0) < 0.6 &&
      ctx.lead?.status !== "dead" &&
      ctx.lead?.status !== "closed",
    priority: 20,
  },
  {
    id: "ld-next-set-route",
    type: "recommended",
    category: "next_step",
    title: "Set a route",
    body: "Qualification looks mostly complete. Choose a route: Offer Ready, Follow Up, Nurture, Dead, or Escalate.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      qualMostlyComplete(ctx) &&
      !ctx.lead?.qualification_route &&
      ctx.lead?.status !== "dead" &&
      ctx.lead?.status !== "closed",
    priority: 25,
  },
  {
    id: "ld-next-prep-offer",
    type: "recommended",
    category: "next_step",
    title: "Prep an offer",
    body: "Routed as Offer Ready. Pull comps, run the calculator, and set an offer amount.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      ctx.lead?.qualification_route === "offer_ready" &&
      !ctx.lead?.offer_amount,
    priority: 15,
  },
  {
    id: "ld-next-overdue",
    type: "suggestion",
    category: "next_step",
    title: "Follow-up overdue",
    body: (ctx) => {
      const d = ctx.lead?.next_action_at;
      if (!d)
        return "You have an overdue follow-up. Call or update the next action.";
      const date = new Date(d).toLocaleDateString();
      return `Follow-up was scheduled for ${date}. Call or update the next action.`;
    },
    surfaces: ["lead_detail"],
    condition: isOverdue,
    priority: 5,
  },
  {
    id: "ld-next-no-action",
    type: "recommended",
    category: "next_step",
    title: "Set a next action",
    body: "Active leads need a next step. Schedule a call or follow-up to keep this moving.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      ["lead", "negotiation"].includes(ctx.lead?.status ?? "") &&
      !ctx.lead?.next_action_at,
    priority: 30,
  },

  // ════════════════════════════════════════════
  // LEAD DETAIL — EXPLAINERS
  // ════════════════════════════════════════════
  {
    id: "ld-explain-stage",
    type: "suggestion",
    category: "explainer",
    title: "Current stage",
    body: (ctx) => STAGE_LABELS[ctx.lead?.status ?? ""] ?? "Unknown stage.",
    surfaces: ["lead_detail"],
    condition: (ctx) => !!ctx.lead?.status,
    priority: 100,
  },
  {
    id: "ld-explain-route",
    type: "suggestion",
    category: "explainer",
    title: "Current route",
    body: (ctx) =>
      ROUTE_LABELS[ctx.lead?.qualification_route ?? ""] ??
      "No route set yet. Complete qualification to determine next steps.",
    surfaces: ["lead_detail"],
    condition: () => true,
    priority: 110,
  },
  {
    id: "ld-explain-escalate",
    type: "recommended",
    category: "explainer",
    title: "Escalation review",
    body: "This lead is flagged for Adam's review. You still own it — escalation doesn't reassign. Adam will review and may adjust the route or provide direction.",
    surfaces: ["lead_detail"],
    condition: (ctx) => ctx.lead?.qualification_route === "escalate",
    priority: 105,
  },
  {
    id: "ld-explain-closed",
    type: "hard_rule",
    category: "explainer",
    title: "Closed (terminal)",
    body: "Closed leads are hidden from the daily inbox. This is intentional — Closed means the deal completed or was permanently resolved. No further stage changes allowed.",
    surfaces: ["lead_detail"],
    condition: (ctx) => ctx.lead?.status === "closed",
    priority: 101,
  },
  {
    id: "ld-explain-my-leads",
    type: "recommended",
    category: "explainer",
    title: "'My Leads' is assignment, not stage",
    body: "Leads appear in 'My Leads' because they're assigned to you. This is a filter, not a workflow stage. The actual stage (Prospect, Lead, etc.) still determines where the lead is in the pipeline.",
    surfaces: ["lead_detail"],
    condition: (ctx) => !!ctx.lead?.assigned_to,
    priority: 115,
  },
  {
    id: "ld-explain-disposition-path",
    type: "hard_rule",
    category: "explainer",
    title: "Disposition requires Negotiation",
    body: "Leads can only enter Disposition from Negotiation. This ensures every deal goes through an active offer discussion before logistics begin.",
    surfaces: ["lead_detail"],
    condition: (ctx) =>
      ctx.lead?.status === "negotiation" ||
      ctx.lead?.status === "disposition",
    priority: 120,
  },

  // ════════════════════════════════════════════
  // CALL CLOSEOUT
  // ════════════════════════════════════════════
  {
    id: "close-explain-presets",
    type: "recommended",
    category: "tip",
    title: "Presets vs. manual dates",
    body: "Preset buttons (Call 3 Days, Nurture 14 Days) auto-fill the follow-up date. You can still adjust the date after selecting a preset.",
    surfaces: ["lead_detail_closeout"],
    condition: () => true,
    priority: 50,
  },
  {
    id: "close-explain-outcome",
    type: "recommended",
    category: "tip",
    title: "Outcome vs. Route",
    body: "Outcome = what happened on this call (voicemail, interested). Route = where the lead goes next in the workflow (follow up, offer ready). They're separate decisions.",
    surfaces: ["lead_detail_closeout"],
    condition: () => true,
    priority: 51,
  },
  {
    id: "close-block-no-date",
    type: "hard_rule",
    category: "blocker",
    title: "Follow-up date required",
    body: "Select a date for the next follow-up. Without a date, this lead won't appear in your queue when it's time to call back.",
    surfaces: ["lead_detail_closeout"],
    condition: (ctx) =>
      (ctx.closeout?.action_type === "follow_up_call" ||
        ctx.closeout?.action_type === "nurture_check_in") &&
      !ctx.closeout?.has_date,
    priority: 1,
  },
  {
    id: "close-explain-escalate",
    type: "recommended",
    category: "tip",
    title: "Escalation review",
    body: "This creates a review task for Adam. No date needed — Adam reviews on his schedule. You keep ownership of the lead.",
    surfaces: ["lead_detail_closeout"],
    condition: (ctx) => ctx.closeout?.action_type === "escalation_review",
    priority: 52,
  },
  {
    id: "close-next-note",
    type: "suggestion",
    category: "next_step",
    title: "Add a closeout note",
    body: "Even a short note helps: what did the seller say? What objection came up? This shows in the timeline and helps on the next call.",
    surfaces: ["lead_detail_closeout"],
    condition: (ctx) =>
      ctx.closeout?.has_disposition === true && !ctx.closeout?.has_note,
    priority: 40,
  },
  {
    id: "close-explain-last-contact",
    type: "suggestion",
    category: "explainer",
    title: "About last contact time",
    body: "The system records when you last made meaningful contact. Setting a disposition OR saving a note with a next action counts as contact activity.",
    surfaces: ["lead_detail_closeout"],
    condition: () => true,
    priority: 130,
  },

  // ════════════════════════════════════════════
  // PIPELINE
  // ════════════════════════════════════════════
  {
    id: "pipe-explain-my-leads",
    type: "recommended",
    category: "explainer",
    title: "'My Leads' is a filter",
    body: "This lane shows leads assigned to you. It's not a workflow stage. Moving a lead here changes assignment, not stage.",
    surfaces: ["pipeline"],
    condition: () => true,
    priority: 100,
  },
  {
    id: "pipe-block-drag",
    type: "hard_rule",
    category: "blocker",
    title: "Stage move blocked",
    body: (ctx) =>
      ctx.pipeline?.dragBlockReason ??
      "This stage transition is not allowed. Check the lead's current state and prerequisites.",
    surfaces: ["pipeline"],
    condition: (ctx) => ctx.pipeline?.dragBlocked === true,
    priority: 1,
  },

  // ════════════════════════════════════════════
  // LEADS INBOX
  // ════════════════════════════════════════════
  {
    id: "inbox-explain-segments",
    type: "suggestion",
    category: "explainer",
    title: "Attention segments",
    body: "Overdue: past their follow-up date. New Inbound: arrived <24h ago with no calls. Needs Qualification: contacted but no route set. Escalated: flagged for Adam's review.",
    surfaces: ["leads_inbox"],
    condition: () => true,
    priority: 100,
  },
  {
    id: "inbox-next-priority",
    type: "suggestion",
    category: "next_step",
    title: "Overdue leads first",
    body: (ctx) =>
      `You have ${ctx.inbox?.overdue_count ?? 0} leads past their follow-up date. These are your highest priority — sellers are waiting.`,
    surfaces: ["leads_inbox"],
    condition: (ctx) => (ctx.inbox?.overdue_count ?? 0) > 0,
    priority: 10,
  },
  {
    id: "inbox-next-new",
    type: "suggestion",
    category: "next_step",
    title: "New inbound leads",
    body: (ctx) =>
      `${ctx.inbox?.new_inbound_count ?? 0} leads arrived in the last 24 hours with no contact. Speed-to-lead drives conversion.`,
    surfaces: ["leads_inbox"],
    condition: (ctx) =>
      (ctx.inbox?.overdue_count ?? 0) === 0 &&
      (ctx.inbox?.new_inbound_count ?? 0) > 0,
    priority: 15,
  },

  // ════════════════════════════════════════════
  // DIALER
  // ════════════════════════════════════════════
  {
    id: "dialer-explain-queue",
    type: "suggestion",
    category: "explainer",
    title: "Call queue order",
    body: "Sorted by urgency and score. Overdue follow-ups appear first, then new high-score leads.",
    surfaces: ["dialer"],
    condition: () => true,
    priority: 100,
  },
  {
    id: "dialer-next-log",
    type: "recommended",
    category: "next_step",
    title: "Log the outcome",
    body: "Set a disposition and schedule the next action before moving to the next call. Unlogged calls create follow-up gaps.",
    surfaces: ["dialer"],
    condition: () => true,
    priority: 20,
  },

  // ════════════════════════════════════════════
  // IMPORT
  // ════════════════════════════════════════════
  {
    id: "import-explain-mapping",
    type: "recommended",
    category: "tip",
    title: "Column mapping",
    body: "Auto-matched columns are highlighted. Review any low-confidence matches and click to override. Required: at least one of phone, email, or address.",
    surfaces: ["import"],
    condition: (ctx) => ctx.importCtx?.step === "mapping",
    priority: 50,
  },
  {
    id: "import-explain-dupes",
    type: "recommended",
    category: "tip",
    title: "Duplicate handling",
    body: (ctx) => {
      const n = ctx.importCtx?.duplicate_count ?? 0;
      return `${n > 0 ? `${n} potential duplicates detected. ` : ""}"Skip" ignores rows matching existing leads. "Update missing" fills empty fields without overwriting.`;
    },
    surfaces: ["import"],
    condition: (ctx) =>
      ctx.importCtx?.step === "configure" ||
      ctx.importCtx?.step === "mapping",
    priority: 55,
  },

  // ════════════════════════════════════════════
  // BUYERS
  // ════════════════════════════════════════════
  {
    id: "buyers-explain-pof",
    type: "recommended",
    category: "tip",
    title: "Proof of funds matters",
    body: "Verify POF before assigning a deal. Unverified buyers create closing risk — ask for a bank statement, pre-approval letter, or proof of liquid funds.",
    surfaces: ["buyers"],
    condition: () => true,
    priority: 50,
  },
  {
    id: "buyers-explain-buybox",
    type: "suggestion",
    category: "explainer",
    title: "Buy-box = faster matching",
    body: "Fill in markets, asset types, strategy, and price range for each buyer. The Dispo page uses buy-box criteria to surface matching buyers when you link them to deals.",
    surfaces: ["buyers"],
    condition: () => true,
    priority: 100,
  },
  {
    id: "buyers-next-unverified",
    type: "recommended",
    category: "next_step",
    title: "Unverified buyers need POF",
    body: (ctx) =>
      `${ctx.buyersCtx?.unverified_pof_count ?? 0} buyer(s) have unverified proof of funds. Follow up to collect POF before assigning deals.`,
    surfaces: ["buyers"],
    condition: (ctx) => (ctx.buyersCtx?.unverified_pof_count ?? 0) > 0,
    priority: 15,
  },
  {
    id: "buyers-next-no-market",
    type: "suggestion",
    category: "next_step",
    title: "Buyers missing market info",
    body: (ctx) =>
      `${ctx.buyersCtx?.no_market_count ?? 0} buyer(s) have no markets set. Add markets so they appear in Dispo matching.`,
    surfaces: ["buyers"],
    condition: (ctx) => (ctx.buyersCtx?.no_market_count ?? 0) > 0,
    priority: 25,
  },

  // ════════════════════════════════════════════
  // DISPO
  // ════════════════════════════════════════════
  {
    id: "dispo-explain-flow",
    type: "suggestion",
    category: "explainer",
    title: "Dispo workflow",
    body: "Link buyers → Contact them → Track responses → Select the best buyer → Coordinate closing. The stalled deals panel flags anything stuck.",
    surfaces: ["dispo"],
    condition: () => true,
    priority: 100,
  },
  {
    id: "dispo-explain-prep",
    type: "recommended",
    category: "tip",
    title: "Complete dispo prep first",
    body: "Fill in asking price, rehab estimate, occupancy, and a quick pitch before contacting buyers. Buyers respond faster when you have the details ready.",
    surfaces: ["dispo"],
    condition: () => true,
    priority: 50,
  },
  {
    id: "dispo-next-no-buyers",
    type: "recommended",
    category: "next_step",
    title: "Deals need buyers linked",
    body: (ctx) =>
      `${ctx.dispoCtx?.no_buyers_linked_count ?? 0} deal(s) have no buyers linked. Open the deal and click 'Link Buyer' to start outreach.`,
    surfaces: ["dispo"],
    condition: (ctx) => (ctx.dispoCtx?.no_buyers_linked_count ?? 0) > 0,
    priority: 10,
  },
  {
    id: "dispo-next-stalled",
    type: "recommended",
    category: "next_step",
    title: "Stalled deals need attention",
    body: (ctx) =>
      `${ctx.dispoCtx?.stalled_count ?? 0} deal(s) are stalled. Check the 'Needs Attention' panel for specific issues.`,
    surfaces: ["dispo"],
    condition: (ctx) => (ctx.dispoCtx?.stalled_count ?? 0) > 0,
    priority: 5,
  },
  {
    id: "dispo-next-selection",
    type: "suggestion",
    category: "next_step",
    title: "Move toward selection",
    body: "No buyers are selected yet across your deals. Once a buyer is interested and terms work, select them to move toward closing.",
    surfaces: ["dispo"],
    condition: (ctx) =>
      (ctx.dispoCtx?.total_deals ?? 0) > 0 &&
      (ctx.dispoCtx?.selected_buyer_count ?? 0) === 0,
    priority: 20,
  },
];
