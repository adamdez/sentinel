---
name: qualification-scorecard-builder
description: Builds the qualification and routing scorecard with CRM field mapping and scoring logic.
user_invocable: true
---

# Qualification and Routing Scorecard Builder

## Purpose
Build a simple scoring system that routes every lead to one of five outcomes. Must map directly to CRM fields and stage transitions.

## Scoring dimensions (each 1-5 scale)
1. **Motivation** — How urgent is the seller's need to sell?
   - 5: must sell within days (foreclosure, estate deadline, relocation)
   - 4: strong motivation, clear reason, wants to move fast
   - 3: interested but no urgency
   - 2: exploring, might list with agent
   - 1: just curious, no real intent
   
2. **Timeline** — How soon do they need to close?
   - 5: immediate (within 2 weeks)
   - 4: within 30 days
   - 3: within 60 days
   - 2: within 6 months
   - 1: no timeline / "someday"

3. **Condition** — Property condition (affects rehab budget and deal viability)
   - 5: major rehab needed (fire, flood, structural, uninhabitable)
   - 4: significant work needed (roof, HVAC, foundation concerns)
   - 3: cosmetic rehab (paint, flooring, kitchen/bath updates)
   - 2: minor repairs only
   - 1: move-in ready / recently renovated

4. **Occupancy** — Current occupancy status
   - 5: vacant 6+ months
   - 4: vacant < 6 months
   - 3: owner-occupied, willing to vacate
   - 2: tenant-occupied, lease expiring soon
   - 1: tenant-occupied, long-term lease

5. **Decision-maker access** — Can we reach the person who can sign?
   - 5: sole owner, on the phone now
   - 4: sole owner, reachable
   - 3: multiple owners, primary contact engaged
   - 2: multiple owners, unclear who decides
   - 1: estate/probate, no executor contact yet

6. **Price realism** — How close are their expectations to our range?
   - 5: "just make me an offer" / no set number
   - 4: expects below retail, understands cash discount
   - 3: expects slight discount from retail
   - 2: wants near-retail
   - 1: wants above retail / unrealistic

7. **Equity/flexibility** — Is there room for a deal?
   - 5: free and clear, no liens
   - 4: low mortgage balance, likely equity
   - 3: moderate equity, some flexibility
   - 2: low equity, limited margin
   - 1: underwater or heavy liens

## Scoring logic
- Total score range: 7-35
- **Make offer soon**: 25+ AND motivation >= 4 AND decision-maker >= 3
- **Schedule follow-up**: 18-24 OR (motivation >= 3 AND timeline <= 3)
- **Nurture**: 12-17, no disqualifying factors
- **Dead lead**: < 12 OR motivation = 1 OR price-realism = 1
- **Escalate to Adam**: any lead where equity is unclear, legal complexity exists, or score is borderline (23-25)

## CRM mapping
Each routing result maps to:
| Route | Stage | Status | Next Action | Task |
|-------|-------|--------|-------------|------|
| Make offer soon | `qualified` | `offer-ready` | `prepare-offer` | "Run comps and prepare offer range" due today |
| Schedule follow-up | `qualified` | `follow-up` | `scheduled-call` | "Follow-up call" due per cadence |
| Nurture | `nurture` | `nurture` | `nurture-touch` | "Nurture check-in" due 14 days |
| Dead lead | `closed` | `dead` | none | none |
| Escalate to Adam | `qualified` | `escalate` | `adam-review` | "Adam review needed" due today |

## CRM fields to store
- `qualification_score` (integer 7-35)
- `motivation_score`, `timeline_score`, `condition_score`, `occupancy_score`, `decision_maker_score`, `price_realism_score`, `equity_score` (each integer 1-5)
- `qualification_route` (enum: offer-ready, follow-up, nurture, dead, escalate)
- `qualification_date` (timestamp)
- `qualified_by` (user who scored)

## Output format
Produce as structured markdown with the scoring rubric, routing logic, and CRM field mapping tables.
