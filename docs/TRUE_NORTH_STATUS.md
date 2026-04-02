# Sentinel True North Status

Last updated: 2026-04-02

## Main goal
Build a two-founder operating machine that can reach about $2,000,000/year by increasing contracts per founder-hour, not by adding low-leverage activity.

## Current status vs true north

### Green (implemented and live-wired)
- Manual Jeff control center with hard start/pause/halt controls and lane governance.
- Jeff queue + interaction + task linkage model with idempotent call-memory handling.
- Cost and outcome KPI calculation for Jeff now includes qualified conversations, appointment/offer/contract signals, and cost per qualified conversation.
- Source-attribution API exists with cost-per-contract-first ranking.

### Yellow (partially implemented, needs tightening)
- Inbound attention UX is materially improved but still needs periodic adversarial UX checks during real call volume windows.
- Jeff quality loop exists, but quality tags are not yet tied to automated policy-tuning recommendations.
- Revenue attribution is present in parts of the funnel but not yet unified into one operator-facing "contracts per founder-hour" surface.

### Red (not complete enough for the $2M operating target)
- No single canonical contracts-per-founder-hour metric panel that combines contract outcomes and founder time inputs.
- No strict weekly operator scorecard that ties Jeff outputs directly to appointments, offers, contracts, and realized revenue.

## Immediate build order (highest leverage first)
1. Add a contracts-per-founder-hour service and dashboard tile fed by closed deals plus tracked founder activity windows.
2. Add Jeff outcome attribution from interaction -> appointment -> offer -> contract to quantify Jeff-influenced revenue.
3. Add a weekly auto-generated operator scorecard (Adam/Logan) with delta vs prior week and exception callouts.
4. Add policy tuning suggestions from quality reviews (for example: over-transfer, weak-labeling, callback-miss trends).

## Evidence pointers
- Jeff KPI computation: `src/lib/jeff-control.ts`
- Jeff control center UI: `src/app/(sentinel)/settings/jeff-outbound/page.tsx`
- Jeff KPI tests: `src/lib/__tests__/jeff-control.test.ts`
- Source attribution API: `src/app/api/dashboard/source-attribution/route.ts`
