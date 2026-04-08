import { describe, expect, it } from "vitest";
import {
  collectTinaReviewerLessons,
  createDefaultTinaReviewerOutcomeMemory,
  createTinaReviewerOutcomeRecord,
  createTinaReviewerOverrideRecord,
  findTinaReviewerPatternScore,
  ingestTinaReviewerTraffic,
  upsertTinaReviewerOutcomeMemory,
} from "@/tina/lib/reviewer-outcomes";

describe("reviewer outcome memory", () => {
  it("starts empty with guidance for the next reviewer step", () => {
    const memory = createDefaultTinaReviewerOutcomeMemory();

    expect(memory.outcomes).toEqual([]);
    expect(memory.overrides).toEqual([]);
    expect(memory.summary).toContain("has not saved");
  });

  it("upserts overrides and outcomes while rebuilding summary state", () => {
    const override = createTinaReviewerOverrideRecord({
      targetType: "tax_adjustment",
      targetId: "tax-adjustment-1",
      severity: "material",
      reason: "Reviewer changed owner draw treatment.",
      beforeState: "Treated as deductible expense",
      afterState: "Moved to owner distribution bucket",
      lesson: "Owner draws must never flow into deductible expense totals.",
      sourceDocumentIds: ["doc-1"],
      decidedAt: "2026-04-06T20:15:00.000Z",
      decidedBy: "reviewer-1",
    });
    const outcome = createTinaReviewerOutcomeRecord({
      title: "Owner draw treatment review",
      phase: "tax_review",
      verdict: "revised",
      targetType: "tax_adjustment",
      targetId: "tax-adjustment-1",
      summary: "Reviewer revised Tina's treatment for owner draws.",
      lessons: ["Owner-flow characterization needs stronger numeric support."],
      caseTags: ["messy_books", "schedule_c"],
      overrideIds: [override.id],
      decidedAt: "2026-04-06T20:16:00.000Z",
      decidedBy: "reviewer-1",
    });

    const memory = upsertTinaReviewerOutcomeMemory(
      createDefaultTinaReviewerOutcomeMemory(),
      {
        override,
        outcome,
      }
    );

    expect(memory.overrides).toHaveLength(1);
    expect(memory.outcomes).toHaveLength(1);
    expect(memory.updatedAt).toBe("2026-04-06T20:16:00.000Z");
    expect(memory.summary).toContain("1 saved reviewer outcome");
    expect(memory.scorecard.acceptanceScore).toBe(45);
    expect(memory.scorecard.trustLevel).toBe("fragile");
    expect(memory.nextStep).toContain("revised more than accepted");
  });

  it("builds per-pattern acceptance scoring that downstream systems can query", () => {
    const accepted = createTinaReviewerOutcomeRecord({
      title: "Sales tax treatment review",
      phase: "tax_review",
      verdict: "accepted",
      targetType: "tax_adjustment",
      targetId: "tax-adjustment-1",
      summary: "Accepted.",
      lessons: ["Keep strong sales-tax liability proof attached."],
      caseTags: ["clean_books", "schedule_c"],
      overrideIds: [],
      decidedAt: "2026-04-06T20:16:00.000Z",
      decidedBy: "reviewer-1",
    });
    const revised = createTinaReviewerOutcomeRecord({
      title: "Inventory treatment review",
      phase: "tax_review",
      verdict: "revised",
      targetType: "tax_adjustment",
      targetId: "tax-adjustment-2",
      summary: "Revised.",
      lessons: ["Inventory edge cases still need stronger reviewer framing."],
      caseTags: ["messy_books", "schedule_c"],
      overrideIds: [],
      decidedAt: "2026-04-06T20:20:00.000Z",
      decidedBy: "reviewer-1",
    });

    const memory = upsertTinaReviewerOutcomeMemory(
      upsertTinaReviewerOutcomeMemory(createDefaultTinaReviewerOutcomeMemory(), {
        outcome: accepted,
      }),
      {
        outcome: revised,
      }
    );

    const pattern = findTinaReviewerPatternScore(memory, {
      targetType: "tax_adjustment",
      phase: "tax_review",
    });

    expect(pattern).not.toBeNull();
    expect(pattern?.acceptanceScore).toBe(73);
    expect(pattern?.phase).toBe("tax_review");
    expect(pattern?.confidenceImpact).toBe("hold");
    expect(pattern?.lessons).toContain("Keep strong sales-tax liability proof attached.");
    expect(pattern?.lessons).toContain(
      "Inventory edge cases still need stronger reviewer framing."
    );
  });

  it("collects unique lessons from both overrides and outcomes", () => {
    const override = createTinaReviewerOverrideRecord({
      targetType: "schedule_c_field",
      targetId: "line-1",
      severity: "blocking",
      reason: "Numbers were carried too early.",
      beforeState: "Field marked ready",
      afterState: "Field blocked pending tie-out",
      lesson: "Do not mark gross receipts ready before final tie-out.",
      sourceDocumentIds: ["doc-1"],
      decidedAt: "2026-04-06T20:10:00.000Z",
      decidedBy: null,
    });
    const outcome = createTinaReviewerOutcomeRecord({
      title: "Gross receipts review",
      phase: "package",
      verdict: "rejected",
      targetType: "schedule_c_field",
      targetId: "line-1",
      summary: "Reviewer rejected the field as final.",
      lessons: [
        "Do not mark gross receipts ready before final tie-out.",
        "Final-form trust depends on reviewer-visible numeric proof.",
      ],
      caseTags: ["messy_books", "schedule_c"],
      overrideIds: [override.id],
      decidedAt: "2026-04-06T20:20:00.000Z",
      decidedBy: null,
    });

    const memory = upsertTinaReviewerOutcomeMemory(
      createDefaultTinaReviewerOutcomeMemory(),
      {
        override,
        outcome,
      }
    );

    expect(collectTinaReviewerLessons(memory)).toEqual([
      "Do not mark gross receipts ready before final tie-out.",
      "Final-form trust depends on reviewer-visible numeric proof.",
    ]);
  });

  it("ingests higher-volume reviewer traffic in one batch without duplicating saved records", () => {
    const override = createTinaReviewerOverrideRecord({
      targetType: "tax_adjustment",
      targetId: "tax-adjustment-1",
      severity: "material",
      reason: "Reviewer changed owner draw treatment.",
      beforeState: "Treated as deductible expense",
      afterState: "Moved to owner distribution bucket",
      lesson: "Owner draws must never flow into deductible expense totals.",
      sourceDocumentIds: ["doc-1"],
      decidedAt: "2026-04-06T20:15:00.000Z",
      decidedBy: "reviewer-1",
    });
    const outcomes = [
      createTinaReviewerOutcomeRecord({
        title: "Owner draw treatment review",
        phase: "tax_review",
        verdict: "revised",
        targetType: "tax_adjustment",
        targetId: "tax-adjustment-1",
        summary: "Reviewer revised Tina's treatment for owner draws.",
        lessons: ["Owner-flow characterization needs stronger numeric support."],
        caseTags: ["messy_books", "schedule_c"],
        overrideIds: [override.id],
        decidedAt: "2026-04-06T20:16:00.000Z",
        decidedBy: "reviewer-1",
      }),
      createTinaReviewerOutcomeRecord({
        title: "Payroll treatment review",
        phase: "tax_review",
        verdict: "accepted",
        targetType: "tax_adjustment",
        targetId: "tax-adjustment-2",
        summary: "Accepted.",
        lessons: ["Keep payroll flows explicit."],
        caseTags: ["schedule_c"],
        overrideIds: [],
        decidedAt: "2026-04-06T20:17:00.000Z",
        decidedBy: "reviewer-1",
      }),
    ];

    const memory = ingestTinaReviewerTraffic(createDefaultTinaReviewerOutcomeMemory(), {
      overrides: [override],
      outcomes,
    });
    const deduped = ingestTinaReviewerTraffic(memory, {
      overrides: [override],
      outcomes: [outcomes[0]],
    });

    expect(deduped.overrides).toHaveLength(1);
    expect(deduped.outcomes).toHaveLength(2);
    expect(deduped.updatedAt).toBe("2026-04-06T20:17:00.000Z");
    expect(deduped.scorecard.totalOutcomes).toBe(2);
  });
});
