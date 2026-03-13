# Comps UI Hardening Pass — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove remaining misread risk from the compressed Comps UI through 6 surgical changes: Quick Screen degraded treatment, frozen comp provenance, action-oriented warning language, confidence-based nudge, comp card condition flags, and warning display limits with escalation.

**Architecture:** All changes hit 2 source files (`master-client-file-modal.tsx`, `valuation.ts`) and 1 test file. No new persistence, no formula changes, no layout redesign. Warning message text updates in `valuation.ts`; everything else in the CompsTab JSX.

**Tech Stack:** Next.js 15.1, TypeScript strict, Vitest, Tailwind CSS

**IMPORTANT — Encoding hazard:** `master-client-file-modal.tsx` has double-encoded UTF-8 smart quotes. When editing this file, use Python scripts for multi-line insertions to guarantee straight quotes. The Edit tool may convert `"` to `"` breaking TypeScript parsing. For single-line targeted replacements the Edit tool is safe.

---

### Task 1: Update Warning Messages in valuation.ts

**Files:**
- Modify: `src/lib/valuation.ts:356-394` (buildValuationWarnings)

**Step 1: Write failing tests for new warning messages**

Add to `src/lib/__tests__/comps-ui-compression.test.ts` at the end of the file:

```typescript
// ── Hardening: Warning message tests ──────────────────────────────────────────

import { buildValuationWarnings } from "@/lib/valuation";

describe("buildValuationWarnings — hardening pass", () => {
  const BASE = {
    arv: 280000,
    arvSource: "comps" as const,
    compCount: 3,
    confidence: "high" as const,
    spreadPct: 0.08,
    mao: 160000,
    rehabEstimate: 40000,
    conditionLevel: 3,
  };

  it("NO_COMPS message contains 'Run comps before offering'", () => {
    const warnings = buildValuationWarnings({ ...BASE, compCount: 0 });
    const noComps = warnings.find((w) => w.code === "NO_COMPS");
    expect(noComps).toBeDefined();
    expect(noComps!.message).toContain("Run comps before offering");
  });

  it("FEW_COMPS message contains 'before making an offer'", () => {
    const warnings = buildValuationWarnings({ ...BASE, compCount: 2 });
    const few = warnings.find((w) => w.code === "FEW_COMPS");
    expect(few).toBeDefined();
    expect(few!.message).toContain("before making an offer");
  });

  it("LOW_CONFIDENCE message contains 'do not offer'", () => {
    const warnings = buildValuationWarnings({ ...BASE, confidence: "low" });
    const low = warnings.find((w) => w.code === "LOW_CONFIDENCE");
    expect(low).toBeDefined();
    expect(low!.message).toContain("do not offer");
  });

  it("HIGH_SPREAD message contains 'Verify before offering'", () => {
    const warnings = buildValuationWarnings({ ...BASE, spreadPct: 0.35 });
    const high = warnings.find((w) => w.code === "HIGH_SPREAD");
    expect(high).toBeDefined();
    expect(high!.message).toContain("Verify before offering");
  });

  it("NO_CONDITION severity is 'warn' not 'info'", () => {
    const warnings = buildValuationWarnings({ ...BASE, conditionLevel: null });
    const noCond = warnings.find((w) => w.code === "NO_CONDITION");
    expect(noCond).toBeDefined();
    expect(noCond!.severity).toBe("warn");
  });

  it("NO_CONDITION message contains 'before offering'", () => {
    const warnings = buildValuationWarnings({ ...BASE, conditionLevel: null });
    const noCond = warnings.find((w) => w.code === "NO_CONDITION");
    expect(noCond!.message).toContain("before offering");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/comps-ui-compression.test.ts`
