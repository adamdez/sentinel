# Sentinel Coach Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a context-aware workflow coach sidebar panel that helps operators understand what they're looking at, what to do next, and why actions are blocked — across Lead Detail, Pipeline, Inbox, Dialer, and Import surfaces.

**Architecture:** Central CoachProvider React context wrapping the app. Pure `evaluateCoach()` engine function computes relevant coach items from surface + lead state. Shared CoachPanel component renders a collapsible right sidebar with blockers, next steps, and explainers. Content lives in a single `coach-content.ts` module.

**Tech Stack:** React Context, TypeScript, Tailwind CSS (glass morphism), Framer Motion (slide animation), lucide-react icons, existing shadcn/Radix UI primitives.

---

## Task 1: Coach Types & Engine (Pure Logic)

**Files:**
- Create: `src/lib/coach-types.ts`
- Create: `src/lib/coach-engine.ts`

**Step 1: Create coach type definitions**

Create `src/lib/coach-types.ts`:

```typescript
// Coach surface identifiers — one per CRM page/context
export type CoachSurface =
  | "lead_detail"
  | "lead_detail_closeout"
  | "pipeline"
  | "leads_inbox"
  | "dialer"
  | "import";

// Content classification — always shown to operator
export type CoachItemType = "hard_rule" | "recommended" | "suggestion";

// Functional category — determines which panel section shows the item
export type CoachCategory = "blocker" | "next_step" | "explainer" | "tip";

// Context passed by each surface to the coach engine
export type CoachContext = {
  surface: CoachSurface;
  lead?: {
    id?: string;
    status?: string;
    qualification_route?: string;
    assigned_to?: string;
    calls_count: number;
    next_action_at?: string;
    last_contact_at?: string;
    qualification_completeness: number; // 0.0 – 1.0
    offer_amount?: number;
    has_note_context: boolean;
    has_disposition?: boolean;
    address?: string;
  };
  pipeline?: {
    dragTarget?: string;
    dragBlocked?: boolean;
    dragBlockReason?: string;
  };
  inbox?: {
    overdue_count: number;
    new_inbound_count: number;
    unqualified_count: number;
    escalated_count: number;
  };
  closeout?: {
    action_type?: string;
    has_date: boolean;
    has_disposition: boolean;
    has_note: boolean;
  };
  importCtx?: {
    step: string;
    low_confidence_count: number;
    duplicate_count: number;
  };
};

// A single coach content item
export type CoachItem = {
  id: string;
  type: CoachItemType;
  category: CoachCategory;
  title: string;
  body: string | ((ctx: CoachContext) => string); // static or dynamic text
  surfaces: CoachSurface[];
  condition: (ctx: CoachContext) => boolean;
  priority: number; // lower = more important, shown first
};

// Output from the coach engine
export type CoachOutput = {
  blockers: CoachItem[];
  nextSteps: CoachItem[];
  explainers: CoachItem[];
  tips: CoachItem[];
};
```

**Step 2: Create coach engine (pure function)**

Create `src/lib/coach-engine.ts`:

```typescript
import type { CoachContext, CoachItem, CoachOutput, CoachSurface } from "./coach-types";
import { COACH_ITEMS } from "./coach-content";

/**
 * Evaluate all coach items against the current surface + context.
 * Pure function — no side effects, no API calls.
 * Target: < 1ms execution time.
 */
export function evaluateCoach(
  surface: CoachSurface,
  context: CoachContext
): CoachOutput {
  const ctx = { ...context, surface };

  const applicable = COACH_ITEMS.filter(
    (item) => item.surfaces.includes(surface) && item.condition(ctx)
  );

  const sorted = applicable.sort((a, b) => a.priority - b.priority);

  return {
    blockers: sorted.filter((i) => i.category === "blocker"),
    nextSteps: sorted.filter((i) => i.category === "next_step"),
    explainers: sorted.filter((i) => i.category === "explainer"),
    tips: sorted.filter((i) => i.category === "tip"),
  };
}

/** Resolve dynamic body text */
export function resolveBody(item: CoachItem, ctx: CoachContext): string {
  return typeof item.body === "function" ? item.body(ctx) : item.body;
}
```

**Step 3: Commit**

