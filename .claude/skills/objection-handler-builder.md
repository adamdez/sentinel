---
name: objection-handler-builder
description: Builds objection handling mini-scripts as quick-reply call assist content for CRM/Twilio.
user_invocable: true
---

# Objection Handling Mini-Scripts Builder

## Purpose
Build short, live-use responses for common seller objections. These surface as quick-reply content in the CRM call-assist panel or Twilio dialer. Not training scripts — real-time help during a call.

## Format per objection
- **Trigger**: what the seller says (or close variants)
- **Context**: when this typically comes up in the workflow
- **Response**: 2-4 sentences, conversational, honest
- **Follow-up**: what to say/do next
- **CRM action**: any field updates or stage changes

## Required objections

### 1. "I want retail price"
**Context**: After offer presentation or during intake when asking about price expectations.
**Response approach**:
- Validate: their property may well be worth that on the open market
- Explain the trade-off: retail price = retail timeline + retail hassle + retail costs
- Quantify: agent fees (5-6%), repairs, holding costs, 3-6 months on market
- Offer the choice: "If time and certainty matter more than top dollar, that's where we help"
- Never argue. Present the math and let them decide.

### 2. "I want to think about it"
**Context**: After offer presentation. This is the most common stall.
**Response approach**:
- "Absolutely, take your time. This is a big decision."
- Ask one clarifying question: "Is there something specific you're weighing, or do you just need a few days?"
- Set a specific follow-up: "Would it be okay if I called back Thursday?"
- Never pressure. The follow-up cadence handles this.
**CRM action**: Set `next_action` = "follow-up-call", `next_action_date` = agreed date, `offer_response` = "thinking"

### 3. "Are you a real estate agent?"
**Context**: Early in call, during intake, or after hearing "we buy houses."
**Response approach**:
- Honest answer: "No, I'm not an agent. We're a local company that buys properties directly."
- Differentiate: "An agent lists your property and hopes a buyer comes along. We're the buyer."
- Benefit: "That means no commissions, no showings, and a guaranteed close."
- If they want an agent: "I totally understand. If you decide to go that route and it doesn't work out, we're here."

### 4. "How did you get my information?"
**Context**: Early in call, especially cold or warm callbacks.
**Response approach**:
- Be transparent: "We use public property records to find properties that might be a good fit for our program."
- Normalize: "County records, tax records, and public listings are how we identify properties."
- Redirect: "But the reason I'm calling is [reference their specific situation if known]."
- Respect: "If you'd prefer not to be contacted, I completely understand and I'll remove you from our list."
**CRM action**: If they say remove → set `do_not_contact` = true, `stage` = "do-not-contact"

### 5. "Why is your cash offer lower than market value?"
**Context**: After offer presentation. The most important objection to handle well.
**Response approach**:
- Don't defend — explain: "Great question. Let me walk you through the math."
- Break it down simply:
  - "The property would sell for about $X retail-ready"
  - "It needs about $Y in work to get there"
  - "When you list traditionally, you're paying 5-6% in agent fees, plus repairs, plus 3-6 months of holding costs"
  - "Our offer accounts for all of that — so you net a similar amount, just faster and with certainty"
- Key line: "We're not trying to lowball — the math just works differently for a cash, as-is sale"
- Never say "take it or leave it." Say: "Does that make sense? What questions do you have?"

## Contextual display rules
- Objection #1 and #5: show during and after offer presentation (`stage` = "offer-pending" or "negotiating")
- Objection #2: show after offer presentation (`offer_response` = "thinking")
- Objection #3 and #4: show during intake and early calls (`stage` = "new" or "contacted")
- All objections available via search/lookup at any time

## Output format
Produce as a set of compact cards, each with: Trigger | Response | Follow-up | CRM Action. Designed to be scannable in 3 seconds during a live call.
