import { describe, expect, it } from "vitest";
import { buildTinaPacketComparison } from "@/tina/lib/packet-comparison";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("packet comparison", () => {
  it("recognizes when the saved and live packets match", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
      },
    };

    const comparison = buildTinaPacketComparison(draft, draft);

    expect(comparison.tone).toBe("same");
    expect(comparison.items).toHaveLength(0);
  });

  it("calls out calmer live packets with specific changes", () => {
    const savedDraft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "needs_review" as const,
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "stale" as const,
      },
    };

    const liveDraft = {
      ...savedDraft,
      packageReadiness: {
        ...savedDraft.packageReadiness,
        level: "ready_for_cpa" as const,
      },
      cpaHandoff: {
        ...savedDraft.cpaHandoff,
        status: "complete" as const,
      },
      officialFormPacket: {
        ...savedDraft.officialFormPacket,
        status: "complete" as const,
        forms: [
          {
            id: "schedule-c",
            title: "Schedule C",
            taxYear: "2025",
            status: "ready" as const,
            summary: "Ready",
            nextStep: "None",
            lines: [],
          },
        ],
      },
    };

    const comparison = buildTinaPacketComparison(savedDraft, liveDraft);

    expect(comparison.tone).toBe("calmer");
    expect(comparison.items.some((item) => item.id === "package-level")).toBe(true);
    expect(comparison.items.some((item) => item.id === "official-forms")).toBe(true);
  });
});
