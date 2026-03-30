import { describe, expect, it } from "vitest";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import {
  createTinaWorkspaceDraftFromStoredPacket,
  getTinaWorkspaceDraftFromPreferences,
  getTinaStoredPacketVersionFromPreferences,
  getTinaStoredPacketVersionSummariesFromPreferences,
  loadTinaWorkspaceState,
  saveTinaWorkspaceState,
  TINA_WORKSPACE_PREFERENCES_KEY,
} from "@/tina/lib/server-packet-store";
import { parseTinaStoredPacketVersion } from "@/tina/lib/packet-versions";

describe("server packet store", () => {
  it("finds a saved packet by fingerprint from preferences", () => {
    const preferences = {
      tina_packet_versions_v1: [
        {
          packetId: "TINA-2025-ABCDEFGH",
          packetVersion: "rev-00000000001",
          fingerprint: "00000000001",
          createdAt: "2026-03-27T12:00:00.000Z",
          lastStoredAt: "2026-03-27T12:01:00.000Z",
          workspaceSavedAt: "2026-03-27T11:59:00.000Z",
          origins: ["review_bundle_package"],
          draft: {
            ...createDefaultTinaWorkspaceDraft(),
            profile: {
              ...createDefaultTinaWorkspaceDraft().profile,
              businessName: "Tina Sole Prop",
              taxYear: "2025",
            },
          },
        },
      ],
    };

    const packet = getTinaStoredPacketVersionFromPreferences(preferences, "00000000001");

    expect(packet?.packetId).toBe("TINA-2025-ABCDEFGH");
    expect(packet?.draft.profile.businessName).toBe("Tina Sole Prop");
  });

  it("returns null when the fingerprint does not exist", () => {
    const packet = getTinaStoredPacketVersionFromPreferences({}, "missing");

    expect(packet).toBeNull();
  });

  it("revalidates completed live packet layers from preferences instead of trusting saved output flags", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const preferences = {
      tina_workspace_v1: {
        ...base,
        profile: {
          ...base.profile,
          businessName: "Harbor Beam Studio LLC",
          taxYear: "2025",
          entityType: "single_member_llc",
        },
        scheduleCDraft: {
          ...base.scheduleCDraft,
          status: "idle",
          fields: [],
          notes: [],
        },
        packageReadiness: {
          ...base.packageReadiness,
          status: "idle",
          level: "blocked",
          items: [],
        },
        cpaHandoff: {
          ...base.cpaHandoff,
          status: "complete",
          summary: "Forged handoff",
          nextStep: "Ship it",
          artifacts: [
            {
              id: "saved-artifact",
              title: "Saved section",
              status: "ready",
              summary: "Saved section summary",
              includes: ["Saved bullet"],
              relatedFieldIds: [],
              relatedNoteIds: [],
              relatedReadinessItemIds: [],
              sourceDocumentIds: [],
            },
          ],
        },
      },
    };

    const draft = getTinaWorkspaceDraftFromPreferences(preferences);

    expect(draft.cpaHandoff.status).toBe("idle");
    expect(draft.cpaHandoff.artifacts).toHaveLength(0);
  });

  it("clears saved final signoff checks when the live packet fingerprint changed", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const oldDraft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Harbor Beam Studio LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "complete" as const,
        summary: "Reviewer layer ready",
        nextStep: "Build the packet",
        lines: [],
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete" as const,
        summary: "Schedule C ready",
        nextStep: "Build the packet",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready",
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
      cpaHandoff: {
        ...base.cpaHandoff,
        status: "complete" as const,
        summary: "First packet",
        nextStep: "Hand it off",
        artifacts: [
          {
            id: "cpa-cover-note",
            title: "CPA cover note",
            status: "ready" as const,
            summary: "Ready",
            includes: ["Harbor Beam Studio LLC"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    };
    const oldIdentity = buildTinaPacketIdentity(oldDraft);
    const preferences = {
      tina_workspace_v1: {
        ...oldDraft,
        profile: {
          ...oldDraft.profile,
          businessName: "Harbor Beam Studio Holdings LLC",
        },
        finalSignoff: {
          ...base.finalSignoff,
          status: "complete" as const,
          level: "ready" as const,
          summary: "Ready for signoff",
          nextStep: "Confirm it",
          reviewerName: "Ada Reviewer",
          reviewerNote: "Looks good so far.",
          reviewPacketId: oldIdentity.packetId,
          reviewPacketVersion: oldIdentity.packetVersion,
          reviewPacketFingerprint: oldIdentity.fingerprint,
          checks: base.finalSignoff.checks.map((check) => ({
            ...check,
            checked: true,
          })),
        },
      },
    };

    const draft = getTinaWorkspaceDraftFromPreferences(preferences);

    expect(draft.finalSignoff.reviewPacketFingerprint).not.toBe(oldIdentity.fingerprint);
    expect(draft.finalSignoff.checks.every((check) => check.checked === false)).toBe(true);
    expect(draft.finalSignoff.reviewerName).toBe("Ada Reviewer");
  });

  it("surfaces saved review status in packet summaries", () => {
    const preferences = {
      tina_packet_versions_v1: [
        {
          packetId: "TINA-2025-ABCDEFGH",
          packetVersion: "rev-00000000001",
          fingerprint: "00000000001",
          createdAt: "2026-03-27T12:00:00.000Z",
          lastStoredAt: "2026-03-27T12:01:00.000Z",
          workspaceSavedAt: "2026-03-27T11:59:00.000Z",
          origins: ["review_bundle_package"],
          review: {
            decision: "needs_follow_up",
            reviewerName: "Pat Reviewer",
            reviewerNote: "Needs one more pass.",
            reviewedAt: "2026-03-27T12:20:00.000Z",
            events: [],
          },
          draft: {
            ...createDefaultTinaWorkspaceDraft(),
            profile: {
              ...createDefaultTinaWorkspaceDraft().profile,
              businessName: "Tina Sole Prop",
              taxYear: "2025",
            },
          },
        },
      ],
    };

    const summaries = getTinaStoredPacketVersionSummariesFromPreferences(preferences);

    expect(summaries[0]?.reviewDecision).toBe("needs_follow_up");
    expect(summaries[0]?.reviewedAt).toBe("2026-03-27T12:20:00.000Z");
    expect(summaries[0]?.reviewerName).toBe("Pat Reviewer");
  });

  it("can turn one saved packet back into the live workspace draft", () => {
    const packet = parseTinaStoredPacketVersion({
      packetId: "TINA-2025-ABCDEFGH",
      packetVersion: "rev-00000000001",
      fingerprint: "00000000001",
      createdAt: "2026-03-27T12:00:00.000Z",
      lastStoredAt: "2026-03-27T12:01:00.000Z",
      workspaceSavedAt: "2026-03-27T11:59:00.000Z",
      origins: ["review_bundle_package"],
      draft: {
        ...createDefaultTinaWorkspaceDraft(),
        savedAt: "2026-03-27T11:59:00.000Z",
        profile: {
          ...createDefaultTinaWorkspaceDraft().profile,
          businessName: "Tina Sole Prop",
          taxYear: "2025",
        },
      },
    });

    const restored = createTinaWorkspaceDraftFromStoredPacket(
      packet!,
      "2026-03-27T13:00:00.000Z"
    );

    expect(restored.profile.businessName).toBe("Tina Sole Prop");
    expect(restored.savedAt).toBe("2026-03-27T13:00:00.000Z");
  });

  it("retries transient preference-load timeouts before giving up", async () => {
    let selectCalls = 0;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              selectCalls += 1;
              if (selectCalls === 1) {
                return {
                  data: null,
                  error: { message: "upstream request timeout" },
                };
              }

              return {
                data: {
                  preferences: {
                    [TINA_WORKSPACE_PREFERENCES_KEY]: {
                      ...createDefaultTinaWorkspaceDraft(),
                      profile: {
                        ...createDefaultTinaWorkspaceDraft().profile,
                        businessName: "Retried Tina LLC",
                      },
                    },
                  },
                },
                error: null,
              };
            },
          }),
        }),
      }),
    };

    const state = await loadTinaWorkspaceState(sb, "user-1");

    expect(selectCalls).toBe(2);
    expect(state.draft.profile.businessName).toBe("Retried Tina LLC");
  });

  it("retries transient preference-save timeouts before giving up", async () => {
    let selectCalls = 0;
    let updateCalls = 0;
    let lastSavedPreferences: Record<string, unknown> | null = null;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              selectCalls += 1;
              return {
                data: { preferences: {} },
                error: null,
              };
            },
          }),
        }),
        update: ({ preferences }: { preferences: Record<string, unknown> }) => ({
          eq: async () => {
            updateCalls += 1;
            lastSavedPreferences = preferences;

            if (updateCalls === 1) {
              return {
                error: { message: "upstream request timeout" },
              };
            }

            return { error: null };
          },
        }),
      }),
    };

    const saved = await saveTinaWorkspaceState(sb, "user-1", {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Saved After Retry LLC",
      },
    });

    expect(selectCalls).toBe(1);
    expect(updateCalls).toBe(2);
    expect(saved.draft.profile.businessName).toBe("Saved After Retry LLC");
    expect(lastSavedPreferences?.[TINA_WORKSPACE_PREFERENCES_KEY]).toMatchObject({
      profile: expect.objectContaining({
        businessName: "Saved After Retry LLC",
      }),
    });
  });

  it("rejects a stale workspace save when the server already has a newer version", async () => {
    let updateCalls = 0;
    const currentDraft = {
      ...createDefaultTinaWorkspaceDraft(),
      version: 4,
      savedAt: "2026-03-29T16:10:00.000Z",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Fresh Server Draft LLC",
      },
    };
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                preferences: {
                  [TINA_WORKSPACE_PREFERENCES_KEY]: currentDraft,
                },
              },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: async () => {
            updateCalls += 1;
            return { error: null };
          },
        }),
      }),
    };

    const saved = await saveTinaWorkspaceState(sb, "user-1", {
      ...createDefaultTinaWorkspaceDraft(),
      version: 3,
      savedAt: "2026-03-29T16:05:00.000Z",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Older Browser Draft LLC",
      },
    });

    expect(updateCalls).toBe(0);
    expect(saved.saveAccepted).toBe(false);
    expect(saved.draft.version).toBe(4);
    expect(saved.draft.profile.businessName).toBe("Fresh Server Draft LLC");
  });

  it("increments the server-owned workspace version when a save is accepted", async () => {
    let lastSavedPreferences: Record<string, unknown> | null = null;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                preferences: {
                  [TINA_WORKSPACE_PREFERENCES_KEY]: {
                    ...createDefaultTinaWorkspaceDraft(),
                    version: 2,
                    savedAt: "2026-03-29T16:10:00.000Z",
                  },
                },
              },
              error: null,
            }),
          }),
        }),
        update: ({ preferences }: { preferences: Record<string, unknown> }) => ({
          eq: async () => {
            lastSavedPreferences = preferences;
            return { error: null };
          },
        }),
      }),
    };

    const saved = await saveTinaWorkspaceState(sb, "user-1", {
      ...createDefaultTinaWorkspaceDraft(),
      version: 2,
      savedAt: "2026-03-29T16:10:00.000Z",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Accepted Save LLC",
      },
    });

    expect(saved.saveAccepted).toBe(true);
    expect(saved.draft.version).toBe(3);
    expect(saved.draft.profile.businessName).toBe("Accepted Save LLC");
    expect(lastSavedPreferences?.[TINA_WORKSPACE_PREFERENCES_KEY]).toMatchObject({
      version: 3,
      profile: expect.objectContaining({
        businessName: "Accepted Save LLC",
      }),
    });
  });
});