```bash
git add src/lib/coach-types.ts src/lib/coach-engine.ts
git commit -m "feat(coach): add type definitions and pure evaluation engine"
```

---

## Task 2: Coach Content (All 31 Items)

**Files:**
- Create: `src/lib/coach-content.ts`

**Step 1: Create the content module**

Create `src/lib/coach-content.ts` with all 31 coach items. This is the single source of truth for all coach text. To update the coach, edit this file.

```typescript
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
  staging: "Staging — being enriched by the system. Will auto-promote to Prospect.",
  prospect: "Prospect — awaiting first contact. Call this seller.",
  lead: "Lead — active seller conversation. Keep qualifying and moving toward an offer.",
  negotiation: "Negotiation — under active offer discussion. Work toward agreement.",
  disposition: "Disposition — post-negotiation logistics. Coordinate closing.",
  nurture: "Nurture — scheduled re-engagement. Follow up on the date you set.",
  dead: "Dead — disqualified or opted out. Can be revived to Nurture if circumstances change.",
  closed: "Closed — terminal. Deal completed or permanently resolved. Hidden from daily inbox.",
};

// ── Helper: route label ──
const ROUTE_LABELS: Record<string, string> = {
  offer_ready: "Offer Ready — qualification supports making an offer. Pull comps, run your numbers, and prep the offer.",
  follow_up: "Follow Up — callback scheduled. Call back on the date you set and continue qualifying.",
  nurture: "Nurture — back-burner lead. Check in periodically but don't prioritize daily.",
  dead: "Dead — disqualified. Seller not motivated, property doesn't fit, or opted out.",
  escalate: "Escalate — flagged for Adam's review. You still own the lead. Adam will review and may adjust the route.",
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
      ctx.lead?.status === "prospect" || ctx.lead?.status === "lead"
        ? !ctx.lead?.assigned_to
        : false,
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
      if (!d) return "You have an overdue follow-up. Call or update the next action.";
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
    body: (ctx) =>
      STAGE_LABELS[ctx.lead?.status ?? ""] ?? "Unknown stage.",
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
      ctx.lead?.status === "negotiation" || ctx.lead?.status === "disposition",
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
    condition: () => true, // always relevant on dialer
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
      ctx.importCtx?.step === "configure" || ctx.importCtx?.step === "mapping",
    priority: 55,
  },
];
```

**Step 2: Commit**

```bash
git add src/lib/coach-content.ts
git commit -m "feat(coach): add all 31 coach content items"
```

---

## Task 3: Coach React Context Provider

**Files:**
- Create: `src/providers/coach-provider.tsx`
- Modify: `src/providers/providers.tsx` (line ~18, add CoachProvider wrapper)

**Step 1: Create CoachProvider**

Create `src/providers/coach-provider.tsx`:

```typescript
"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CoachContext, CoachOutput, CoachSurface } from "@/lib/coach-types";
import { evaluateCoach } from "@/lib/coach-engine";

type CoachProviderState = {
  panelOpen: boolean;
  togglePanel: () => void;
  surface: CoachSurface;
  setSurface: (s: CoachSurface) => void;
  context: CoachContext;
  setContext: (ctx: CoachContext) => void;
  output: CoachOutput;
};

const EMPTY_OUTPUT: CoachOutput = {
  blockers: [],
  nextSteps: [],
  explainers: [],
  tips: [],
};

const CoachCtx = createContext<CoachProviderState>({
  panelOpen: false,
  togglePanel: () => {},
  surface: "lead_detail",
  setSurface: () => {},
  context: { surface: "lead_detail" },
  setContext: () => {},
  output: EMPTY_OUTPUT,
});

export function CoachProvider({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sentinel-coach-open") === "true";
  });
  const [surface, setSurface] = useState<CoachSurface>("lead_detail");
  const [context, setContext] = useState<CoachContext>({ surface: "lead_detail" });

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem("sentinel-coach-open", String(next));
      return next;
    });
  }, []);

  const output = useMemo(
    () => evaluateCoach(surface, context),
    [surface, context]
  );

  return (
    <CoachCtx.Provider
      value={{ panelOpen, togglePanel, surface, setSurface, context, setContext, output }}
    >
      {children}
    </CoachCtx.Provider>
  );
}

export function useCoach() {
  return useContext(CoachCtx);
}

/**
 * Hook for surfaces to push their context into the coach.
 * Call this in each surface component to register what the operator is looking at.
 */
export function useCoachSurface(surface: CoachSurface, context: Partial<CoachContext>) {
  const { setSurface, setContext } = useCoach();

  useEffect(() => {
    setSurface(surface);
    setContext({ ...context, surface });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, JSON.stringify(context)]);
}
```

