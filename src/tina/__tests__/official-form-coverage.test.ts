import { describe, expect, it } from "vitest";
import {
  buildTinaOfficialFormCoverageGaps,
  canExportTinaOfficialFormPacket,
  getTinaOfficialFormPacketExportReadiness,
} from "@/tina/lib/official-form-coverage";
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

describe("official form export readiness", () => {
  it("returns the IRS year-support reason when the packet tax year is not certified", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2026",
        entityType: "sole_prop",
      },
      officialFormPacket: {
        ...createDefaultTinaWorkspaceDraft().officialFormPacket,
        status: "complete",
        summary: "Built",
        nextStep: "Review it",
        forms: [
          {
            id: "schedule-c-2026",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2026",
            revisionYear: "2026",
            status: "ready",
            summary: "Ready",
            nextStep: "Hand it off",
            lines: [],
            supportSchedules: [],
            relatedNoteIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });

    const readiness = getTinaOfficialFormPacketExportReadiness(draft);

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain("2025");
    expect(readiness.reason).toContain("2026");
    expect(canExportTinaOfficialFormPacket(draft)).toBe(false);
  });

  it("allows export when the packet is complete, ready, and on the certified IRS year", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop",
      },
      officialFormPacket: {
        ...createDefaultTinaWorkspaceDraft().officialFormPacket,
        status: "complete",
        summary: "Built",
        nextStep: "Review it",
        forms: [
          {
            id: "schedule-c-2025",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready",
            summary: "Ready",
            nextStep: "Hand it off",
            lines: [],
            supportSchedules: [],
            relatedNoteIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });

    const readiness = getTinaOfficialFormPacketExportReadiness(draft);

    expect(readiness).toEqual({
      ready: true,
      reason: null,
    });
    expect(canExportTinaOfficialFormPacket(draft)).toBe(true);
  });

  it("returns the IRS watch reason when the latest watch needs review", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop",
      },
      officialFormPacket: {
        ...createDefaultTinaWorkspaceDraft().officialFormPacket,
        status: "complete",
        summary: "Built",
        nextStep: "Review it",
        forms: [
          {
            id: "schedule-c-2025",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready",
            summary: "Ready",
            nextStep: "Hand it off",
            lines: [],
            supportSchedules: [],
            relatedNoteIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });

    const readiness = getTinaOfficialFormPacketExportReadiness(draft, {
      irsAuthorityWatchStatus: {
        level: "needs_review",
        generatedAt: "2026-03-29T04:20:00.000Z",
        checkedCount: 18,
        failedCount: 0,
        changedCount: 1,
        newCount: 0,
        summary: "The latest IRS watch found 1 changed IRS source since the prior stored run.",
        nextStep: "Review the changed sources and recertify Tina's IRS registry before leaning on fresh IRS-facing claims.",
      },
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain("changed IRS source");
    expect(
      canExportTinaOfficialFormPacket(draft, {
        irsAuthorityWatchStatus: {
          level: "needs_review",
          generatedAt: "2026-03-29T04:20:00.000Z",
          checkedCount: 18,
          failedCount: 0,
          changedCount: 1,
          newCount: 0,
          summary: "The latest IRS watch found 1 changed IRS source since the prior stored run.",
          nextStep: "Review the changed sources and recertify Tina's IRS registry before leaning on fresh IRS-facing claims.",
        },
      })
    ).toBe(false);
  });

  it("treats fixed-asset paper clues as a Form 4562 coverage gap even when the organizer missed it", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Fringe Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop",
      },
      sourceFacts: [
        {
          id: "fact-fixed-assets",
          sourceDocumentId: "books-doc",
          label: "Fixed asset clue",
          value: "This paper mentions equipment, depreciation, or other big-purchase treatment.",
          confidence: "medium",
          capturedAt: "2026-03-29T10:55:00.000Z",
        },
      ],
    });

    const gaps = buildTinaOfficialFormCoverageGaps(draft);

    expect(gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "form-4562",
          formNumber: "Form 4562",
        }),
      ])
    );
    expect(gaps.find((gap) => gap.id === "form-4562")?.summary).toContain("Saved papers");
  });
});
