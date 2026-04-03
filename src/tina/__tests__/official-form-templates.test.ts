import { describe, expect, it } from "vitest";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { readTinaOfficialFederalFormTemplateAsset } from "@/tina/lib/official-form-templates-server";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("official-form-templates", () => {
  it("returns stored Schedule C family blank forms for the supported lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Template Ready LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
    };

    const snapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);

    expect(snapshot.primaryTemplateId).toBe("f1040sc");
    expect(snapshot.templates.some((template) => template.id === "f1040")).toBe(true);
    expect(snapshot.templates.some((template) => template.id === "f1040sse")).toBe(true);
    expect(snapshot.templates.some((template) => template.id === "f8829")).toBe(true);
    expect(snapshot.templates.some((template) => template.id === "f4562")).toBe(true);
  });

  it("returns the partnership blank return for a wild LLC routed to form 1065", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Two Owners LLC",
        taxYear: "2025",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "doc-1065-fact",
          sourceDocumentId: "doc-1065",
          label: "Return hint",
          value: "Form 1065 draft package",
          confidence: "high" as const,
          capturedAt: "2026-04-02T20:00:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);

    expect(snapshot.primaryTemplateId).toBe("f1065");
    expect(snapshot.templates).toHaveLength(1);
  });

  it("can read the stored primary schedule c blank form bytes", () => {
    const bytes = readTinaOfficialFederalFormTemplateAsset("f1040sc", "2025");

    expect(bytes).not.toBeNull();
    expect(bytes?.[0]).toBe(37); // %
  });
});
