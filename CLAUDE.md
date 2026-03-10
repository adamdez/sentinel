# Sentinel / Dominion Home Deals - Claude Working Guide

## Mission
Help build Sentinel into a simple, fast, reliable acquisitions operating system for Dominion Home Deals.

The system should help the team:
- respond to inbound leads faster
- qualify sellers more consistently
- follow up without leads getting lost
- make more offers
- track outcomes by market and source
- keep operations clean for a very small team

If a change does not clearly help Adam or Logan do one of those things, it probably does not belong.

---

## Current product direction
Sentinel is being narrowed into a Dominion-first acquisitions CRM.

Primary focus areas:
- Lead Inbox
- Lead Detail
- Pipeline
- Dialer / Twilio workflow
- Follow-up / next actions
- Offer workflow
- Lightweight analytics
- Source / market attribution

This is **not** an enterprise ERP, internal social app, or general-purpose investor platform.

---

## Primary operators
- **Logan**: inbound response, acquisitions, most seller calls, follow-up
- **Adam**: backend operations, KPIs, Google Ads, CRM build, management review

When choosing between elegance and operator usefulness, prefer operator usefulness.

---

## Market context
- Primary market: **Spokane County, WA**
- Secondary market: **Kootenai County, ID**
- Rural leads are acceptable
- Default reporting and operator visibility should preserve Spokane vs Kootenai clarity

---

## Core product principle
The CRM should be the operational source of truth.

Prefer:
- CRM-native workflows
- Lead Detail as the working surface
- guarded write paths for critical mutations
- explicit next actions
- stage clarity
- visible ownership
- trustworthy metrics

Avoid:
- paper-first systems
- sidecar systems that become the real workflow
- scattered notes that bypass the CRM
- speculative complexity

A spreadsheet may be acceptable temporarily for comping / underwriting, but the final outcome should still flow back into the CRM.

---

## Workflow integrity rules
- `stage/status` means workflow position, not ownership
- `assigned_to` means ownership
- “My Leads” is a filtered view, not a real pipeline stage
- critical changes should prefer guarded server/API paths over direct client-side writes
- stage changes, assignment changes, compliance-sensitive changes, and major lead mutations should be handled safely and consistently
- avoid introducing alternate hidden workflow paths
- do not make it easy for a lead to move forward without clear next-step visibility
- avoid designs that let leads disappear without follow-up context

---

## Lead handling philosophy
The system should support a real acquisitions workflow, not a call-center vanity workflow.

Prioritize:
- speed-to-lead
- contact attempts
- seller qualification
- follow-up discipline
- clear next actions
- offer movement
- seller/property context
- source and market attribution

Do not prioritize:
- vanity leaderboards
- dial-count theater
- overly broad dashboards
- complex features that do not improve execution

---

## Lead Detail expectations
Lead Detail should act as an acquisitions workspace.

It should help the operator:
- understand who the seller is
- understand the property and situation quickly
- call or text only if compliant with workflow rules
- log notes and outcomes
- move stage safely
- set next actions
- review recent communication
- understand ownership, source, and market
- decide whether to offer, nurture, or disqualify

Lead Detail should not become a bloated mini-ERP page.

---

## Dialer / call assist expectations
Dialer and Twilio features should support real live seller conversations.

Prefer:
- click-to-call
- simple call outcome logging
- callback / next action capture
- short contextual scripts or prompts
- objection handling prompts that are brief and usable live

Avoid:
- call-center style complexity
- overbuilt scripting engines
- fake productivity widgets

Important:
- Washington outbound follow-up in this system is call-only unless explicitly changed by the user
- do not introduce cold SMS workflows by default

---

## Analytics expectations
Analytics should reflect trustworthy business outcomes.

Prefer:
- market split visibility
- source outcomes
- pipeline health
- speed-to-lead with honest labeling
- real deal revenue where available
- operator-readable caveats

Avoid:
- synthetic revenue
- mixed-truth metrics presented as hard facts
- flashy dashboards with weak trust
- duplicating the Ads workspace inside Analytics

---

## Copy and tone rules
Use tone that is:
- local
- respectful
- direct
- calm
- trustworthy
- practical

Avoid:
- investor-bro language
- manipulative sales language
- fake urgency
- generic guru advice
- enterprise sales jargon
- bloated consultant wording

Write for real operators and real seller conversations.

---

## Build decision filter
Before suggesting a new page, workflow, field, or component, ask:

1. Does this help Adam or Logan move a real lead forward?
2. Does this reduce missed follow-up or improve speed-to-lead?
3. Does this improve qualification, offer movement, or attribution?
4. Does this keep the CRM as the source of truth?
5. Is this simpler than the alternative?
6. Can this be added without creating new workflow confusion?

If the answer is mostly no, do not add it.

---

## What to avoid
Do not drift into:
- enterprise CRM sprawl
- broad ERP behavior
- internal chat/social features
- speculative AI orchestration
- vanity analytics
- duplicate systems of record
- features added mainly because they are technically possible

---

## Output preference
When proposing work:
- prefer small safe refinements
- preserve build stability
- preserve existing operator workflows unless there is a clear gain
- explain where something should live in the product
- map recommendations to actual CRM surfaces, fields, stages, and tasks
- prefer concrete implementation guidance over abstract advice