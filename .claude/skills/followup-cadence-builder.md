---
name: followup-cadence-builder
description: Builds the 30-day call-only follow-up cadence with CRM task logic and day-by-day sequence.
user_invocable: true
---

# 30-Day Call-Only Follow-Up Cadence Builder

## Purpose
Build a realistic call-only follow-up sequence that a two-person team can actually execute. Every touch maps to a CRM task, next action, or stage outcome.

## Constraints
- Call-only. No cold SMS. No email sequences.
- Washington state outbound = calls only
- Must be realistic for Logan to execute alongside new inbound leads
- Include voicemail guidance where the seller doesn't pick up
- Each touch has a purpose — not just "checking in"

## Cadence structure
Design for these seller segments:
1. **Offer-ready but didn't accept yet** (highest priority)
2. **Qualified but not yet offered** (need comps/more info)
3. **Interested but low urgency** (nurture tier)

### Touch schedule (suggested — adjust for realism)
- Day 1: Initial follow-up call after intake
- Day 3: Second attempt if no contact
- Day 7: Value-add call (share comp findings, market info)
- Day 10: Check-in call
- Day 14: Re-engagement call (new angle or updated info)
- Day 21: Status check
- Day 30: Final cadence call (stay or archive decision)

### For each touch, specify:
- Day number
- Call purpose (one sentence)
- What to say if they answer (2-3 sentences max)
- What to say as voicemail (2-3 sentences max)
- CRM next action if no answer
- CRM next action if answered
- CRM stage change trigger (if any)
- When to exit cadence early (accepted offer, dead lead, etc.)

## Voicemail rules
- Keep under 30 seconds
- Always leave your name and number
- Give one specific reason to call back
- Never sound like a script
- Reference something specific about their property or situation

## CRM task mapping
Each touch generates:
- `task_type`: "follow-up-call"
- `task_due_date`: calculated from cadence start
- `task_description`: specific to this touch
- `cadence_day`: integer (1, 3, 7, 10, 14, 21, 30)
- `cadence_segment`: "offer-pending" | "qualified" | "nurture"
- `attempt_count`: running count of call attempts
- `last_attempt_date`: timestamp
- `last_attempt_outcome`: "answered" | "voicemail" | "no-answer" | "wrong-number" | "disconnected"

## Exit triggers
- Seller accepts offer → stage = `under-contract`
- Seller requests no more calls → stage = `do-not-contact`
- Seller unreachable after all 7 touches → stage = `stale`, review in 90 days
- Seller says "call me in X months" → stage = `nurture`, task at that date

## Output format
Produce as a day-by-day table with columns: Day | Purpose | If They Answer | Voicemail Script | CRM Next Action | Stage Trigger
