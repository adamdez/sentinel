# Workflow Rules - Dominion v1

## Purpose
This file is the canonical workflow authority for Dominion v1 inside Sentinel.
It documents workflow behavior that is already implemented (or explicitly marked as provisional).

Use this file for:
- stage/status semantics
- assignment semantics
- qualification routing semantics
- guarded mutation expectations
- follow-up discipline

If this file conflicts with implementation, implementation wins until this file is updated.

## Canonical semantics
- `status` = workflow position.
- `assigned_to` = current owner/operator.
- `My Leads` = UI filter segment by `assigned_to`, not a stage.
- In Pipeline UI, `My Leads` is represented as assignment lane/segment `mine` (non-status).
- Legacy `my_lead` / `my_leads` / `my_lead_status` values are read-compatibility aliases only and must normalize to canonical stage `lead`.
- `qualification_route` = routing intent used to guide stage/task behavior, not a stage.
- offer progress in UI is derived visibility, not a backend source-of-truth offer state model.

## Stage meanings
- `staging`: enrichment reservoir, not operator queue.
- `prospect`: candidate record, not yet in active acquisitions handling.
- `lead`: active acquisitions lead requiring qualification/follow-up discipline.
- `negotiation`: active offer/number discussion stage.
- `disposition`: post-negotiation decision window (seller review / close path).
- `nurture`: valid lead, not dead, but not immediate close path.
- `dead`: disqualified/unworkable for now; can be reactivated to `nurture`.
- `closed`: terminal closed outcome.

## Allowed stage transitions
Guardrails are enforced by `src/lib/lead-guardrails.ts`:

- `staging` -> `prospect`, `dead`
- `prospect` -> `lead`, `negotiation`, `nurture`, `dead`
- `lead` -> `negotiation`, `nurture`, `dead`
- `negotiation` -> `disposition`, `nurture`, `dead`
- `disposition` -> `closed`, `nurture`, `dead`
- `nurture` -> `lead`, `dead`
- `dead` -> `nurture`
- `closed` -> (no outbound transitions)

Human override is acceptable only through guarded server mutation paths, never by bypassing transition guardrails.

## Minimal stage-entry prerequisites
`PATCH /api/prospects` enforces the following minimums (422 on failure):

- Enter `negotiation`:
  - must have `assigned_to` (owner assignment)
  - must have contact evidence (`last_contact_at`, or call activity, or disposition signal)

- Enter `nurture`:
  - must have next follow-up/callback date (`next_call_scheduled_at` or `next_follow_up_at`)
  - must have context (qualification route, disposition signal, or note context)

- Enter `dead`:
  - must have dead-path reason signal (qualification route `dead`, dead-like disposition, or note context)
  - active callback/follow-up timers are cleared on dead entry

- Enter `disposition`:
  - must come from `negotiation` context
  - must have next decision follow-up date (`next_call_scheduled_at` or `next_follow_up_at`)

## Qualification route meaning and behavior
`qualification_route` values:
- `offer_ready`
- `follow_up`
- `nurture`
- `dead`
- `escalate`

When route changes are submitted through `PATCH /api/prospects`, behavior is:

- `offer_ready`:
  - if current stage is `lead`, target stage becomes `negotiation`
  - requires assigned owner and basic contact context
  - creates task: `Run comps + prepare offer range` (due now)
  - sets `next_follow_up_at` to a short offer-prep check-in anchor (default +1 day) unless explicitly provided

- `follow_up`:
  - creates task: `Follow-up call` (due in 3 days)
  - sets `next_follow_up_at` to that due date

- `nurture`:
  - if current stage is `lead`, target stage becomes `nurture`
  - creates task: `Nurture check-in` (due in 14 days)
  - sets `next_follow_up_at` to that due date

- `dead`:
  - if current stage is `lead`, target stage becomes `dead`
  - no qualification task is created

- `escalate`:
  - requires an assigned owner (`assigned_to`) before routing
  - creates task: `Escalation review requested` (due now)
  - task notes explicitly mark escalation as review-only
  - does not auto-reassign ownership by default

Task creation is blocking in this flow (failure returns error) to avoid misleading partial state.

## Next action and follow-up discipline
- Active leads should carry a clear next step through `next_call_scheduled_at` and/or `next_follow_up_at`.
- Moving into `nurture` or `disposition` requires a future decision/follow-up anchor.
- `dead` leads should not retain active next-call/follow-up timers.
- Operators should treat missing next action on active leads as workflow risk.

Leads inbox attention states currently implemented:
- Needs Qualification:
  - `status === "lead"`
  - `qualification_route` is null
  - lead age from `promoted_at` is greater than 48 hours

- Needs Follow-Up:
  - `status` is not `dead`/`closed`
  - next-action date (current workflow field precedence) is in the past

## Ownership and escalation principles
- Assignment is explicit ownership (`assigned_to`), not stage.
- Claim/assign actions update claim metadata and owner.
- Reassignment should be intentional and logged through guarded mutation paths.
- Escalation indicates review urgency; it should not silently rewrite ownership.
- Dialer sequence no-live-answer routing may clear assignment and move to `nurture` via guarded mutation flow.

## Offer-progress truth boundary
Current offer progress UI is derived from existing workflow signals (`status` + `qualification_route`) for visibility only.
It is not a dedicated backend offer-state model and must not be treated as authoritative deal truth.

## Guarded-write expectations
Workflow-significant lead mutations must use guarded server routes (primarily `PATCH /api/prospects`) to preserve:
- authenticated user context from server-side session/token
- transition validation
- optimistic lock/version conflict handling
- compliance gating where applicable
- event/audit logging
- stage transition snapshot compatibility

Avoid direct client-side writes for:
- stage/status changes
- assignment changes
- follow-up scheduling fields
- qualification routing fields

Dialer call-counter updates may occur in dialer API handlers, but workflow-significant status/assignment mutations must still go through guarded prospects mutation flow.

## Provisional/derived behavior notes
- Contact evidence is currently proxy-based (`last_contact_at`, call count, disposition), not a full first-response event model.
- Dead/nurture reason checks accept note/disposition context; quality depends on operator input quality.
- Offer progress remains derived/proxy visibility until a dedicated persisted offer-state model exists.

## Operator principles
- No lead gets lost.
- Every active lead should have either an offer path or a scheduled follow-up path.
- Keep stage semantics and ownership semantics separate and clear.
- Preserve Spokane vs Kootenai and source visibility in operational decisions.
- Keep workflow lean, practical, and acquisitions-focused.
