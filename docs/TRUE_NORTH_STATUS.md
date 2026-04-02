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
- Morning brief now includes founder work-log reminders when founders had meaningful call activity but low/no logged hours the prior day.
- Jeff quality tags now drive automated policy-tuning recommendations in the Jeff control center (over-transfer, weak opener, callback miss, tone/target drift).
- Jeff quality loop now shows policy-version impact (current vs prior pass-rate/score deltas) so policy edits are traceable to outcome movement.
- KPI summary now includes a lead-linked Jeff attribution funnel (appointments -> offers -> contracts -> closed) instead of only a single closed-deal influence number.
- Weekly scorecard + deep analytics now use the same lead-linked Jeff funnel model so operator, KPI, and notification surfaces stay aligned.

### Yellow (partially implemented, needs tightening)
- Inbound attention UX is materially improved but still needs periodic adversarial UX checks during real call volume windows.
- Founder work-log adoption/discipline still needs rollout so most windows stop falling back to call-time estimates (fallback is now explicitly flagged in scorecard + weekly health messaging).
- True-north scorecard is API/notification complete, but still needs dedicated analytics UI polish for fast weekly review.

### Red (not complete enough for the $2M operating target)
- Founder work-log capture exists but is not yet consistently used by operators, so some windows still rely on call-time fallback.

## Immediate build order (highest leverage first)
1. Keep pushing founder work-log operating discipline so founder-hour metrics default to logged effort in weekly reviews.
2. Add deeper analytics UX for weekly true-north review (faster exception triage and one-click drill-down into weak signals).
3. Close the quality loop by tracking policy-version changes against recommendation trends and outcome deltas.
4. Tighten founder adoption nudges (daily prompts + missed-log reminders already live) so estimated-hour fallback keeps dropping week over week.

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
