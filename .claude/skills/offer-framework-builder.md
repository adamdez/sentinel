---
name: offer-framework-builder
description: Builds the verbal offer framework for presenting cash offers honestly during live calls.
user_invocable: true
---

# Verbal Offer Framework Builder

## Purpose
Build a short call-use framework that helps Logan present a range or conditional number honestly, and explain why a cash offer is lower than retail without sounding shady.

## Key principles
- Always present a range, not a single number
- Explain the math simply: "Here's how we got to this number"
- Never apologize for the offer — explain the value proposition
- The offer is speed + certainty + no repairs + no agent fees + no showings
- If the seller's number is way off, it's better to say so honestly than to ghost them

## Framework structure

### 1. Pre-offer setup (before giving numbers)
- Recap what you learned about their situation
- Confirm the property details
- Set the frame: "I want to be upfront about how we get to our numbers"

### 2. The offer presentation
- State the range: "Based on our research, we'd be looking at somewhere between $X and $Y"
- Lead with the honest explanation:
  - "Properties like yours in [neighborhood] are selling for around $[ARV] in retail-ready condition"
  - "Your property needs approximately $[repair estimate] in work to get there"
  - "As a cash buyer, we also factor in our holding costs and closing costs"
  - "That's how we arrive at the $X to $Y range"
- Never use: "That's the best I can do" (it's not — you have a range)

### 3. Value proposition (why cash is different)
- Close in as fast as 10-14 days
- No inspections, no appraisals, no financing contingencies
- No repair requests — we buy as-is
- No agent commissions (saves 5-6%)
- No showings, no open houses
- Certainty: when we say we'll close, we close

### 4. The ask
- "Does that range work for your situation?"
- If yes: "Great, let me put together the formal numbers and we can move forward"
- If no: "I understand. What number would work for you?" (gather their counter)
- If "I need to think about it": transition to follow-up framework

### 5. Handling the gap
When their number and your number are far apart:
- Acknowledge it: "I understand that's not where you were hoping"
- Be honest: "If you're looking for $[their number], listing with an agent might get you closer — it'll just take longer and cost more in fees and repairs"
- Leave the door open: "If your situation changes or you want the certainty of a quick cash sale, I'm here"

## CRM fields to update after offer conversation
- `offer_amount_low` — low end of range presented
- `offer_amount_high` — high end of range presented
- `offer_date` — timestamp
- `offer_response` — enum: "accepted", "countered", "rejected", "thinking", "no-response"
- `seller_counter_amount` — their counter number if given
- `offer_notes` — free text
- `next_action` — based on response
- `stage` — update based on outcome:
  - accepted → `under-contract`
  - countered → `negotiating`
  - rejected → `offer-rejected`
  - thinking → `offer-pending`

## Output format
Produce as a structured call-assist panel: numbered steps, short bullets, inline field tags `[field: offer_amount_low]`. Designed to be scannable during a live call.
