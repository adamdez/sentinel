import { describe, expect, it } from "vitest";
import { buildTinaArtifactManifest } from "@/tina/lib/artifact-manifest";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaArtifactManifest", () => {
  it("summarizes ready packet files when the handoff is steady", () => {
    const defaults = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...defaults,
      profile: {
        ...defaults.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      packageReadiness: {
        ...defaults.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready for CPA handoff.",
        nextStep: "Hand it to a reviewer.",
      },
      cpaHandoff: {
        ...defaults.cpaHandoff,
        status: "complete" as const,
        summary: "Packet ready.",
        nextStep: "Share it.",
        artifacts: [
          {
            id: "source-paper-index",
            title: "Source paper index",
            status: "ready" as const,
            summary: "Ready",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
          {
            id: "open-items-list",
            title: "Open items list",
            status: "ready" as const,
            summary: "Ready",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
          {
            id: "official-form-packet",
            title: "Official form packet",
            status: "ready" as const,
            summary: "Ready",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
      officialFormPacket: {
        ...defaults.officialFormPacket,
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Share it.",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C",
            title: "Schedule C",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready" as const,
            summary: "Ready",
            nextStep: "Share it.",
            sourceDocumentIds: [],
            lines: [],
          },
        ],
      },
      finalSignoff: {
        ...defaults.finalSignoff,
        status: "complete" as const,
        level: "ready" as const,
        summary: "Ready",
        nextStep: "Confirm it.",
      },
    };

    const manifest = buildTinaArtifactManifest(draft);
    const pdfItem = manifest.items.find((item) => item.id === "official-form-pdf");
    const bundleItem = manifest.items.find((item) => item.id === "review-bundle-package");

    expect(manifest.blockedCount).toBe(0);
    expect(manifest.waitingCount).toBe(0);
    expect(manifest.readyCount).toBe(manifest.items.length);
    expect(manifest.packetIdentity.packetId).toContain("TINA-2025-");
    expect(pdfItem?.status).toBe("ready");
    expect(bundleItem?.status).toBe("ready");
  });

  it("keeps the packet map honest when signoff or official forms are not ready", () => {
    const defaults = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...defaults,
      finalSignoff: {
        ...defaults.finalSignoff,
        status: "complete" as const,
        level: "blocked" as const,
        summary: "Blocked",
        nextStep: "Fix blockers first.",
      },
      officialFormPacket: {
        ...defaults.officialFormPacket,
        status: "complete" as const,
        summary: "Blocked",
        nextStep: "Fix the blocked lines.",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C",
            title: "Schedule C",
            taxYear: "2025",
            revisionYear: "2025",
            status: "blocked" as const,
            summary: "Blocked",
            nextStep: "Fix it.",
            sourceDocumentIds: [],
            lines: [],
          },
        ],
      },
    };

    const manifest = buildTinaArtifactManifest(draft);
    const bundleItem = manifest.items.find((item) => item.id === "review-bundle-package");
    const htmlItem = manifest.items.find((item) => item.id === "official-form-html");

    expect(bundleItem?.status).toBe("blocked");
    expect(htmlItem?.status).toBe("blocked");
    expect(manifest.blockedCount).toBeGreaterThan(0);
    expect(manifest.summary).toContain("blocked");
  });
});
