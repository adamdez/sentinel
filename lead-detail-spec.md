# Lead Detail Spec - Dominion Acquisitions Workspace

## Purpose
Lead Detail is the primary working surface for acquisitions inside Sentinel.

It should help Logan and Adam quickly decide:
- who this seller is
- what property/problem is being discussed
- what stage the lead is in
- what the next action is
- whether to call now, follow up later, make an offer, nurture, or disqualify

Lead Detail should support fast execution and clean follow-through.

---

## Core principle
Lead Detail is not a profile page.
It is not a document archive.
It is not a mini-ERP.

It is an **action-oriented acquisitions workspace**.

A good Lead Detail view should make it easy to:
- take the next action
- capture new information
- review recent history
- move the lead safely
- avoid losing the lead

---

## Primary users
### Logan
Uses Lead Detail to:
- review new inbound leads
- call sellers
- qualify situations
- log notes
- handle objections
- set callbacks
- move stage
- determine whether a lead is worth an offer soon

### Adam
Uses Lead Detail to:
- review lead quality
- inspect follow-up discipline
- help with difficult sellers or offers
- verify routing and stage usage
- understand source/market context
- step into negotiation or offer situations when needed

---

## What Lead Detail must optimize for
- fast comprehension
- clear next action
- fast call initiation
- trustworthy stage/ownership visibility
- concise seller + property context
- recent communication visibility
- note capture
- qualification capture
- follow-up discipline

---

## Above-the-fold requirements
The top section should answer, at a glance:

- seller name
- property address
- stage/status
- assigned owner
- source
- market
- best contact info
- last contact
- next action / follow-up due
- key risk or urgency cues if present

The operator should not need to scroll to understand the basic situation.

---

## Primary actions
These actions should be prominent and easy to reach:

- Call
- Claim / Assign
- Move Stage
- Set Next Action
- Log Note
- Mark Follow-up Date
- View Recent Communication
- Open underwriting / comp context if relevant

If the lead is fresh or overdue, the interface should make action obvious.

---

## Suggested section order

### 1. Header / action bar
Contains:
- seller name
- address
- stage badge
- assignee
- market
- source
- Call button
- Claim/Assign
- Move Stage
- Set Next Action

This area is for rapid orientation and action.

### 2. Next Action block
Contains:
- current next action
- due date/time
- overdue state if applicable
- quick update controls
- callback / follow-up intent

This block is critical.
A lead should not feel “complete” if the next action is unclear.

### 3. Seller + situation summary
Contains:
- seller name(s)
- phone/email
- occupancy / vacancy
- ownership / decision-maker notes
- motivation summary
- timeline summary
- condition summary
- asking price or price expectation if known

This should stay concise and practical.

### 4. Communication block
Contains:
- recent calls
- recent notes
- call outcomes
- voicemail attempts
- recent contact history

This should help the operator avoid repeating work or missing context.

### 5. Qualification block
Contains structured fields such as:
- motivation
- timeline
- condition
- occupancy
- decision-maker status
- price realism
- equity/flexibility
- disposition fit / offer readiness if used

This should support routing decisions, not create admin burden.

### 6. Property context block
Contains only the property facts needed for acquisition decisions:
- address
- county / market
- property type
- bed/bath/sqft when available
- rough condition / repairs
- occupancy
- parcel/APN only if useful
- comp / underwriting link or summary if available

Do not let this block dominate the page.

### 7. Offer / negotiation block
Contains:
- offer status
- rough valuation context
- offer notes
- latest number/range discussed
- escalation to Adam if needed

This can be lightweight in v1.

### 8. Compliance / consent block
Contains only the information needed to keep communication safe and visible.
Do not overbuild it, but do not hide it.

---

## Lead Detail should support these decisions
The operator should be able to route a lead toward one of these outcomes:

- make offer soon
- schedule follow-up
- nurture
- dead lead
- escalate to Adam

The UI should make those decisions easier, not harder.

---

## Data and field expectations
Lead Detail should eventually expose or support fields like:

### Identity / routing
- seller_name
- contact_phone
- contact_email
- assigned_to
- stage/status
- source
- market/county

### Follow-up
- next_action
- next_action_due_at
- last_contact_at
- contact_attempt_count
- callback_needed

### Qualification
- motivation
- timeline
- occupancy
- condition
- decision_maker_status
- price_expectation
- equity_or_flexibility
- qualification_score or routing label if used

### Offer context
- arv_estimate
- repair_estimate
- mao_or_offer_range
- offer_status
- negotiation_notes

Only surface what improves action quality.
Do not overload the first view.

---

## UX rules
- make action buttons obvious
- reduce scrolling for essential workflow actions
- do not bury next action under secondary info
- keep notes and recent communication easy to scan
- use badges/labels carefully and consistently
- prefer short helper text over long explanation blocks
- preserve speed and clarity over completeness

---

## What should be de-emphasized
These should not dominate Lead Detail:
- large document sections
- secondary valuation tooling
- admin-only diagnostics
- oversized property metadata panels
- analytics widgets
- rarely used compliance detail
- internal system complexity exposed to operators

---

## What should not happen
Lead Detail should not:
- become the dumping ground for every feature
- require excessive clicking to log the next action
- mix stage and ownership semantics
- make the operator guess what to do next
- hide overdue follow-up
- prioritize historical detail over immediate action
- turn into a bloated investor portal

---

## Success criteria
Lead Detail is successful if Logan can open a lead and, within seconds:
- understand the situation
- place a call or choose the next action
- log the outcome
- move the lead appropriately
- set follow-up cleanly
- leave without losing context

It is also successful if Adam can quickly inspect lead quality, pipeline movement, and follow-up discipline without wading through clutter.

---

## Implementation guidance
When making changes to Lead Detail:
- prefer small, safe workflow improvements
- preserve build stability
- keep the view modal-first unless there is a strong reason otherwise
- map UI changes to real operator behavior
- favor actionability over visual flourish
- keep the CRM as the operational source of truth