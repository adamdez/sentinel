import { describe, expect, it } from "vitest";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import {
  buildTinaResearchGroundingLines,
  getTinaResearchExecutionProfile,
  normalizeTinaStoredResearchMemo,
} from "@/tina/lib/research-runtime";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("research runtime", () => {
  it("uses a narrower runtime profile for the heavier fringe asset lanes", () => {
    expect(getTinaResearchExecutionProfile("fixed-assets-review")).toEqual(
      expect.objectContaining({
        searchContextSize: "medium",
        researchReasoningEffort: "medium",
        challengeReasoningEffort: "medium",
        researchTimeoutMs: 6 * 60_000,
        challengeTimeoutMs: 6 * 60_000,
      })
    );

    expect(getTinaResearchExecutionProfile("wa-state-review")).toEqual(
      expect.objectContaining({
        searchContextSize: "medium",
        researchReasoningEffort: "medium",
        challengeReasoningEffort: "medium",
        researchTimeoutMs: 5 * 60_000,
        challengeTimeoutMs: 6 * 60_000,
      })
    );
  });

  it("clips stored research memos to Tina's calm saved-length ceiling", () => {
    const memo = normalizeTinaStoredResearchMemo({
      summary: "This is the short Tina summary.",
      memo: "A".repeat(6000),
    });

    expect(memo).toContain("This is the short Tina summary.");
    expect(memo.length).toBeLessThanOrEqual(4800);
    expect(memo.endsWith("...")).toBe(true);
  });

  it("builds grounding lines from linked source facts and saved papers", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Fringe Tina LLC",
        entityType: "single_member_llc" as const,
      },
      documents: [
        {
          id: "books-doc",
          name: "2025-fringe-books.csv",
          size: 1024,
          mimeType: "text/csv",
          storagePath: "tina/books-doc.csv",
          category: "supporting_document" as const,
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-29T11:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "books-doc",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "This looks like the money report Tina can use to start the numbers side of your taxes.",
          nextStep: "Keep going.",
          facts: [],
          detailLines: [],
          rowCount: 12,
          headers: ["Date", "Account", "Description", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-03-29T11:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fixed-asset-fact",
          sourceDocumentId: "books-doc",
          label: "Fixed asset clue",
          value:
            'This paper mentions equipment, depreciation, or other big-purchase treatment. Example: "Equipment: Portable extraction machine package".',
          confidence: "medium" as const,
          capturedAt: "2026-03-29T11:01:00.000Z",
        },
      ],
    };

    const dossier = buildTinaResearchDossiers(draft).find((item) => item.id === "fixed-assets-review");
    expect(dossier).toBeTruthy();

    const groundingLines = buildTinaResearchGroundingLines(draft, dossier!);

    expect(groundingLines).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Fact clue: Fixed asset clue"),
        expect.stringContaining("Portable extraction machine package"),
        expect.stringContaining("Saved paper: 2025-fringe-books.csv"),
      ])
    );
  });

  it("clips long grounding lines while keeping the first saved-paper example", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      sourceFacts: [
        {
          id: "fixed-asset-fact",
          sourceDocumentId: "books-doc",
          label: "Fixed asset clue",
          value:
            'This paper mentions equipment, depreciation, or other big-purchase treatment. Examples: "Equipment: Portable extraction machine package with recovery tank and hose reel" and "Equipment: Floor scrubber attachment kit and replacement battery cart".',
          confidence: "medium" as const,
          capturedAt: "2026-03-29T11:01:00.000Z",
        },
      ],
    };

    const dossier = {
      id: "fixed-assets-review",
      title: "Check big purchases for depreciation options",
      status: "needs_primary_authority" as const,
      summary: "Tina still needs primary authority before this idea can move beyond research.",
      nextStep: "Keep going.",
      authorityPrompt: "Review the authority.",
      discoveryPrompt: "Review the facts.",
      steps: [],
      documentIds: [],
      factIds: ["fixed-asset-fact"],
    };

    const groundingLines = buildTinaResearchGroundingLines(draft, dossier);
    const factLine = groundingLines.find((line) => line.includes("Fact clue: Fixed asset clue"));

    expect(factLine).toContain("Portable extraction machine package");
    expect(factLine).not.toContain("Floor scrubber attachment kit");
    expect(factLine && factLine.length).toBeLessThanOrEqual(180);
  });
});