**Step 2: Wire into providers**

Modify `src/providers/providers.tsx` — add `CoachProvider` wrapping children inside the existing provider stack. Import at top, wrap after `ModalProvider`:

```typescript
import { CoachProvider } from "./coach-provider";
```

Inside the JSX, wrap `{children}` with `<CoachProvider>`:

```tsx
<CoachProvider>
  {children}
</CoachProvider>
```

**Step 3: Commit**

```bash
git add src/providers/coach-provider.tsx src/providers/providers.tsx
git commit -m "feat(coach): add CoachProvider context and useCoach hooks"
```

---

## Task 4: CoachPanel UI Component

**Files:**
- Create: `src/components/sentinel/coach-panel.tsx`

**Step 1: Build the panel component**

Create `src/components/sentinel/coach-panel.tsx`:

This component renders the collapsible right sidebar. It reads from `useCoach()` and displays blockers, next steps, explainers, and tips in distinct sections.

Key UI details:
- Glass morphism background matching existing Sentinel aesthetic (`bg-black/40 backdrop-blur-xl border-white/[0.08]`)
- Framer Motion `AnimatePresence` for slide-in/out
- `lucide-react` icons: `HelpCircle` for toggle, `ShieldAlert` for blockers, `Lightbulb` for recommended, `ClipboardList` for suggestions, `X` for close
- Type badges: colored pills showing "Rule", "Recommended", "Suggestion"
- `resolveBody()` for dynamic text
- Escape key handler to close
- "Ask Sentinel" disabled input at bottom

Width: 280px expanded. Toggle button: fixed 36px circle.

The component should export both `CoachPanel` (the sidebar) and `CoachToggle` (the floating ? button).

**Step 2: Commit**

```bash
git add src/components/sentinel/coach-panel.tsx
git commit -m "feat(coach): add CoachPanel sidebar UI component"
```

---

## Task 5: Integrate Coach into Lead Detail Modal

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx`

**Step 1: Add useCoachSurface hook call**

Near the top of `MasterClientFileModal` function body (after existing state declarations around line ~6100), add:

```typescript
import { useCoachSurface } from "@/providers/coach-provider";
```

Call the hook with lead context derived from `clientFile`:

```typescript
useCoachSurface(
  closeoutOpen ? "lead_detail_closeout" : "lead_detail",
  {
    lead: clientFile ? {
      id: clientFile.id,
      status: clientFile.status,
      qualification_route: clientFile.qualificationRoute,
      assigned_to: clientFile.assignedTo,
      calls_count: /* derive from calls data or clientFile */,
      next_action_at: clientFile.nextActionAt,
      last_contact_at: clientFile.lastContactAt,
      qualification_completeness: /* compute from qualification fields */,
      offer_amount: clientFile.offerAmount,
      has_note_context: !!(clientFile.notes?.length),
      has_disposition: !!clientFile.dispositionCode,
      address: clientFile.address,
    } : undefined,
    closeout: closeoutOpen ? {
      action_type: closeoutAction,
      has_date: !!closeoutAt,
      has_disposition: closeoutOutcome !== "" && closeoutOutcome !== "no_change",
      has_note: !!closeoutNote?.trim(),
    } : undefined,
  }
);
```

**Step 2: Add CoachPanel and CoachToggle to the modal render**

Inside the modal's main container div (around line 7677), add `CoachPanel` as a sibling to the main content flex:

```tsx
<div className="flex">
  {/* existing modal content */}
  <div className="flex-1 overflow-hidden rounded-[16px] ...">
    {/* ... existing header, tabs, content ... */}
  </div>
  {/* Coach sidebar */}
  <CoachPanel />