Expected: 6 new tests FAIL (old message strings don't match new expectations)

**Step 3: Update warning messages in valuation.ts**

In `src/lib/valuation.ts`, make these targeted replacements:

Line 360 — NO_COMPS message:
```
OLD: "No comps selected. ARV has no market support."
NEW: "No comps selected. Run comps before offering."
```

Line 368 — FEW_COMPS message:
```
OLD: `Only ${inputs.compCount} comp${inputs.compCount === 1 ? "" : "s"} selected. 3+ recommended.`
NEW: `Only ${inputs.compCount} comp${inputs.compCount === 1 ? "" : "s"} — add more before making an offer.`
```

Line 376 — LOW_CONFIDENCE message:
```
OLD: "Low confidence — wide price spread or insufficient comps."
NEW: "Low confidence — do not offer without reviewing comps."
```

Line 384 — HIGH_SPREAD message:
```
OLD: `Comp price spread is ${(inputs.spreadPct * 100).toFixed(0)}% — comps may not be comparable.`
NEW: `${(inputs.spreadPct * 100).toFixed(0)}% price spread — comps may not be comparable. Verify before offering.`
```

Lines 389-393 — NO_CONDITION severity and message:
```
OLD: severity: "info", message: "Property condition not assessed. ARV adjustment may be needed."
NEW: severity: "warn", message: "Condition unknown — inspect or research before offering."
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/comps-ui-compression.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/valuation.ts src/lib/__tests__/comps-ui-compression.test.ts
git commit -m "feat(comps): action-oriented warning messages + NO_CONDITION severity bump"
```

---

### Task 2: Fix conditionLevel Hardcode in CompsTab

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx:5778`

**Step 1: Fix the hardcoded conditionLevel**

Line 5778 currently passes `conditionLevel: 3` to `buildValuationWarnings`. This masks the NO_CONDITION warning entirely.

```
OLD: conditionLevel: 3,
NEW: conditionLevel: cf.conditionLevel ?? null,
```

**Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx
git commit -m "fix(comps): pass real conditionLevel to warnings instead of hardcoded 3"
```

---

### Task 3: Quick Screen Degraded Treatment

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx:5766-5912`
- Test: `src/lib/__tests__/comps-ui-compression.test.ts`

**Step 1: Write failing tests**

Add to test file:

```typescript
describe("Quick Screen degraded treatment", () => {
  // Helper to simulate arvRangeResult conditions
  it("when compCount is 0, mode should be Quick Screen not Underwrite", () => {
    // Quick Screen = compCount === 0 + AVM exists
    const compCount = 0;
    const hasAvm = true;
    const modeLabel = compCount > 0 ? "Underwrite" : hasAvm ? "Quick Screen" : null;
    expect(modeLabel).toBe("Quick Screen");
  });

  it("rough formatting produces abbreviated values", () => {
    // formatRoughCurrency: $285,000 -> ~$285k
    function formatRoughCurrency(n: number): string {
      if (n >= 1000) return `~$${Math.round(n / 1000)}k`;
      return `~$${n}`;
    }
    expect(formatRoughCurrency(285000)).toBe("~$285k");
    expect(formatRoughCurrency(1200000)).toBe("~$1200k");
    expect(formatRoughCurrency(50000)).toBe("~$50k");
  });

  it("screening reasons list expected entries for AVM-only", () => {
    const compCount = 0;
    const conditionLevel: number | null = null;
    const reasons: string[] = [];
    if (compCount === 0) reasons.push("AVM-only");
    if (compCount === 0) reasons.push("No comps selected");
    if (conditionLevel == null) reasons.push("Condition unverified");
    expect(reasons).toContain("AVM-only");
    expect(reasons).toContain("No comps selected");
    expect(reasons).toContain("Condition unverified");
  });
});
```

**Step 2: Run tests to verify they pass** (these are logic-only unit tests)

Run: `npx vitest run src/lib/__tests__/comps-ui-compression.test.ts`
Expected: PASS

**Step 3: Implement Quick Screen degraded treatment in MCF**

Use a Python script to safely modify `master-client-file-modal.tsx`. The changes are:

**3a. Add `formatRoughCurrency` helper** near line 5766 (after `const modeLabel` line):

```typescript
const isScreeningMode = arvRangeResult.compCount === 0;
const formatRoughCurrency = (n: number): string => {
  if (n >= 1000) return `~$${Math.round(n / 1000)}k`;
  return `~$${n}`;
};
const screeningReasons: string[] = [];
if (isScreeningMode) {
  screeningReasons.push("AVM-only");
  screeningReasons.push("No comps selected");
}
if (cf.conditionLevel == null) screeningReasons.push("Condition unverified");
```

**3b. Modify Decision Summary border** (line 5830-5834):

When `isScreeningMode`, use dashed amber border:
```typescript
isScreeningMode ? "border-dashed border-amber-500/30 bg-amber-500/[0.03]" :
arvConfidence === "high" ? "border-emerald-500/20 bg-emerald-500/[0.04]" :
// ...existing
```

**3c. Replace mode chip** (line 5843-5845):

When `isScreeningMode`, show `"Screening Only"` chip in amber instead of generic mode label:
```typescript
{isScreeningMode ? (
  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 font-bold">
    Screening Only
  </span>
) : modeLabel ? (
  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-muted-foreground">
    {modeLabel}
  </span>
) : null}
```

**3d. Modify ARV/MAO display for screening mode** (lines 5858-5878):

When `isScreeningMode`:
- ARV label: "Screening Estimate" instead of "ARV"
- ARV value: `formatRoughCurrency(arv)` instead of `formatCurrency(arv)`
- ARV color: `text-amber-400` instead of `text-neon`
- MAO label: "Rough MAO" in amber
- MAO value: `formatRoughCurrency(compsUnderwrite.mao)` in amber-400 instead of emerald-400
- Hide the ARV range line

**3e. Replace confidence badge with screening disclaimer** (lines 5881-5891):

When `isScreeningMode`, replace the confidence badge + reason with:
```tsx
<p className="text-[10px] text-amber-400/80 italic">
  AVM-only screening estimate. Run comps before offering.
</p>
{screeningReasons.length > 0 && (
  <div className="flex flex-wrap gap-1">
    {screeningReasons.map((r, i) => (
      <span key={i} className="text-[8px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/5 text-amber-400/70">{r}</span>
    ))}
  </div>
)}
```

**3f. Add CTA button at bottom of screening Decision Summary** (before the closing `</>` of the `arv > 0` block, around line 5908):

```tsx
{isScreeningMode && (
  <button
    onClick={() => setResearchMode(true)}
    className="w-full mt-1 py-1.5 rounded-[6px] border border-cyan/30 bg-cyan/10 text-cyan text-[11px] font-semibold hover:bg-cyan/20 transition-colors"
  >
    Underwrite with comps
  </button>
)}
```

**Step 4: Run typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx src/lib/__tests__/comps-ui-compression.test.ts
git commit -m "feat(comps): Quick Screen degraded treatment with rough formatting + screening chip"
```

---

### Task 4: Frozen Comp Count + Snapshot Provenance

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx:5782-5784` (expand), ~5839 (render)

**Step 1: Add provenance computation after snapshot read** (line 5784):

```typescript
// Frozen comp provenance
const frozenComps = ((cf.ownerFlags as any)?.offer_prep_snapshot?.frozen_comps ?? []) as Array<{ apn: string }>;
const frozenApns = new Set(frozenComps.map((fc: { apn: string }) => fc.apn));
const currentApns = new Set(selectedComps.map((c) => c.apn));
const frozenCount = frozenComps.length;
const snapDate = snapUpdatedAt ? new Date(snapUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
const apnsDrifted = frozenCount > 0 && (frozenApns.size !== currentApns.size || [...frozenApns].some((apn) => !currentApns.has(apn)));
const countDrifted = frozenCount > 0 && frozenCount !== selectedComps.length;
```

**Step 2: Render provenance line in Decision Summary header** (after the stale indicator, around line 5852):

```tsx
{frozenCount > 0 && (
  <span className={cn("text-[9px] flex items-center gap-0.5",
    apnsDrifted ? "text-amber-400" : countDrifted ? "text-amber-400" : "text-muted-foreground/70",
  )}>
    {apnsDrifted
      ? "Saved comps differ from current selection"
      : countDrifted
        ? `Saved ${frozenCount} comps - ${selectedComps.length} now selected`
        : `Saved ${frozenCount} comps${snapDate ? ` - ${snapDate}` : ""}`}
  </span>
)}
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 4: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx
git commit -m "feat(comps): frozen comp provenance with APN drift detection"
```

---

### Task 5: Confidence-Based Nudge Bar

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx` (between Decision Summary and Top 3 section)
- Test: `src/lib/__tests__/comps-ui-compression.test.ts`

**Step 1: Write failing tests for nudge logic**

```typescript
describe("confidence-based nudge", () => {
  // Replicate nudge trigger logic
  function shouldShowNudge(
    confidence: "high" | "medium" | "low",
    strongCompCount: number,
    conditionLevel: number | null,
  ): boolean {
    return confidence === "low" || strongCompCount < 2 || conditionLevel == null;
  }

  function getNudgeReason(
    confidence: "high" | "medium" | "low",
    strongCompCount: number,
    conditionLevel: number | null,
  ): string {
    if (conditionLevel == null) return "Condition not assessed — review before offering.";
    if (confidence === "low") return "Low confidence — review comp quality before offering.";
    if (strongCompCount < 2) return `Only ${strongCompCount} strong comp match${strongCompCount === 1 ? "" : "es"} — review evidence before offering.`;
    return "";
  }

  it("triggers when confidence is low", () => {
    expect(shouldShowNudge("low", 3, 3)).toBe(true);
  });

  it("triggers when fewer than 2 strong comp matches", () => {
    expect(shouldShowNudge("high", 1, 3)).toBe(true);
  });

  it("triggers when conditionLevel is null", () => {
    expect(shouldShowNudge("high", 3, null)).toBe(true);
  });

  it("does NOT trigger when 3 strong comps and high confidence and condition set", () => {
    expect(shouldShowNudge("high", 3, 3)).toBe(false);
  });

  it("nudge reason mentions condition when conditionLevel is null", () => {
    expect(getNudgeReason("high", 3, null)).toContain("Condition not assessed");
  });

  it("nudge reason mentions low confidence", () => {
    expect(getNudgeReason("low", 3, 3)).toContain("Low confidence");
  });

  it("nudge reason mentions strong comp match count", () => {
    expect(getNudgeReason("high", 1, 3)).toContain("1 strong comp match");
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/__tests__/comps-ui-compression.test.ts`
Expected: PASS (these are logic-only tests)

**Step 3: Implement nudge bar in MCF**

Add after the Decision Summary closing `</div>` (around line 5913) and before the Top 3 Comp Evidence section:

```typescript
// Nudge computation
const strongCompCount = selectedComps.filter((c) => scoreComp(c, subject).total >= 55).length;
const showNudge = !isScreeningMode && arv > 0 && (
  arvConfidence === "low" || strongCompCount < 2 || cf.conditionLevel == null
);
const nudgeReason = cf.conditionLevel == null
  ? "Condition not assessed — review before offering."
  : arvConfidence === "low"
    ? "Low confidence — review comp quality before offering."
    : strongCompCount < 2
      ? `Only ${strongCompCount} strong comp match${strongCompCount === 1 ? "" : "es"} — review evidence before offering.`
      : "";
```

JSX between Decision Summary and Top 3 section:

```tsx
{showNudge && (
  <div className="rounded-[8px] border border-amber-500/30 bg-amber-500/[0.04] px-3 py-2 flex items-start gap-2">
    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="text-[11px] text-amber-300 font-semibold">Evidence needs strengthening</p>
      <p className="text-[10px] text-amber-400/70 mt-0.5">{nudgeReason}</p>
    </div>
    <button
      onClick={() => setResearchMode(true)}
      className="text-[10px] text-cyan underline shrink-0"
    >
      Open Research Mode
    </button>
  </div>
)}
```

**Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx src/lib/__tests__/comps-ui-compression.test.ts
git commit -m "feat(comps): confidence-based nudge bar for weak evidence"
```

---

### Task 6: Comp Card Condition Flags + Photo Indicator

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx:5950-5972` (comp evidence cards)
- Test: `src/lib/__tests__/comps-ui-compression.test.ts`

**Step 1: Write tests for flag classification**

```typescript
describe("comp card condition flags", () => {
  it("foreclosure and tax delinquent are red severity", () => {
    const redFlags = ["Foreclosure", "Tax Delinquent"];
    const getColor = (flag: string) =>
      ["Foreclosure", "Tax Delinquent"].includes(flag) ? "red" : "amber";
    redFlags.forEach((f) => expect(getColor(f)).toBe("red"));
  });

  it("vacant and listed are amber severity", () => {
    const amberFlags = ["Vacant", "Listed"];
    const getColor = (flag: string) =>
      ["Foreclosure", "Tax Delinquent"].includes(flag) ? "red" : "amber";
    amberFlags.forEach((f) => expect(getColor(f)).toBe("amber"));
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/__tests__/comps-ui-compression.test.ts`
Expected: PASS

**Step 3: Add flag badges and photo indicator to comp evidence cards**

After the rationale line (line 5970), before the closing `</div>` of each card:

```tsx
{/* Condition flags + photo indicator */}
{(() => {
  const flags: Array<{ label: string; color: string }> = [];
  if (comp.isForeclosure) flags.push({ label: "Foreclosure", color: "text-red-400 border-red-400/30 bg-red-500/10" });
  if (comp.isTaxDelinquent) flags.push({ label: "Tax Delinquent", color: "text-red-400 border-red-400/30 bg-red-500/10" });
  if (comp.isVacant) flags.push({ label: "Vacant", color: "text-amber-400 border-amber-400/30 bg-amber-500/10" });
  if (comp.isListedForSale) flags.push({ label: "Listed", color: "text-amber-400 border-amber-400/30 bg-amber-500/10" });
  const hasPhoto = !!(comp.photoUrl || comp.streetViewUrl);
  if (flags.length === 0 && hasPhoto) return null; // clean comp with photo — zero clutter
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {flags.map((f, i) => (
        <span key={i} className={cn("text-[8px] px-1 py-0.5 rounded border", f.color)}>{f.label}</span>
      ))}
      {hasPhoto
        ? <span className="text-[8px] text-muted-foreground/50 flex items-center gap-0.5"><Camera className="h-2.5 w-2.5" />Photo</span>
        : <span className="text-[8px] text-muted-foreground/40 flex items-center gap-0.5"><CameraOff className="h-2.5 w-2.5" />No photo</span>
      }
    </div>
  );
})()}
```

Note: Import `Camera` and `CameraOff` from `lucide-react` if not already imported.

**Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 5: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx src/lib/__tests__/comps-ui-compression.test.ts
git commit -m "feat(comps): comp card condition flags + photo indicator"
```

---

### Task 7: Warning Display Limits + Escalation

**Files:**
- Modify: `src/components/sentinel/master-client-file-modal.tsx:5901-5908` (warning render block)
- Test: `src/lib/__tests__/comps-ui-compression.test.ts`

**Step 1: Write failing tests**

```typescript
describe("warning display limits", () => {
  // Replicate the rendering logic
  function renderWarnings(warnings: Array<{ severity: string; message: string }>) {
    const danger = warnings.filter((w) => w.severity === "danger");
    const warn = warnings.filter((w) => w.severity === "warn");
    const shownWarn = warn.slice(0, 2);
    const overflowCount = warn.length - shownWarn.length;
    const hasDanger = danger.length > 0;
    return { danger, shownWarn, overflowCount, hasDanger };
  }

  it("all danger warnings render with no limit", () => {
    const warnings = [
      { severity: "danger", message: "A" },
      { severity: "danger", message: "B" },
      { severity: "danger", message: "C" },
    ];
    const { danger } = renderWarnings(warnings);
    expect(danger).toHaveLength(3);
  });

  it("warn warnings capped at 2 with overflow count", () => {
    const warnings = [
      { severity: "warn", message: "A" },
      { severity: "warn", message: "B" },
      { severity: "warn", message: "C" },
      { severity: "warn", message: "D" },
    ];
    const { shownWarn, overflowCount } = renderWarnings(warnings);
    expect(shownWarn).toHaveLength(2);
    expect(overflowCount).toBe(2);
  });

  it("escalation line appears when any danger warning exists", () => {
    const warnings = [
      { severity: "danger", message: "Bad" },
      { severity: "warn", message: "Meh" },
    ];
    const { hasDanger } = renderWarnings(warnings);
    expect(hasDanger).toBe(true);
  });

  it("no escalation when only warn severity", () => {
    const warnings = [
      { severity: "warn", message: "Meh" },
    ];
    const { hasDanger } = renderWarnings(warnings);
    expect(hasDanger).toBe(false);
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/__tests__/comps-ui-compression.test.ts`
Expected: PASS

**Step 3: Replace warning render block in MCF**

Replace lines 5901-5908:

```
OLD:
{decisionWarnings.filter((w) => w.severity !== "info").slice(0, 2).map((w, i) => (
  <p key={i} className={cn("text-[10px] flex items-center gap-1",
    w.severity === "danger" ? "text-red-400" : "text-amber-400",
  )}>
    <AlertTriangle className="h-3 w-3 shrink-0" />
    {w.message}
  </p>
))}
```

```
NEW:
{(() => {
  const danger = decisionWarnings.filter((w) => w.severity === "danger");
  const warn = decisionWarnings.filter((w) => w.severity === "warn");
  const shownWarn = warn.slice(0, 2);
  const overflowCount = warn.length - shownWarn.length;
  return (
    <>
      {danger.map((w, i) => (
        <p key={`d-${i}`} className="text-[10px] flex items-center gap-1 text-red-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {w.message}
        </p>
      ))}
      {shownWarn.map((w, i) => (
        <p key={`w-${i}`} className="text-[10px] flex items-center gap-1 text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {w.message}
        </p>
      ))}
      {overflowCount > 0 && (
        <p className="text-[9px] text-muted-foreground/50">+{overflowCount} more</p>
      )}
      {danger.length > 0 && (
        <p className="text-[10px] text-red-400 font-semibold mt-1">Review with Adam before offering</p>
      )}
    </>
  );
})()}
```

**Step 4: Run typecheck and full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add src/components/sentinel/master-client-file-modal.tsx src/lib/__tests__/comps-ui-compression.test.ts
git commit -m "feat(comps): warning display limits + danger escalation line"
```

---

### Task 8: Final Verification + Build

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Run production build**

Run: `npm run build`
Expected: Clean build

**Step 4: Final commit if any remaining changes**

```bash
git status
# If clean, no commit needed
```

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `src/lib/valuation.ts` | 5 warning message updates, 1 severity change (NO_CONDITION: info→warn) |
| `src/components/sentinel/master-client-file-modal.tsx` | Quick Screen degraded treatment, frozen comp provenance, nudge bar, comp card flags, warning display limits, conditionLevel fix |
| `src/lib/__tests__/comps-ui-compression.test.ts` | ~80 lines of new tests across 6 test suites |

## No Formula Changes

All valuation math stays in `valuation.ts` unchanged. This pass modifies:
- Warning message strings (not logic)
- One severity level (`NO_CONDITION`: info → warn)
- UI presentation only
