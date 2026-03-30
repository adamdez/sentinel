import { describe, expect, it } from "vitest";
import {
  createTinaStoredPacketVersion,
  parseTinaStoredPacketVersion,
  parseTinaStoredPacketVersions,
  summarizeTinaStoredPacketVersion,
  updateTinaStoredPacketVersionReview,
  upsertTinaStoredPacketVersions,
} from "@/tina/lib/packet-versions";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("packet version history", () => {
  it("stores a packet snapshot with the current identity", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
    };

    const packet = createTinaStoredPacketVersion(
      draft,
      "review_bundle_package",
      "2026-03-27T12:00:00.000Z"
    );
    const identity = buildTinaPacketIdentity(draft);

    expect(packet.packetId).toBe(identity.packetId);
    expect(packet.packetVersion).toBe(identity.packetVersion);
    expect(packet.fingerprint).toBe(identity.fingerprint);
    expect(packet.origins).toEqual(["review_bundle_package"]);
  });

  it("dedupes the same fingerprint and accumulates origins", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
    };

    const first = createTinaStoredPacketVersion(
      draft,
      "review_bundle_package",
      "2026-03-27T12:00:00.000Z"
    );
    const second = createTinaStoredPacketVersion(
      draft,
      "official_form_pdf_export",
      "2026-03-27T12:05:00.000Z"
    );

    const result = upsertTinaStoredPacketVersions([first], second);

    expect(result).toHaveLength(1);
    expect(result[0]?.lastStoredAt).toBe("2026-03-27T12:05:00.000Z");
    expect(result[0]?.origins).toEqual([
      "review_bundle_package",
      "official_form_pdf_export",
    ]);
  });

  it("parses saved packet versions and exposes a summary", () => {
    const parsed = parseTinaStoredPacketVersions([
      {
        packetId: "TINA-2025-ABCDEFGH",
        packetVersion: "rev-00000000001",
        fingerprint: "00000000001",
        createdAt: "2026-03-27T12:00:00.000Z",
        lastStoredAt: "2026-03-27T12:03:00.000Z",
        workspaceSavedAt: "2026-03-27T11:59:00.000Z",
        origins: ["review_packet_html_export"],
        draft: {
          profile: {
            ...createDefaultTinaWorkspaceDraft().profile,
            businessName: "Tina Sole Prop",
            taxYear: "2025",
          },
          packageReadiness: {
            ...createDefaultTinaWorkspaceDraft().packageReadiness,
            summary: "Ready for CPA handoff",
            level: "ready_for_cpa",
          },
          finalSignoff: {
            ...createDefaultTinaWorkspaceDraft().finalSignoff,
            confirmedAt: "2026-03-27T12:01:00.000Z",
          },
        },
      },
    ]);

    expect(parsed).toHaveLength(1);

    const summary = summarizeTinaStoredPacketVersion(parsed[0]!);
    expect(summary.businessName).toBe("Tina Sole Prop");
    expect(summary.packageLevel).toBe("ready_for_cpa");
    expect(summary.confirmedAt).toBe("2026-03-27T12:01:00.000Z");
  });

  it("parses one saved packet snapshot and rejects invalid shapes", () => {
    const parsed = parseTinaStoredPacketVersion({
      packetId: "TINA-2025-ABCDEFGH",
      packetVersion: "rev-00000000001",
      fingerprint: "00000000001",
      createdAt: "2026-03-27T12:00:00.000Z",
      lastStoredAt: "2026-03-27T12:03:00.000Z",
      workspaceSavedAt: "2026-03-27T11:59:00.000Z",
      origins: ["review_bundle_export"],
      draft: {
        profile: {
          ...createDefaultTinaWorkspaceDraft().profile,
          businessName: "Tina Sole Prop",
        },
      },
    });

    expect(parsed?.packetId).toBe("TINA-2025-ABCDEFGH");
    expect(parsed?.draft.profile.businessName).toBe("Tina Sole Prop");
    expect(parseTinaStoredPacketVersion({ packetId: "missing-rest" })).toBeNull();
  });

  it("stores reviewer trail data on saved packets", () => {
    const basePacket = createTinaStoredPacketVersion(
      {
        ...createDefaultTinaWorkspaceDraft(),
        profile: {
          ...createDefaultTinaWorkspaceDraft().profile,
          businessName: "Tina Sole Prop",
          taxYear: "2025",
        },
      },
      "review_bundle_package",
      "2026-03-27T12:00:00.000Z"
    );

    const reviewed = updateTinaStoredPacketVersionReview(basePacket, {
      decision: "approved_for_handoff",
      reviewerName: "Pat Reviewer",
      reviewerNote: "Looks calm enough for handoff.",
      reviewedAt: "2026-03-27T12:10:00.000Z",
    });

    const summary = summarizeTinaStoredPacketVersion(reviewed);
    expect(reviewed.review.events).toHaveLength(1);
    expect(reviewed.review.decision).toBe("approved_for_handoff");
    expect(summary.reviewDecision).toBe("approved_for_handoff");
    expect(summary.reviewerName).toBe("Pat Reviewer");
  });
});
