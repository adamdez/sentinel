# Comps UI Hardening Pass — Post-Compression Trust & Speed

**Date:** 2026-03-12
**Depends on:** Comps UI Compression Pass (commit 6a5b0dc)
**Scope:** Surgical trust-and-speed pass. No layout redesign, no new persistence, no formula changes.

---

## Post-Compression Gap Analysis

| # | Gap | Severity | Risk |
|---|-----|----------|------|
| 1 | Quick Screen looks identical to Underwrite | Critical | Operator acts on AVM-only screening estimate as if comp-backed |
| 2 | No frozen comp count or snapshot provenance | Medium | Operator cannot see if saved recommendation drifted from current selection |
| 3 | Warning language is passive, not action-oriented | Medium | Operator reads warning but does not know what to do |
| 4 | No confidence-based nudge for weak evidence | Medium | Decision Summary looks "complete" even when evidence is insufficient |
| 5 | Comp cards hide condition flags | Low-Medium | Foreclosure/vacant comps treated visually like normal sales |
| 6 | Warnings capped at 2, danger warnings can be clipped | Low-Medium | Critical warnings silently hidden |

---

## Change 1: Quick Screen Degraded Treatment

**When:** `arvRangeResult.compCount === 0` (no comps, AVM-only or no data)

**Visual changes:**
- Decision Summary border: dashed amber (`border-dashed border-amber-500/30 bg-amber-500/[0.03]`)
- ARV label: "Screening Estimate" instead of "ARV"
- MAO label: "Rough MAO" in amber-400 instead of "MAO" in emerald-400
- Confidence badge replaced with mode chip: `"Screening Only"` in amber, no high/medium/low
- MAO value rendered in amber-400 instead of emerald-400
- Values use rough formatting: `~$285k` instead of `$285,000` to reduce false precision
- One-line disclaimer below values: *"AVM-only screening estimate. Run comps before offering."*
- Reasons listed: "AVM-only", "No comps selected", "Condition unverified"
- Primary CTA button: **"Underwrite with comps"** (opens Research Mode)

**When Underwrite mode (comps > 0):** No changes. Current behavior preserved.

---

## Change 2: Frozen Comp Count + Snapshot Provenance

**When:** `offer_prep_snapshot` exists in `owner_flags` with `frozen_comps` array

**Display:** Small provenance line in Decision Summary header area:
- Normal: `"Saved 3 comps - Mar 10"`
- Count drift: `"Saved 3 comps - 2 now selected"` (amber)
- APN drift: `"Saved comps differ from current selection"` (amber)
- Comparison logic: extract APN set from `frozen_comps`, compare to current `selectedComps` APNs

**Implementation:** ~15 lines in CompsTab. Read-only from existing JSONB. No new persistence.

---

## Change 3: Action-Oriented Warning Language

**File:** `src/lib/valuation.ts` `buildValuationWarnings()`

| Code | Current | New |
|------|---------|-----|
| `NO_COMPS` | "No comps selected. ARV has no market support." | "No comps selected. Run comps before offering." |
| `FEW_COMPS` | "Only {n} comp(s) selected. 3+ recommended." | "Only {n} comp(s) — add more before making an offer." |
| `LOW_CONFIDENCE` | "Low confidence — wide price spread or insufficient comps." | "Low confidence — do not offer without reviewing comps." |
| `HIGH_SPREAD` | "Comp price spread is {n}% — comps may not be comparable." | "{n}% price spread — comps may not be comparable. Verify before offering." |
| `NO_CONDITION` | "Property condition not assessed. ARV adjustment may be needed." | "Condition unknown — inspect or research before offering." |

**Severity change:** `NO_CONDITION` from `"info"` to `"warn"` so it renders in Decision Summary.

---

## Change 4: Confidence-Based Nudge

**Position:** Between Decision Summary and Top 3 Comp Evidence section.

**Trigger conditions (any one):**
- Confidence is `"low"`
- Fewer than 2 selected comps have `scoreComp().total >= 55`
- `conditionLevel == null` (explicit missing condition, NOT `conditionAdj === 0`)

