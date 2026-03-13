# Dominion Ads / Sentinel Handoff Document
## Status, Guardrails, Next Steps, and Prompting Guide for Other AI

Prepared: March 13, 2026  
Audience: Adam, future collaborators, and any AI assistant picking up the project

---

## 1. What this project is

Dominion Ads is not a generic ad dashboard. It is a wholesaling-focused Google Ads operator system inside the CRM for Dominion Home Deals. Its purpose is to generate more first-party motivated seller leads, reduce dependence on pay-per-lead providers, improve lead quality, move faster from click to conversation, and turn ad spend into contracts and revenue.

Primary market: Spokane County, Washington  
Secondary market: Kootenai County / Coeur d'Alene / North Idaho  
Spokane is the clear priority.

The system must optimize for:
- qualified seller conversations
- appointments
- offers
- contracts
- revenue per source

It must not optimize mainly for:
- clicks
- CTR
- cheap traffic
- raw lead volume without fit

---

## 2. Core business rules that future work must obey

1. This is a wholesaling / acquisitions system, not a brokerage or agent-marketing project.
2. Optimize for contracts and revenue, not vanity metrics.
3. Spokane and Kootenai must remain separate in campaign structure, reporting, AI recommendations, and attribution.
4. DominionHomeDeals.com is the master brand.
5. Extra owned domains are support assets, not separate full businesses by default.
6. Google Search is the first acquisition channel. Meta is later.
7. AI can recommend, summarize, classify, and simulate. Risky actions require human approval.
8. Important actions must be logged for auditability.
9. The system should stay simple, production-oriented, and operationally useful.
10. Do not automate before measurement exists.

---

## 3. Strategic campaign principles already established

The current strategic position is:
- stay local
- stay seller-only
- stay situation-aware
- use direct, local, non-call-center language
- keep campaign structure narrow enough to avoid obvious waste but broad enough to invite likely-fit sellers into conversation

Highest-priority seller situations:
- inherited / probate
- debt / tax distress
- absentee owner / landlord fatigue
- tenant issues
- as-is / repairs
- urgent sale situations

Offer language that is approved and considered true:
- cash offer
- sell as-is
- no repairs
- local buyer
- close on your timeline
- not a call center

---

## 4. What is built and trustworthy now

The project has a real backend and operator foundation. Based on the project status and the recent engineering work, the current trustworthy layers are:

### Product / project foundation
- architecture docs, rules, and operating guardrails exist
- a production-oriented repo structure exists
- the project has been kept aligned with wholesaling economics instead of generic SaaS assumptions

### Ads data and sync foundation
- normalized ads schema exists
- idempotent Google Ads sync exists
- internal ID mapping issues were fixed
- Google Ads read-only integration exists
- real sync logging exists

### Attribution and landing page foundation
- `/sell` exists and is launch-ready for v1
- lead form + call/text paths exist
- lightweight conversion tracking exists
- lead attribution now exists in a usable form

### Intelligence and operator layer
- search term analysis exists
- structured recommendations exist
- approvals persistence exists
- approvals UI exists in sandbox mode
- dry-run simulation path exists
- implementation logs exist for simulated/dry-run pathways

### Important current ceiling
The operator layer is now good at:
- reading and organizing ads data
- generating structured recommendations
- recording approvals and rejections
- simulating execution safely
- preserving auditability

It is **not** yet approved for real Google Ads mutations.

---

## 5. What is still manual or still missing

### Still manual
- Google Ads conversion action creation
- placing conversion labels into Vercel env vars
- redeploy after env var updates
- final `/sell` production verification
- Spokane proposal approval
- first Spokane Search campaign build in Google Ads
- week-one launch monitoring
- actual implementation of any suggested Google Ads changes

### Still missing / not ready
- no production-approved Google Ads write/deployment layer
- no justification for live automation yet
- no mature 90-day conversion / revenue feedback loop yet
- no complete acquisitions CRM as the operating center yet
- auth / RLS still matter and should remain a concern for production hardening
- full offline conversion feedback should wait until the CRM/deal-stage layer is real enough to support it cleanly

---

## 6. Current launch path

The immediate launch path remains:
1. finish any last ad copy corrections in the manual build sheet
2. create Google Ads conversion actions
3. set conversion labels in Vercel
4. redeploy DominionHomeDeals
5. test `/sell` form and call/text tracking in production
6. approve the Spokane campaign proposal
7. manually build the Spokane Search campaign in Google Ads
8. launch carefully and monitor for 7 days
9. sync real Search data once traffic starts flowing

### Current Spokane Search launch shape
- Search only
- no Search Partners
- no Display
- Maximize Clicks
- $12 max CPC cap
- $30/day budget
- phrase + exact only
- no broad match in v1
- shared negative list
- Presence-only geo targeting

