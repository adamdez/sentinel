import { describe, expect, it } from "vitest";
import { importTinaReviewerTraffic } from "@/tina/lib/reviewer-traffic-import";

describe("importTinaReviewerTraffic", () => {
  it("imports JSON reviewer traffic envelopes", () => {
    const imported = importTinaReviewerTraffic({
      format: "json",
      content: JSON.stringify({
        overrides: [
          {
            id: "override-1",
            targetType: "tax_adjustment",
            targetId: "tax-1",
            severity: "material",
            reason: "Owner draw moved out of expense.",
            beforeState: "deductible expense",
            afterState: "owner distribution",
            lesson: "Separate owner flows before deduction logic.",
            sourceDocumentIds: ["doc-1"],
            decidedAt: "2026-04-07T18:00:00.000Z",
          },
        ],
        outcomes: [
          {
            id: "outcome-1",
            title: "Owner draw review",
            phase: "tax_review",
            verdict: "revised",
            targetType: "tax_adjustment",
            targetId: "tax-1",
            summary: "Reviewer revised owner-flow treatment.",
            lessons: ["Owner-flow needs stronger numeric support."],
            caseTags: ["messy_books", "schedule_c"],
            overrideIds: ["override-1"],
            decidedAt: "2026-04-07T18:05:00.000Z",
          },
        ],
      }),
      defaultDecidedBy: "reviewer-1",
    });

    expect(imported.warnings).toEqual([]);
    expect(imported.overrides[0]?.id).toBe("override-1");
    expect(imported.outcomes[0]?.id).toBe("outcome-1");
    expect(imported.outcomes[0]?.caseTags).toEqual(["messy_books", "schedule_c"]);
    expect(imported.outcomes[0]?.decidedBy).toBe("reviewer-1");
  });

  it("imports CSV reviewer traffic batches with outcomes and overrides", () => {
    const header = [
      "recordType",
      "targetType",
      "targetId",
      "severity",
      "reason",
      "beforeState",
      "afterState",
      "lesson",
      "sourceDocumentIds",
      "decidedAt",
      "title",
      "phase",
      "verdict",
      "summary",
      "lessons",
      "caseTags",
      "overrideIds",
    ].join(",");
    const overrideRow = [
      "override",
      "tax_adjustment",
      "tax-1",
      "blocking",
      "Reviewer blocked the treatment",
      "ordinary expense",
      "owner flow",
      "Separate owner flows first",
      "doc-1|doc-2",
      "2026-04-07T19:00:00.000Z",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ].join(",");
    const outcomeRow = [
      "outcome",
      "tax_adjustment",
      "tax-1",
      "",
      "",
      "",
      "",
      "",
      "",
      "2026-04-07T19:05:00.000Z",
      "Owner flow follow-up",
      "tax_review",
      "rejected",
      "Rejected pending better proof",
      "Owner-flow needs line-level proof|Do not auto-carry distributions",
      "messy_books|schedule_c",
      "override-1",
    ].join(",");
    const imported = importTinaReviewerTraffic({
      format: "csv",
      defaultDecidedBy: "reviewer-2",
      content: [header, overrideRow, outcomeRow].join("\n"),
    });

    expect(imported.warnings).toEqual([]);
    expect(imported.overrides).toHaveLength(1);
    expect(imported.outcomes).toHaveLength(1);
    expect(imported.overrides[0]?.sourceDocumentIds).toEqual(["doc-1", "doc-2"]);
    expect(imported.outcomes[0]?.lessons).toContain("Owner-flow needs line-level proof");
    expect(imported.outcomes[0]?.caseTags).toEqual(["messy_books", "schedule_c"]);
    expect(imported.outcomes[0]?.decidedBy).toBe("reviewer-2");
  });

  it("warns and skips malformed rows instead of inventing records", () => {
    const imported = importTinaReviewerTraffic({
      format: "csv",
      content: [
        "recordType,targetType,targetId,severity,phase,verdict",
        "override,tax_adjustment,,blocking,,",
        "outcome,tax_adjustment,tax-1,,tax_review,",
      ].join("\n"),
    });

    expect(imported.overrides).toHaveLength(0);
    expect(imported.outcomes).toHaveLength(0);
    expect(imported.warnings).toHaveLength(2);
  });
});
