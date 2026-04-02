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
- Contracts-per-founder-hour (estimated) is now surfaced in analytics and KPI summaries using closed deals plus founder call effort.

### Yellow (partially implemented, needs tightening)
- Inbound attention UX is materially improved but still needs periodic adversarial UX checks during real call volume windows.
- Jeff quality loop exists, but quality tags are not yet tied to automated policy-tuning recommendations.
- Founder-hour leverage is currently an estimate based on call duration + wrap-time, not a full founder work-log model.

### Red (not complete enough for the $2M operating target)
- No strict weekly operator scorecard that ties Jeff outputs directly to appointments, offers, contracts, and realized revenue.

## Immediate build order (highest leverage first)
1. Upgrade founder-hour estimation from call-effort proxy to explicit founder work-log windows.
2. Add Jeff outcome attribution from interaction -> appointment -> offer -> contract to quantify Jeff-influenced revenue.
3. Add a weekly auto-generated operator scorecard (Adam/Logan) with delta vs prior week and exception callouts.
4. Add policy tuning suggestions from quality reviews (for example: over-transfer, weak-labeling, callback-miss trends).

## Evidence pointers
- Jeff KPI computation: `src/lib/jeff-control.ts`
- Jeff control center UI: `src/app/(sentinel)/settings/jeff-outbound/page.tsx`
- Jeff KPI tests: `src/lib/__tests__/jeff-control.test.ts`
- Source attribution API: `src/app/api/dashboard/source-attribution/route.ts`
- Founder-hour analytics helpers: `src/lib/analytics-helpers.ts`
- Founder-hour rollup service: `src/lib/analytics.ts`
- Founder-hour KPI endpoint: `src/app/api/analytics/kpi-summary/route.ts`
- Founder-hour UI surfaces: `src/app/(sentinel)/analytics/page.tsx`, `src/components/sentinel/kpi-summary-row.tsx`