Initial ad groups:
- Sell My House - Spokane
- As-Is / Repairs - Spokane
- Inherited / Probate - Spokane
- Landlord Exit - Spokane

---

## 7. Seven-day operating plan after launch

### Day 1
- confirm impressions, clicks, and ad approvals within hours
- verify `/sell` traffic and conversions in GA4 Realtime
- check Vercel logs for lead API success / errors
- review search terms for obvious waste

### Days 2-3
- add negatives quickly where waste is obvious
- verify CPC range is acceptable
- confirm some ad group distribution exists
- confirm `form_step` and `generate_lead` events are visible
- measure actual response speed on inbound leads

### Days 4-7
- expand negatives based on real search term waste
- calculate first cost per lead
- review device performance
- verify geo quality
- summarize week-one metrics and decisions

### Known launch risks to remember
- budget is thin, so early data volume will be light
- call tracking is still intent-only, not call-quality tracking
- the account is new and lacks conversion history
- negatives can overblock if used too aggressively
- the full CRM layer is not yet the operating center
- geo misconfiguration can silently waste budget

---

## 8. What should NOT happen next

These are explicit anti-goals unless the source docs and real-world data justify them later:
- no live Google Ads mutate/deployment planning right now
- no auto-execution of campaign changes
- no pretending dry-run equals implementation
- no dashboard bloat
- no overbuilt CRM before the minimum useful version
- no mixing Spokane and Kootenai reporting prematurely
- no optimization around cheap leads over contracts
- no expansion to Meta prospecting yet
- no multiple-site empire behavior by default

The current system should stop at a truthful dry-run/operator layer until launch, measurement, and lead-to-deal feedback are working.

---

## 9. Recommended next product phase after safe launch

After the Spokane launch is operating and real data is flowing, the next high-value phase should be:

### Acquisitions CRM / revenue feedback foundation
Build the minimum useful acquisitions workflow first:
- lead inbox / lead record
- attribution on every lead
- speed-to-lead visibility
- contact attempt logging
- qualified-fit status
- appointment stage
- offer stage
- contract stage
- closed-deal stage

Then prepare the offline conversion feedback path after that foundation exists.

Reason:
A deal-stage layer is more valuable right now than live execution automation. It helps tie ad spend to actual outcomes, which is the real business goal.

---

## 10. Architectural mental model

Think of the system in these flows:

1. Google Ads syncs into Supabase  
2. Leads arrive and get attributed  
3. Stored data is analyzed by AI  
4. Recommendations go to an operator UI  
5. Approvals and audit decisions are logged  
6. Deal stages later connect spend to revenue  
7. Offline conversion feedback comes only after the deal-stage layer is mature

Key architecture rule:
AI should read stored data and produce structured recommendations. It should not roam freely, invent APIs, or silently mutate high-risk systems.

---

## 11. What another engineer or AI should assume on day one

Assume all of the following unless a newer source-of-truth document clearly overrides them:
- this is a production-oriented internal software project
- the business is wholesaling, not brokerage
- the north star is contracts and revenue
- Spokane comes first
- Kootenai remains separate
- DominionHomeDeals.com is the master brand
- Google Search is the first acquisition channel
- the operator workflow should feel truthful, calm, and useful
- risky changes require human approval
- dry-run is allowed before real execution
- live execution should wait until real measurement exists

---

## 12. Prompting guide: how to get better output from other AI

The best prompting pattern for this project is not “build X.” It is:

### Good prompt structure
1. **State the role** you want the AI to play.
2. **State the current project phase** and what is already done.
3. **Name the source docs** and say they are the source of truth.
4. **State what is in scope**.
5. **State what is out of scope**.
6. **State non-negotiable guardrails**.
7. **Require adversarial review**.
8. **Require a narrow plan before coding**.
9. **Require verification before the next phase**.
10. **Forbid drift into later phases**.

### Best practices for prompting other AI on this project
- tell the AI to re-read the source docs first
- tell it to use subagents / parallel reviewers / skills if available
- tell it to simulate separate review passes if real agents are unavailable
- force it to separate planning from implementation
- force it to restate scope and out-of-scope before coding
- force it to explain risks and failure modes
- force it to verify production safety before moving on
- tell it to prefer narrower truthful behavior over ambitious behavior
- tell it explicitly when approval must not equal execution
- tell it not to invent endpoints, fields, or schema states

### Prompt rules that work especially well
Use phrases like:
- “Do not broaden scope.”
- “Do not begin the next slice.”
- “Re-read the source docs first.”
- “Use adversarial review in parallel.”
- “Restate exact scope and out-of-scope before coding.”
- “Fail closed on invalid, stale, duplicate, or unauthorized requests.”
- “Do not imply dry-run equals implementation.”
- “Preserve Spokane/Kootenai separation.”
- “Prefer the simplest truthful design.”