</div>
```

And add `CoachToggle` near the modal's close button area.

**Step 3: Compute qualification_completeness**

Add a small helper to count how many of the 5 qualification fields are filled (motivation, timeline, condition, decision_maker, price_expectation). Return count/5.

**Step 4: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx
git commit -m "feat(coach): integrate coach panel into Lead Detail modal"
```

---

## Task 6: Integrate Coach into Pipeline Page

**Files:**
- Modify: `src/app/(sentinel)/pipeline/page.tsx`

**Step 1: Add useCoachSurface hook**

In the `PipelinePage` component, add:

```typescript
useCoachSurface("pipeline", {
  pipeline: {
    dragTarget: undefined,
    dragBlocked: false,
    dragBlockReason: undefined,
  },
});
```

Update the pipeline context when a drag is blocked (inside the `onDragEnd` handler where precheck fails).

**Step 2: Add CoachPanel + CoachToggle to the page layout**

Place `CoachPanel` as a sibling to the kanban container inside the flex layout.

**Step 3: Commit**

```bash
git add src/app/(sentinel)/pipeline/page.tsx
git commit -m "feat(coach): integrate coach panel into Pipeline page"
```

---

## Task 7: Integrate Coach into Leads Inbox

**Files:**
- Modify: `src/app/(sentinel)/leads/page.tsx`

**Step 1: Add useCoachSurface hook**

```typescript
useCoachSurface("leads_inbox", {
  inbox: {
    overdue_count: /* derive from segment counts or lead data */,
    new_inbound_count: /* derive from attention focus counts */,
    unqualified_count: /* derive from needs-qualification count */,
    escalated_count: /* derive from escalated review count */,
  },
});
```

**Step 2: Add CoachPanel + CoachToggle**

Place in the PageShell layout.

**Step 3: Commit**

```bash
git add src/app/(sentinel)/leads/page.tsx
git commit -m "feat(coach): integrate coach panel into Leads Inbox"
```

---

## Task 8: Integrate Coach into Dialer and Import

**Files:**
- Modify: `src/app/(sentinel)/dialer/page.tsx`
- Modify: `src/app/(sentinel)/admin/import/page.tsx`

**Step 1: Dialer — add useCoachSurface**

```typescript
useCoachSurface("dialer", {});
```

Add CoachPanel + CoachToggle to the dialer page layout.

**Step 2: Import — add useCoachSurface**

```typescript
useCoachSurface("import", {
  importCtx: {
    step,
    low_confidence_count: /* from preview state */,
    duplicate_count: /* from preview state */,
  },
});
```

Add CoachPanel + CoachToggle to the import page layout.

**Step 3: Commit**

```bash
git add src/app/(sentinel)/dialer/page.tsx src/app/(sentinel)/admin/import/page.tsx
git commit -m "feat(coach): integrate coach panel into Dialer and Import pages"
```

---

## Task 9: Final QA and Polish

**Step 1: Visual QA in browser**

Test each surface:
1. Open Lead Detail for an unassigned prospect with 0 calls → verify "Call this seller" next step and "Assignment required" blocker appear
2. Open Lead Detail for a lead with 3+ calls and incomplete qualification → verify "Finish qualification" appears
3. Open closeout panel → verify closeout tips appear, "Follow-up date required" blocker shows when action=follow_up but no date
4. Open Pipeline → verify "My Leads is a filter" explainer
5. Open Leads Inbox → verify segment explainer and overdue priority
6. Open Dialer → verify queue explainer
7. Open Import → verify mapping tips on mapping step

**Step 2: Test panel persistence**

1. Open coach panel → refresh page → verify panel stays open
2. Close coach panel → navigate to different page → verify panel stays closed

**Step 3: Test responsive**

1. Resize to <768px → verify panel becomes bottom sheet (or degrades gracefully)

**Step 4: Performance check**

1. Open Lead Detail → verify no perceptible load delay from coach engine

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(coach): QA polish and responsive adjustments"
```

---

## Task 10: Deploy

**Step 1: Push to main**

```bash
git push origin main
```

Vercel auto-deploys from main.

**Step 2: Verify production**

Check the deployed site — open Lead Detail, verify coach panel renders and shows correct content.
