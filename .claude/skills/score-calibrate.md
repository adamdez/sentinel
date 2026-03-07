# /score-calibrate — Scoring Engine Calibration Check

Verify the scoring engine is producing reasonable, actionable scores. Bad calibration means agents waste time on low-quality leads or miss hot opportunities.

## What to do

1. **Score distribution** — Query `scoring_records` for the latest score per property:
   - Count by label: platinum (85+), gold (65-84), silver (40-64), bronze (0-39)
   - Histogram of composite scores (buckets of 10)
   - Average score, median score, std deviation
   - What % of scored properties are above MIN_STORE_SCORE (30)?

2. **Score vs data quality correlation** — For each score tier:
   - Average number of distress signals
   - Average number of active (not resolved) signals
   - Most common signal types
   - Average equity percent
   - % with owner phone (contactable)

3. **Recency decay validation** — Check if the decay function is reasonable:
   - DECAY_LAMBDA = 0.015, half-life ≈ 46 days
   - For properties with known filing dates, compute actual daysSinceEvent
   - Are signals decaying too fast (good signals going to zero)?
   - Are stale signals (6+ months) still getting meaningful scores?

4. **Signal weight balance** — For each signal type in SIGNAL_WEIGHTS:
   - How many properties have this signal?
   - What's the average contribution to composite score?
   - Is any signal type dominating all scores? (bad: everything is "absentee")
   - Is any signal type never contributing? (wasted detection)

5. **Combination bonus check** — From COMBINATION_BONUSES:
   - How often does each combo actually fire?
   - Are the bonus amounts meaningful relative to base scores?
   - Are there common combos NOT in the bonus list that should be?

6. **Predictive vs deterministic** — From scoring-predictive.ts:
   - What's the blended heat score distribution?
   - Are predictive scores adding value or just noise?
   - Is the confidence-weighted blend working correctly?

7. **Scoring edge cases** — Check for:
   - Properties scoring 0 despite having signals (decay/freshness killed them)
   - Properties scoring 85+ with only 1 weak signal (inflation)
   - Properties with AI-generated "unverified" signals — are they scoring too high?
   - Absentee-only properties — score should be moderate, not high

8. **Calibration recommendations** — Suggest weight/parameter adjustments:
   - Any SIGNAL_WEIGHTS that should increase/decrease
   - DECAY_LAMBDA adjustment (faster/slower decay)
   - Freshness multiplier adjustments
   - New combination bonuses to add
   - Score cutoff adjustments for labels

## Key files
- `src/lib/scoring.ts` — Deterministic scoring engine
- `src/lib/scoring-predictive.ts` — Predictive scoring
- `src/lib/distress-signals.ts` — Signal detection (severity assignments)
