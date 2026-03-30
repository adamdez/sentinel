import { describe, expect, it } from "vitest";
import {
  buildTinaFinalSignoff,
  canConfirmTinaFinalSignoff,
  markTinaFinalSignoffStale,
} from "@/tina/lib/final-signoff";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
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

describe("buildTinaFinalSignoff", () => {
  it("blocks signoff when the filing package is still blocked", () => {
    const draft = buildDraft({
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "blocked",
        summary: "Blocked",
        nextStep: "Fix blockers",
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete",
        artifacts: [
          {
            id: "open-items",
            title: "Open items list",
            status: "blocked",
            summary: "Blocked",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });

    const snapshot = buildTinaFinalSignoff(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.summary).toContain("blockers");
  });

  it("becomes ready when the packet is ready and keeps reviewer inputs", () => {
    const base = buildDraft({
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "ready_for_cpa",
        summary: "Ready",
        nextStep: "Hand it off",
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete",
        artifacts: [
          {
            id: "cpa-cover-note",
            title: "CPA cover note",
            status: "ready",
            summary: "Ready",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });
    const identity = buildTinaPacketIdentity(base);
    const draft = {
      ...base,
      finalSignoff: {
        ...createDefaultTinaWorkspaceDraft().finalSignoff,
        reviewerName: "Ada Reviewer",
        reviewerNote: "Looks good so far.",
        reviewPacketId: identity.packetId,
        reviewPacketVersion: identity.packetVersion,
        reviewPacketFingerprint: identity.fingerprint,
        checks: createDefaultTinaWorkspaceDraft().finalSignoff.checks.map((check) => ({
          ...check,
          checked: true,
        })),
      },
    };

    const snapshot = buildTinaFinalSignoff(draft);

    expect(snapshot.level).toBe("ready");
    expect(snapshot.reviewerName).toBe("Ada Reviewer");
    expect(snapshot.reviewPacketFingerprint).toBe(identity.fingerprint);
    expect(canConfirmTinaFinalSignoff(snapshot)).toBe(true);
  });

  it("waits when the official form packet is still waiting in the handoff", () => {
    const draft = buildDraft({
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "ready_for_cpa",
        summary: "Ready",
        nextStep: "Hand it off",
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete",
        artifacts: [
          {
            id: "official-form-packet",
            title: "Official form packet",
            status: "waiting",
            summary: "Still needs a fresh build.",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });

    const snapshot = buildTinaFinalSignoff(draft);

    expect(snapshot.level).toBe("waiting");
    expect(snapshot.summary).toContain("need review");
  });

  it("preserves a confirmation only when it still matches the current packet fingerprint", () => {
    const base = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc",
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "ready_for_cpa",
        summary: "Ready",
        nextStep: "Hand it off",
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete",
        artifacts: [
          {
            id: "cpa-cover-note",
            title: "CPA cover note",
            status: "ready",
            summary: "Ready",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });
    const readySnapshot = buildTinaFinalSignoff(base);
    const reviewReadyDraft = {
      ...base,
      finalSignoff: {
        ...readySnapshot,
        reviewerName: "Ada Reviewer",
        reviewerNote: "Looks good so far.",
        checks: readySnapshot.checks.map((check) => ({
          ...check,
          checked: true,
        })),
      },
    };
    const identity = buildTinaPacketIdentity(reviewReadyDraft);
    const confirmedDraft = {
      ...reviewReadyDraft,
      finalSignoff: {
        ...reviewReadyDraft.finalSignoff,
        reviewPacketId: identity.packetId,
        reviewPacketVersion: identity.packetVersion,
        reviewPacketFingerprint: identity.fingerprint,
        confirmedAt: "2026-03-27T05:00:00.000Z",
        confirmedPacketId: identity.packetId,
        confirmedPacketVersion: identity.packetVersion,
        confirmedPacketFingerprint: identity.fingerprint,
      },
    };

    const preserved = buildTinaFinalSignoff(confirmedDraft);
    const stale = buildTinaFinalSignoff({
      ...confirmedDraft,
      cpaHandoff: {
        ...confirmedDraft.cpaHandoff,
        summary: "Packet changed.",
      },
    });

    expect(preserved.confirmedAt).toBe("2026-03-27T05:00:00.000Z");
    expect(preserved.confirmedPacketFingerprint).toBe(identity.fingerprint);
    expect(stale.confirmedAt).toBeNull();
    expect(stale.confirmedPacketFingerprint).toBeNull();
  });

  it("clears signoff checks when the packet changed under an existing review target", () => {
    const base = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "single_member_llc",
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "ready_for_cpa",
        summary: "Ready",
        nextStep: "Hand it off",
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete",
        summary: "First handoff",
        artifacts: [
          {
            id: "cpa-cover-note",
            title: "CPA cover note",
            status: "ready",
            summary: "Ready",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });
    const identity = buildTinaPacketIdentity(base);

    const snapshot = buildTinaFinalSignoff({
      ...base,
      finalSignoff: {
        ...createDefaultTinaWorkspaceDraft().finalSignoff,
        reviewerName: "Ada Reviewer",
        reviewerNote: "Looks good so far.",
        reviewPacketId: identity.packetId,
        reviewPacketVersion: identity.packetVersion,
        reviewPacketFingerprint: identity.fingerprint,
        checks: createDefaultTinaWorkspaceDraft().finalSignoff.checks.map((check) => ({
          ...check,
          checked: true,
        })),
      },
    });

    const changedSnapshot = buildTinaFinalSignoff({
      ...base,
      cpaHandoff: {
        ...base.cpaHandoff,
        summary: "Changed handoff summary",
      },
      finalSignoff: snapshot,
    });

    expect(changedSnapshot.reviewPacketFingerprint).not.toBe(identity.fingerprint);
    expect(changedSnapshot.checks.every((check) => check.checked === false)).toBe(true);
    expect(changedSnapshot.confirmedAt).toBeNull();
  });
});

describe("markTinaFinalSignoffStale", () => {
  it("clears confirmation when the packet changes", () => {
    const snapshot = markTinaFinalSignoffStale({
      ...createDefaultTinaWorkspaceDraft().finalSignoff,
      status: "complete",
      level: "ready",
      checks: createDefaultTinaWorkspaceDraft().finalSignoff.checks.map((check) => ({
        ...check,
        checked: true,
      })),
      confirmedAt: "2026-03-27T05:00:00.000Z",
    });

    expect(snapshot.status).toBe("stale");
    expect(snapshot.confirmedAt).toBeNull();
    expect(snapshot.confirmedPacketFingerprint).toBeNull();
    expect(snapshot.checks.every((check) => check.checked === false)).toBe(true);
  });
});
