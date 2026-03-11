# Sentinel Coach — Phase 4C Design

**Date:** 2026-03-11
**Status:** Approved
**Author:** Adam + Claude

---

## Mission

Build a context-aware workflow coach inside the Sentinel CRM that helps operators understand what they are looking at, what to do next, why something is blocked, and what a feature/status/route means.

This is NOT a generic chatbot or documentation center. It is a deterministic, context-driven guidance system embedded in the operator's daily workflow.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UX pattern | Collapsible right sidebar panel | Visible while working, small footprint when collapsed |
| Surface scope | All major surfaces (Lead Detail, Pipeline, Inbox, Dialer, Import) | Operators need guidance everywhere |
| Content source | Code-defined TypeScript module | Version-controlled, exact, no infra overhead |
| AI approach | Layered — deterministic rules now, conversational AI later | Rules are free/instant/exact; AI adds value only for open-ended questions |
| Architecture | Central CoachProvider + pure engine + shared panel | Testable, maintainable, AI-ready foundation |

---

## Architecture

### Components

```
CoachProvider (React Context)
├── Holds: panelOpen, currentSurface, currentContext
├── Methods: setSurface(), setContext(), togglePanel()
│
├── coach-engine.ts (pure function)
│   └── evaluateCoach(surface, context) → CoachOutput
│
├── coach-content.ts (data)
│   └── COACH_ITEMS: CoachItem[] (~31 items for v1)
│
└── CoachPanel (UI component)
    ├── Header (surface name + lead address)
    ├── Blockers section (red/amber, only if present)
    ├── Next Steps section (prioritized guidance)
    ├── About This Surface (collapsible explainers)
    └── Ask Sentinel placeholder (disabled input, "coming soon")
```

### Data Flow

1. Surface component calls `useCoach(surface, context)` hook
2. Hook pushes context to CoachProvider
3. CoachProvider runs `evaluateCoach()` whenever context changes
4. CoachPanel reads output from provider and renders sections

### Types

```typescript
type CoachSurface =
  | "lead_detail"
  | "lead_detail_closeout"
  | "pipeline"
  | "leads_inbox"
  | "dialer"
  | "import";

type CoachItemType = "hard_rule" | "recommended" | "suggestion";
type CoachCategory = "blocker" | "next_step" | "explainer" | "tip";

type CoachItem = {
  id: string;
  type: CoachItemType;
  category: CoachCategory;
  title: string;
  body: string;
  surfaces: CoachSurface[];
  condition: (ctx: CoachContext) => boolean;
  priority: number; // lower = more important
};

type CoachContext = {
  surface: CoachSurface;
  lead?: {
    status: string;
    qualification_route?: string;
    assigned_to?: string;
    calls_count: number;
    next_action_at?: string;
    last_contact_at?: string;
    qualification_completeness: number; // 0-1
    offer_amount?: number;
    distress_flags?: string[];
    has_note_context: boolean;
  };
  pipeline?: {
    dragSource?: string;
    dragTarget?: string;
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
  import?: {
    step: string;
    low_confidence_count: number;
    duplicate_count: number;
  };
};

type CoachOutput = {
  blockers: CoachItem[];
  nextSteps: CoachItem[];
  explainers: CoachItem[];
  tips: CoachItem[];
};
```

---

## Panel UI Spec

### States

- **Collapsed:** Fixed `?` icon button (bottom-right corner of surface)
- **Expanded:** 280px right sidebar panel, slides in
- **Persistence:** open/close state in localStorage (`sentinel-coach-open`)

### Sections (top to bottom)

1. **Header** — Surface name + lead identifier (if applicable). Close button.
2. **Blockers** — Red/amber cards. Only shown when blockers exist. Icon: 🔒
3. **Next Steps** — Blue/green cards. 1-3 prioritized. Each labeled with type badge.
4. **About This** — Collapsible section. Gray cards with definitions of current stage/route/surface.
5. **Ask Sentinel** — Disabled text input. "Coming soon" label. Future AI placeholder.

### Visual Rules

- Muted background (slate-50)
- Bold titles, 1-2 sentence bodies
- Color: red/amber = blockers, blue = suggestions, green = recommended, gray = explainers
- No animations beyond slide-in transition
- Close on X button or Escape key

