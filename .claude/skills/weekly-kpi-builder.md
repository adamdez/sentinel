---
name: weekly-kpi-builder
description: Builds Adam's weekly KPI review checklist with only metrics a new acquisitions business can realistically track.
user_invocable: true
---

# Weekly KPI Review Checklist Builder (Adam)

## Purpose
Build a weekly review checklist for Adam that uses only metrics the business can actually track right now. No vanity metrics, no enterprise dashboards.

## Design principle
Every KPI must be answerable from CRM data or Google Ads. If it requires manual calculation or guessing, it's not a KPI yet — it's an aspiration.

## KPI categories

### 1. Lead volume
- New leads this week (total, by source)
- New leads by market (Spokane vs Kootenai)
- Google Ads: cost per lead, total ad spend, click-through rate
- Source breakdown: Google Ads, direct mail, referral, organic, other

### 2. Contact rate
- Leads contacted this week / total new leads
- Average time from lead creation to first contact (hours)
- Target: contact within 1 hour during business hours

### 3. Qualification rate
- Leads scored this week
- Distribution by route: offer-ready, follow-up, nurture, dead, escalate
- Percentage of leads reaching "offer-ready"

### 4. Offer activity
- Offers made this week
- Offers accepted / countered / rejected / pending
- Average offer amount
- Offer-to-lead ratio (offers / total qualified leads)

### 5. Pipeline health
- Leads in each stage (new, contacted, qualified, offer-pending, negotiating, under-contract, nurture, dead)
- Leads with overdue follow-ups
- Leads with no activity in 7+ days
- Stale lead count (no activity in 14+ days)

### 6. Follow-up execution
- Follow-up calls made this week
- Follow-up calls due vs completed (completion rate)
- Voicemails left
- Average attempts per lead before contact

### 7. Deal progress
- Deals under contract
- Deals closed this week
- Revenue this week (assignment fees collected)
- Average assignment fee
- Days from first contact to contract

### 8. Cost efficiency
- Total marketing spend this week
- Cost per lead
- Cost per qualified lead
- Cost per offer made
- Cost per deal (when closings happen)

## What NOT to track yet
- Lifetime value (too early)
- Churn rate (not a subscription business)
- NPS / satisfaction scores (no capacity for this)
- Detailed agent-level metrics (there's one acquisitions person)
- Conversion funnels with 8+ stages (keep it simple)

## Review format
Adam should review weekly on Monday morning. Format:
1. Top-line numbers (5 metrics that matter most this week)
2. Red flags (overdue leads, missed follow-ups, declining contact rate)
3. Wins (deals moved forward, good conversion numbers)
4. One action item for the week ahead

## CRM/analytics sources
- Lead data: Sentinel CRM queries
- Ad data: Google Ads dashboard or API
- Call data: Twilio call logs
- Revenue: manual entry until deal tracking is automated

## Output format
Produce as a structured review template with the exact CRM queries or data sources for each metric, so it can be built as a Sentinel analytics page.
