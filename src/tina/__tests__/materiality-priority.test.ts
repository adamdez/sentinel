import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaMaterialityPriority } from "@/tina/lib/materiality-priority";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("materiality-priority", () => {
  it("pushes start-path blockers and weak evidence to the front of the queue", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaMaterialityPriority({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Priority LLC",
        taxYear: "2025",
        entityType: "multi_member_llc",
        ownerCount: 2,
        ownershipChangedDuringYear: true,
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
      },
      documents: [
        {
          id: "doc-bank",
          name: "bank-statement.pdf",
          size: 90,
          mimeType: "application/pdf",
          storagePath: "tina/bank-statement.pdf",
          category: "supporting_document",
          requestId: "bank-statements",
          requestLabel: "Bank statements",
          uploadedAt: "2026-04-02T12:05:00.000Z",
        },
      ],
      reviewerFinal: {
        ...base.reviewerFinal,
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts",
            amount: 12000,
            status: "ready",
            summary: "Income line from thin support.",
            sourceDocumentIds: ["doc-bank"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 12000,
            status: "ready",
            summary: "Thin proof mapping.",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-bank"],
          },
        ],
        notes: [],
      },
    });

    expect(snapshot.overallStatus).toBe("immediate_action");
    expect(
      snapshot.items.some((item) => item.source === "start_path" && item.priority === "immediate")
    ).toBe(true);
    expect(
      snapshot.items.some((item) => item.source === "evidence" && item.priority === "next")
    ).toBe(true);
    expect(
      snapshot.items.filter((item) => item.priority === "immediate").length
    ).toBeLessThanOrEqual(4);
    expect(
      snapshot.items.some((item) => item.source === "package" && item.priority === "immediate")
    ).toBe(true);
  });

  it("collapses dirty-books urgency into a narrow immediate queue", () => {
    const snapshot = buildTinaMaterialityPriority(TINA_SKILL_REVIEW_DRAFTS["dirty-books"]);

    expect(snapshot.items.filter((item) => item.priority === "immediate")).toHaveLength(4);
    expect(
      snapshot.items.some(
        (item) =>
          item.priority === "immediate" &&
          /core expense reconstruction|entity-boundary reconstruction|fixed-asset reconstruction/i.test(
            item.title
          )
      )
    ).toBe(true);
  });
});
