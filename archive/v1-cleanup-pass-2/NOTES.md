# Dominion v1 Cleanup Pass 2

## Part 1 (archive-only, low-risk non-v1 pages)
Archived route pages that are no longer in the visible Dominion v1 operator nav and had no required route links from current shell nav:
- src/app/(sentinel)/discovery/page.tsx
- src/app/(sentinel)/docusign/page.tsx
- src/app/(sentinel)/my-calendar/page.tsx
- src/app/(sentinel)/team-calendar/page.tsx
- src/app/(sentinel)/sales-funnel/ppl/page.tsx
- src/app/(sentinel)/sales-funnel/leads/page.tsx
- src/app/(sentinel)/sales-funnel/leads/my-leads/page.tsx

These were moved (not deleted) to `archive/v1-cleanup-pass-2/part1/...`.

## Part 2 (misplaced UI route under /api)
Archived:
- src/app/api/dialer/page.tsx

Why safe:
- This file defined a UI page route (`/api/dialer`) and not a real API endpoint.
- Active dialer flows call `/api/dialer/call`, `/api/dialer/call-status`, `/api/dialer/sms`, `/api/dialer/summarize`, and `/api/dialer/test`.
- No direct `/api/dialer` route usage was required for Twilio/call/SMS callback flows.

Moved to `archive/v1-cleanup-pass-2/part2/...`.