**Render:** Amber-bordered bar with icon:
```
! Evidence needs strengthening — [Open Research Mode]
```
Sub-line explains why:
- "Only 1 strong comp match — review evidence before offering."
- "Condition not assessed — review before offering."
- "Low confidence — review comp quality before offering."

**When healthy:** Nudge does not render. No clutter on strong valuations.

**Note:** "Strong comp match" refers to scoreComp total >= 55, which reflects distance/recency/size/bed-bath/year match quality — not condition or photo evidence. Wording uses "strong comp match" not "strong comp" to avoid implying full trustworthiness.

---

## Change 5: Comp Card Condition Flags + Photo Indicator

**Comp Evidence Cards** gain a small badge row after the metrics line.

**Condition flags (only rendered when true):**
- Red chips: `Foreclosure`, `Tax Delinquent`
- Amber chips: `Vacant`, `Listed`

**Photo indicator:**
- If `comp.photoUrl` or `comp.streetViewUrl` exists: small Camera icon + "Photo" text
- If neither exists: small CameraOff icon + "No photo" text
- Rendered as explicit text, not an implied quality signal

Chips are 8-9px text, inline. Most comps show nothing — zero clutter for clean comps.

---

## Change 6: Warning Display Limits + Escalation

**Current:** Show max 2 warnings, exclude info severity.

**New rules:**
- Show **all** danger warnings (no limit)
- Show max **2** warn warnings
- If more warn warnings exist beyond 2, show `"+{n} more"` as muted text
- Info warnings still excluded from Decision Summary
- If **any** danger warning is present, append escalation line: **"Review with Adam before offering"** in red-400

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/sentinel/master-client-file-modal.tsx` | Quick Screen treatment, frozen comp provenance, nudge bar, comp card flags, warning display changes |
| `src/lib/valuation.ts` | Warning message text updates, NO_CONDITION severity change |
| `src/lib/__tests__/comps-ui-compression.test.ts` | New tests for all 6 changes |

---

## Tests

1. Quick Screen mode renders "Screening Estimate", "Rough MAO", "Screening Only" chip
2. Quick Screen renders disclaimer text and "Underwrite with comps" CTA
3. Underwrite mode does NOT show screening treatment
4. Warning messages contain action language ("before offering", "do not offer", "Run comps")
5. `NO_CONDITION` severity is `"warn"` not `"info"`
6. `NO_COMPS` message contains "Run comps before offering"
7. Nudge triggers when <2 strong comp matches
8. Nudge triggers when confidence is low
9. Nudge triggers when conditionLevel is null
10. Nudge does NOT trigger when 3+ strong comps and high confidence
11. Comp flags: foreclosure and tax delinquent are red severity
12. Comp flags: vacant and listed are amber severity
13. All danger warnings render (no slice limit)
14. Escalation line appears when any danger warning exists
15. Warn warnings capped at 2 with "+N more" overflow

---

## No Formula Changes

All valuation math stays in `valuation.ts` unchanged. This pass modifies:
- Warning message strings (not logic)
- One severity level (`NO_CONDITION`: info -> warn)
- UI presentation only

---

## Open Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Quick Screen rough formatting (`~$285k`) may confuse operators used to exact numbers | Low | Only applies in screening mode; exact numbers return when comps added |
| Escalation line "Review with Adam" is hardcoded to one person | Low | Acceptable for 2-person team; parameterize later if team grows |
| Nudge bar adds vertical space in weak-evidence scenarios | Negligible | Only appears when evidence IS weak — that's the point |
| Frozen comp APN comparison may have edge cases with re-enriched comps | Low | Compare by APN string which is stable identifier |

---

## Next Recommended Phase

Operator validation: have Logan open 5 live leads and verify:
1. Quick Screen feels clearly preliminary
2. Warnings are actionable
3. Nudge prompts are helpful not annoying
4. Comp flags add context without clutter

Then consider: condition workflow improvements, photo evidence pipeline, research mode streamlining.
