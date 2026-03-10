---
name: implementation-notes-builder
description: Builds the implementation notes section mapping each deliverable to its CRM surface, priority, and automation status.
user_invocable: true
---

# Implementation Notes Builder

## Purpose
Produce the final "implementation notes" section that tells Adam exactly what to build where in Sentinel.

## Categories to map

### 1. Embed into Sentinel immediately
Things that should be CRM-native from day one:
- Lead fields (from intake guide + scorecard)
- Stage/status labels (from qualification routing)
- Task types and cadence logic (from follow-up cadence)
- Qualification scoring fields

### 2. Lives in Lead Detail
Content that surfaces when viewing a specific lead:
- Intake guide (call-assist panel)
- Qualification scorecard (scoring widget)
- Offer framework (call-assist panel, contextual on stage)
- Objection handling cards (contextual on stage/objection detected)

### 3. Lives in Dialer/Twilio context
Content that surfaces during an active call:
- Intake guide (abbreviated version)
- Objection quick-replies
- Offer framework (during offer calls)
- Voicemail scripts from follow-up cadence

### 4. Remains in spreadsheet temporarily
- Comp calculator (until CRM underwriting module is built)
- Specify which fields should sync back to CRM after comp is done

### 5. Should NOT be automated — requires human judgment
- Qualification scoring (human must score, CRM just stores)
- Offer amount decision (calculator helps, human decides)
- Escalation to Adam (CRM flags, human reviews)
- Dead lead classification (human confirms, CRM records)
- Buyer list relationship management

## Output format
Produce as a prioritized table:
| Deliverable | Surface | Priority | Automation level | Notes |
|-------------|---------|----------|-----------------|-------|
