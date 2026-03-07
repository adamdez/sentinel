# /signal-audit — Distress Signal Detection Audit

Verify that distress signals are being detected, scored, and stored correctly. Signals are the lifeblood of the wholesale business — if detection is broken, the entire pipeline produces garbage.

## What to do

1. **Signal inventory** — Query `distress_events` grouped by:
   - `event_type` — count per type (probate, pre_foreclosure, tax_lien, divorce, bankruptcy, vacant, absentee, code_violation, fsbo, inherited, water_shutoff, condemned, underwater, tired_landlord)
   - `status` — count per status (active, unknown, unverified, expired, resolved)
   - `source` — count per source (propertyradar, attom, crawler, openclaw_*, manual)
   - `created_at` — distribution over time (are new signals being created?)

2. **Detection logic audit** — Read `src/lib/distress-signals.ts` and verify:
   - Every signal type has a detection path that can actually fire
   - The PR fields being checked actually exist in PR API responses (check against Fields=All)
   - The ATTOM fields being checked exist in ATTOM responses
   - Default `daysSinceEvent` values are reasonable (should be recent, not 365/730)
   - Severity assignments are consistent (1-10 scale)

3. **Scoring impact** — For each signal type, compute:
   - Base weight from `scoring.ts` SIGNAL_WEIGHTS
   - Typical severity → multiplier
   - Typical recency decay (using actual daysSinceEvent from DB)
   - Freshness multiplier (based on status distribution)
   - Effective contribution to composite score
   - Flag any signal types that score near zero due to decay or freshness

4. **Ghost signals** — Check for signals that exist but have no impact:
   - Signals with status='resolved' (excluded from scoring)
   - Signals with status='unverified' (freshness=0.6, halved confidence)
   - Very old signals where recency decay → 0
   - Signals on properties with no leads (orphaned)

5. **Missing signals** — Check for properties that SHOULD have signals but don't:
   - Properties with `owner_flags.pr_raw` containing foreclosure data but no pre_foreclosure event
   - Properties with absentee=true in PR data but no absentee event
   - Properties with vacant=true but no vacant event
   - Properties with tax delinquency data but no tax_lien event

6. **Crawler effectiveness** — Check if daily crawlers are producing signals:
   - Query distress_events where source starts with 'court:' or 'crawler:'
   - Are new events being created daily?
   - Are crawler events getting linked to existing properties?

7. **Recommendations** — Specific fixes:
   - Which detection rules need updating
   - Which signal types are over/under-weighted
   - Which data sources should be added
   - Which crawlers need fixing

## Key files
- `src/lib/distress-signals.ts` — Signal detection logic
- `src/lib/scoring.ts` — Signal weights and scoring
- `src/lib/crawlers/` — Daily data crawlers
