---
name: daily-checklist-builder
description: Builds Logan's CRM-driven daily execution checklist for acquisitions operations.
user_invocable: true
---

# Daily Checklist Builder (Logan)

## Purpose
Build a CRM-driven daily checklist that tells Logan exactly what to do each morning. Not a motivational poster — a work queue.

## Design principle
This checklist should be answerable entirely from CRM data. If Logan opens Sentinel in the morning, the dashboard should surface these items automatically.

## Checklist items (in priority order)

### 1. New inbound leads (respond within 1 hour during business hours)
- Source: leads where `stage` = "new" and `created_at` = today
- Action: call back immediately, run intake guide
- CRM view: "New Leads" filtered queue

### 2. Offers pending response
- Source: leads where `offer_response` = "thinking" or "countered"
- Action: check if follow-up is due, prepare updated offer if needed
- CRM view: "Offer Pending" filtered queue

### 3. Follow-up calls due today
- Source: tasks where `task_type` = "follow-up-call" and `task_due_date` = today
- Action: make the call, log the outcome
- CRM view: "Today's Follow-ups" task list

### 4. Overdue follow-ups (missed from previous days)
- Source: tasks where `task_type` = "follow-up-call" and `task_due_date` < today and `status` = "pending"
- Action: make the call or reschedule
- CRM view: "Overdue" task list (red highlight)

### 5. Leads needing qualification
- Source: leads where `stage` = "contacted" and `qualification_score` is null
- Action: run qualification scorecard
- CRM view: "Needs Scoring" filtered queue

### 6. Comps to run
- Source: leads where `qualification_route` = "offer-ready" and `estimated_arv` is null
- Action: pull comps, run calculator, prepare offer range
- CRM view: "Needs Comps" filtered queue

### 7. Buyer outreach
- Source: if any leads are under contract or offer-accepted
- Action: send deal to buyers list, log interest
- Minimum: 1 new buyer contact per day when deals are active

### 8. End-of-day logging
- Log total calls made today
- Log total new leads contacted
- Log total offers made
- Log any deals moved to under-contract
- Update any stale lead statuses

## CRM fields that drive this checklist
- `stage`, `offer_response`, `qualification_score`, `qualification_route`
- `estimated_arv`, `task_due_date`, `task_type`, `task_status`
- `created_at`, `last_contact_date`, `next_action`, `next_action_date`

## Output format
Produce as a numbered daily checklist with CRM query logic for each item, so a developer can build a dashboard widget that auto-generates this list each morning.
