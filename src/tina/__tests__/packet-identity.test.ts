import { describe, expect, it } from "vitest";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaPacketIdentity", () => {
  it("stays stable for the same packet content", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Mapped safely.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
    };

    const first = buildTinaPacketIdentity(draft);
    const second = buildTinaPacketIdentity(draft);

    expect(first).toEqual(second);
    expect(first.packetId).toContain("TINA-2025-");
    expect(first.packetVersion).toMatch(/^rev-/);
  });

  it("changes when packet-facing content changes", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      cpaHandoff: {
        ...base.cpaHandoff,
        status: "complete" as const,
        summary: "First packet summary.",
        nextStep: "Hand it off.",
        artifacts: [
          {
            id: "cpa-cover-note",
            title: "CPA cover note",
            status: "ready" as const,
            summary: "Ready",
            includes: ["Open items", "Source papers"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    };

    const first = buildTinaPacketIdentity(draft);
    const changed = buildTinaPacketIdentity({
      ...draft,
      cpaHandoff: {
        ...draft.cpaHandoff,
        summary: "Updated packet summary.",
      },
    });

    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changed.packetId).not.toBe(first.packetId);
  });

  it("does not change when only final signoff review state changes", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      finalSignoff: {
        ...base.finalSignoff,
        status: "complete" as const,
        level: "ready" as const,
        reviewerName: "Ada Reviewer",
        reviewerNote: "Steady packet.",
        checks: base.finalSignoff.checks.map((check) => ({
          ...check,
          checked: true,
        })),
      },
    };

    const first = buildTinaPacketIdentity(draft);
    const changed = buildTinaPacketIdentity({
      ...draft,
      finalSignoff: {
        ...draft.finalSignoff,
        reviewerName: "Ada Reviewer",
        reviewerNote: "Steady packet, different review note.",
        reviewPacketId: first.packetId,
        reviewPacketVersion: first.packetVersion,
        reviewPacketFingerprint: first.fingerprint,
        confirmedAt: "2026-03-27T05:00:00.000Z",
        confirmedPacketId: first.packetId,
        confirmedPacketVersion: first.packetVersion,
        confirmedPacketFingerprint: first.fingerprint,
      },
    });

    expect(changed).toEqual(first);
  });
});