### Responsive

- In modal (Lead Detail): panel overlays inside modal right edge
- On full pages: fixed right sidebar
- Under 768px width: bottom slide-up sheet

---

## V1 Content (31 items)

### Lead Detail (17 items)

**Blockers (5):**
- ld-block-assign-negotiate: Assignment required for Negotiation
- ld-block-assign-escalate: Assignment required for Escalation
- ld-block-nurture-no-action: Next action required for Nurture
- ld-block-dead-no-reason: Dead reason required
- ld-block-lock-conflict: Another operator updated this lead

**Next Steps (6):**
- ld-next-first-call: No contact yet — call the seller
- ld-next-qualify: Contact made — finish qualification
- ld-next-set-route: Qualification done — set a route
- ld-next-prep-offer: Route=offer_ready — prep an offer
- ld-next-overdue: Follow-up past due
- ld-next-no-action: Active lead with no next action

**Explainers (6):**
- ld-explain-stage: Dynamic stage definition
- ld-explain-route: Dynamic route definition
- ld-explain-escalate: Escalation workflow explanation
- ld-explain-closed: Terminal stage explanation
- ld-explain-my-leads: "My Leads" is assignment, not stage
- ld-explain-disposition-path: Disposition requires Negotiation first

### Call Closeout (6 items)

- close-explain-presets: Presets vs manual dates
- close-explain-outcome: Outcome vs Route distinction
- close-block-no-date: Follow-up date required
- close-explain-escalate: Escalation review workflow
- close-next-note: Encourage closeout notes
- close-explain-last-contact: What counts as contact

### Pipeline (3 items)

- pipe-explain-my-leads: "My Leads" is a filter
- pipe-block-drag: Dynamic drag-blocked explanation
- pipe-explain-drag: Stage change confirmation

### Leads Inbox (3 items)

- inbox-explain-segments: Segment definitions
- inbox-next-priority: Overdue leads first
- inbox-next-new: New inbound speed-to-lead

### Dialer (2 items)

- dialer-explain-queue: Queue sort order
- dialer-next-log: Log outcomes promptly

### Import (2 items)

- import-explain-mapping: Column mapping guidance
- import-explain-dupes: Duplicate handling options

---

## Content Labels

Every coach item displays its type visually:

| Type | Badge | Color |
|------|-------|-------|
| hard_rule | 🔒 Rule | Red/amber |
| recommended | 💡 Recommended | Blue |
| suggestion | 📋 Suggestion | Gray-blue |

---

## Future: Layer 3 — Conversational AI

The panel architecture is designed so a future "Ask Sentinel" feature slots in naturally:

1. The `CoachContext` object becomes the prompt context for Claude/Grok
2. The disabled input at panel bottom becomes active
3. Operator types a question → context + question → AI response
4. AI responses are labeled distinctly from deterministic coach content

**Not built in Phase 4C.** This is a Phase 5+ enhancement.

---

## QA Checklist

1. [ ] Coach panel opens/closes on Lead Detail modal
2. [ ] Panel state persists across page navigation (localStorage)
3. [ ] Blockers show when prerequisites are missing (test: unassigned lead → Negotiation)
4. [ ] Blockers disappear when prerequisites are met (assign lead → blocker gone)
5. [ ] Next steps update when lead state changes (log a call → "finish qualification" appears)
6. [ ] Explainers show correct stage/route definitions
7. [ ] Pipeline "My Leads" explainer always visible
8. [ ] Call Closeout tips appear when closeout panel opens
9. [ ] Import mapping tips appear on mapping step
10. [ ] Panel renders correctly on Leads Inbox, Dialer pages
11. [ ] Coach items labeled with correct type badges
12. [ ] Panel responsive: sidebar on desktop, bottom sheet on mobile
13. [ ] Escape key closes panel
14. [ ] No performance impact on Lead Detail load time (coach eval < 5ms)

---

## Deferred

- Conversational "Ask Sentinel" AI assistant (Phase 5+)
- Coach content admin UI (edit tips without deploy)
- Coach analytics (which tips operators interact with most)
- Operator-specific coaching (different tips based on experience level)
- Coach notifications/proactive popups (show blocker before operator attempts action)
