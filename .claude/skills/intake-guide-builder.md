---
name: intake-guide-builder
description: Builds the first-call seller intake guide for CRM-native use during live acquisitions calls.
user_invocable: true
---

# First-Call Seller Intake Guide Builder

## Purpose
Build a call guide Logan can use LIVE during inbound seller calls. This is not a training doc — it's a real-time reference that surfaces inside Lead Detail or the Dialer.

## Read first
- `/claude.md` for tone and constraints
- `/agents.md` for CRM/system context

## Structure to produce
1. **Opener** — first 15 seconds. Introduce yourself, establish why you're calling back / why they called. Warm, local, human.
2. **Core questions** — the must-ask questions that populate CRM fields:
   - Property address (confirm)
   - How they came to own (inherited? bought? how long?)
   - Current condition (livable? needs work? vacant?)
   - Occupancy (owner-occupied? tenant? vacant? how long?)
   - Motivation (why selling now? what's the situation?)
   - Timeline (when do they need this handled?)
   - Decision makers (who else needs to agree?)
   - Price expectations (have they had offers? what are they hoping for?)
   - Outstanding liens/mortgages/taxes
3. **Transition questions** — bridge from info-gathering to next step:
   - "Based on what you've told me..."
   - Set expectation for what happens next (property visit, comp research, offer call)
4. **Close for next step** — always end with a scheduled next action, never "I'll call you back sometime"

## CRM field mapping (must specify for each question)
Map every question to the exact Sentinel field it populates:
- `property_address`, `property_city`, `property_county`, `property_state`, `property_zip`
- `ownership_type` (inherited, purchased, family transfer, etc.)
- `property_condition` (good, fair, needs-work, major-rehab, unknown)
- `occupancy_status` (owner-occupied, tenant, vacant)
- `vacancy_duration_months`
- `seller_motivation` (free text + motivation_score 1-10)
- `seller_timeline` (immediate, 30-days, 60-days, flexible, unknown)
- `decision_maker_confirmed` (boolean)
- `decision_maker_notes` (free text)
- `price_expectation` (number or null)
- `has_prior_offers` (boolean)
- `outstanding_liens` (free text)
- `estimated_mortgage_balance` (number or null)
- `tax_status` (current, delinquent, unknown)
- `lead_source`, `lead_source_detail`
- `next_action`, `next_action_date`

## Tone rules
- Sound like a local guy who buys houses, not a call center
- Inherited-property leads are often grieving — be human first
- Absentee landlords are often frustrated — validate the burden
- Vacant property owners often feel stuck — offer a clear path
- Never pressure. Always offer a next step.

## Output format
Produce as a structured markdown doc that can be rendered inside a CRM call-assist panel. Use headers, short bullets, and field tags like `[field: seller_motivation]` inline so a developer can wire them up.
