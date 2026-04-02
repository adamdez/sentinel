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
- Weekly founder true-north scorecard now exists (rolling week vs prior week) with contracts/revenue per founder-hour, Jeff influence, and exception callouts.
- Weekly health cron now includes the true-north scorecard summary so deltas are pushed into ops review.
- Explicit founder work-log model is now added (schema + APIs + scorecard integration) and used as primary founder-hour source when logs exist.

### Yellow (partially implemented, needs tightening)
- Inbound attention UX is materially improved but still needs periodic adversarial UX checks during real call volume windows.
- Jeff quality loop exists, but quality tags are not yet tied to automated policy-tuning recommendations.
- Founder work-log adoption/discipline still needs rollout so most windows stop falling back to call-time estimates.
- True-north scorecard is API/notification complete, but still needs dedicated analytics UI polish for fast weekly review.

### Red (not complete enough for the $2M operating target)
- No explicit founder work-log capture yet (still call-effort proxy).

## Immediate build order (highest leverage first)
1. Upgrade founder-hour estimation from call-effort proxy to explicit founder work-log windows.
2. Tighten Jeff outcome attribution from interaction -> appointment -> offer -> contract so it is fully lead-linked, not inference-only.
3. Add analytics page widgets for the weekly true-north scorecard and exception triage.
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
- Weekly true-north scorecard service: `src/lib/weekly-scorecard.ts`
- Weekly true-north scorecard API: `src/app/api/analytics/weekly-scorecard/route.ts`
- Weekly health scorecard push: `src/app/api/cron/weekly-health/route.ts`, `src/lib/notify.ts`
