import { describe, expect, it } from "vitest";
import { buildTinaGuidedShellContract } from "@/tina/lib/guided-shell";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

describe("buildTinaGuidedShellContract", () => {
  it("surfaces a small guided summary from engine outputs", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Simple Shell LLC",
        entityType: "single_member_llc",
        taxYear: "2025",
      },
      priorReturnDocumentId: "prior-doc",
      documents: [
        {
          id: "prior-doc",
          name: "prior-return.pdf",
          size: 1200,
          mimeType: "application/pdf",
          storagePath: "tina/prior-return.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-04-08T08:00:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready",
            summary: "Ready.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["prior-doc"],
          },
        ],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "blocked",
        items: [
          {
            id: "block-1",
            title: "Payroll treatment path missing",
            summary: "Need payroll treatment.",
            severity: "blocking",
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: ["prior-doc"],
          },
        ],
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete",
      },
    });

    const contract = buildTinaGuidedShellContract(draft);

    expect(contract.status).toBe("blocked");
    expect(contract.knownNow.some((item) => item.label === "Business")).toBe(true);
    expect(contract.blocked[0]?.title).toContain("Payroll");
    expect(contract.safeToSendToCpa).toBe(false);
  });
});