### Prompt mistakes to avoid
Do not say things like:
- “Just build the whole phase.”
- “Run with it.”
- “Make it fully autonomous.”
- “Use your judgment” without guardrails.
- “Improve everything you see.”
- “Refactor as needed” unless you actually want broad changes.
- “Make it production ready” without specifying what safe means.

---

## 13. Reusable prompt template for other AI

Use this when handing work to Claude, ChatGPT, Antigravity, or another coding model.

### Master project-resume prompt

```text
You are taking over an in-progress project called Dominion Ads / Sentinel Ads integration.

Before doing anything:
- read the attached source docs fully
- treat them as source of truth
- use subagents / parallel reviewers / skills if available
- if not, simulate independent review passes and reconcile disagreements

Project reality:
- this is a wholesaling-focused Google Ads operator system inside the CRM
- optimize for contracts and revenue, not vanity metrics
- Spokane is first priority
- Kootenai remains separate
- DominionHomeDeals.com is the master brand
- risky actions require human approval
- do not automate before measurement exists
- prefer truthful, reviewable workflows over clever automation

Your task:
[INSERT TASK HERE]

Required before coding:
1. restate exact scope
2. restate out-of-scope items
3. list guardrails
4. list major risks
5. explain safest implementation sequence

Required after coding:
1. exact changes made
2. build/typecheck/test results
3. adversarial findings
4. whether it is production-safe
5. what must happen before the next phase
```

### Planning prompt template

```text
Plan this phase only.
Do not implement it yet.
Do not drift into later phases.

Re-read the source docs first.
Use adversarial review in parallel.

I want:
- current-state summary
- scope / out-of-scope
- risks and failure modes
- data model and workflow design
- narrow implementation slices
- the first safe slice only
```

### Implementation prompt template

```text
Implement slice 1 only.
Do not begin slice 2.
Do not broaden scope.

Before coding:
- re-read the source docs
- re-read the approved plan
- run implementation, adversarial, safety, and data-integrity reviews in parallel

Required before implementation:
- restate exact scope
- restate out-of-scope items
- list files/modules/tables to change
- list mandatory validations
- confirm what remains manual

Required after implementation:
- exact changes made
- why the slice is safe
- build/typecheck/test results
- adversarial findings
- confirmation that no later-slice drift occurred
```

### Verification prompt template

```text
Do not begin the next slice.

Run a hard verification and adversarial audit of the completed work.
Use parallel reviewers if available.

Check exactly:
1. did implementation stay within scope?
2. did any unsafe behavior get introduced?
3. are stale / duplicate / invalid / unauthorized paths handled safely?
4. is Spokane/Kootenai separation preserved?
5. is the result production-safe?

Output:
- pass/fail per check
- evidence
- exact issues found
- exact fixes required
- whether the next slice may begin
```

---

## 14. Prompting guidelines by AI type

### For Claude / Antigravity / coding agents
- explicitly request parallel reviewer passes
- ask for adversarial critique
- keep the task narrow
- require exact files/modules/routes to be named
- require verification after implementation

### For ChatGPT
- attach the source docs or this handoff
- ask it to treat them as source of truth
- ask for a phased recommendation, not a generic answer
- ask for explicit guardrails and risk calls

### For any AI that tends to overbuild
Add these lines:
- “Prefer a narrower safe implementation over a broader elegant one.”
- “Do not invent missing APIs or schema states.”
- “When unsure, choose the simpler operationally useful solution.”

---

## 15. Recommended next conversation starter

If you open a new chat with another AI, start with this:

```text
I’m working on Dominion Ads for Dominion Home Deals, a wholesaling-focused Google Ads operator system inside a CRM. Please treat the attached handoff document and source docs as the current source of truth.

The immediate business priority is to launch the first Spokane Search campaign safely, measure real inbound, and keep the current operator/dry-run layer truthful.

Do not plan or implement live Google Ads execution yet.
Do not optimize for clicks over contracts.
Do not merge Spokane and Kootenai logic.
Do not broaden scope.

Before recommending anything:
- summarize current state
- identify what is manual vs automated
- identify the next highest-value layer
- explain risks and guardrails
```

---

## 16. One-paragraph handoff summary

Dominion Ads is now a real, partially operational wholesaling-focused ads operator system with live sync, attribution, recommendation, approval, and dry-run simulation foundations. The right next move is not live execution. The correct path is: finish the Spokane manual launch cleanly, monitor real traffic and attribution, then build the minimum useful acquisitions CRM / deal-stage layer so ad spend can be tied to real business outcomes before any future automation is reconsidered.

