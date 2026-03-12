# Phase 5C: Dispositions Reporting + Buyer Performance + Assignment-Cycle Visibility

## Design Document

**Date:** 2026-03-11
**Approach:** Honest Minimalist — compact text/number displays, no charts, no new pages

---

## 1. Database Changes

**One new column on `deals` table:**
- `entered_dispo_at` (timestamptz, nullable) — set when lead status changes to `disposition`

No new tables. No audit log. No charting libraries.

---

## 2. New API Endpoints

### `GET /api/dispo/stats`
Server-side aggregate stats for the dispo dashboard:
- Per-deal metrics: buyer count, contacted/responded/interested/selected counts, days in dispo, days since last activity
- Aggregate funnel totals
- Stalled deal IDs with reason codes

### `GET /api/buyers/[id]/stats`
Buyer performance stats computed from `deal_buyers` aggregation:
- Times linked, contacted, responded, interested, offered, selected
- Response rate (responded statuses / contacted statuses)
- Recent deal activity (last 5 deal_buyer records with deal context)

---

## 3. UI Surfaces (3 enhancements, no new pages)

### Surface 1: Buyer Performance Summary
- Location: Buyer Detail Modal, new collapsible section
- Shows: linked/contacted/responded/interested/selected counts, response rate, recent deals

### Surface 2: Enhanced Dispo Board Funnel + Deal Cards
- Richer funnel bar with avg days-in-dispo
- Per-deal "X days in dispo" badge and "last activity" indicator
- Stalled deals get amber border

### Surface 3: Stalled Deals Panel
- Location: Top of /dispo page, collapsible
- Rules:
  - "No outreach started" — linked >1 day, all not_contacted/queued
  - "No responses" — all sent, oldest sent >3 days ago
  - "Needs follow-up" — interested/offered, no follow_up logged
  - "Stalled selection" — selected buyer, no activity >5 days

---

## 4. Honest Metrics Rules

1. Counts are exact (from status field)
2. Timing uses entered_dispo_at or created_at; labeled "~" when approximate
3. Response rate = responded statuses / contacted statuses
4. Days in dispo only shown when entered_dispo_at exists
5. Stall thresholds: 1 day (no outreach), 3 days (no response), 5 days (stalled selection)
6. No invented scores or health percentages

---

## 5. What We Don't Build

- No charting library
- No dedicated reporting page
- No status-change audit trail
- No algorithmic buyer scoring
- No buyer ranking system
- No fake precision on timing metrics

---

## 6. Deferred to Later Phases

- Status-change audit log (for exact transition timing)
- Visual funnel charts (recharts or similar)
- Dedicated /dispo/reporting page
- Assignment-fee analytics by buyer/market
- Buyer reliability scoring algorithm
- Time-series trend analysis
