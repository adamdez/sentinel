import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

const {
  requireAuthMock,
  createServerClientMock,
  loadTinaStoredPacketVersionMock,
  persistTinaPacketVersionMock,
  buildTinaCpaPacketExportMock,
  revalidateTinaCompletedDerivedWorkspaceMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
  loadTinaStoredPacketVersionMock: vi.fn(),
  persistTinaPacketVersionMock: vi.fn(),
  buildTinaCpaPacketExportMock: vi.fn(),
  revalidateTinaCompletedDerivedWorkspaceMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/tina/lib/server-packet-store", () => ({
  loadTinaStoredPacketVersion: loadTinaStoredPacketVersionMock,
  persistTinaPacketVersion: persistTinaPacketVersionMock,
}));

vi.mock("@/tina/lib/cpa-packet-export", () => ({
  buildTinaCpaPacketExport: buildTinaCpaPacketExportMock,
}));

vi.mock("@/tina/lib/reconcile-workspace", () => ({
  revalidateTinaCompletedDerivedWorkspace: revalidateTinaCompletedDerivedWorkspaceMock,
}));

import { POST } from "@/app/api/tina/cpa-packet/export/route";

describe("POST /api/tina/cpa-packet/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    loadTinaStoredPacketVersionMock.mockResolvedValue(null);
    persistTinaPacketVersionMock.mockImplementation(async (_sb, _userId, draft) => ({
      packet: {
        draft,
        review: null,
      },
      packetVersions: [],
    }));
    buildTinaCpaPacketExportMock.mockReturnValue({
      fileName: "tina-cpa-packet.md",
      mimeType: "text/markdown; charset=utf-8",
      contents: "# Tina CPA Review Packet",
    });
    revalidateTinaCompletedDerivedWorkspaceMock.mockImplementation((draft) => draft);
  });

  it("revalidates the provided live draft before persisting the CPA packet export", async () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "idle" as const,
        lines: [],
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "idle" as const,
        fields: [],
        notes: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "idle" as const,
        level: "blocked" as const,
        items: [],
      },
      cpaHandoff: {
        ...base.cpaHandoff,
        status: "complete" as const,
        summary: "Saved handoff summary",
        nextStep: "Use the saved packet.",
        artifacts: [
          {
            id: "saved-artifact",
            title: "Saved section",
            status: "ready" as const,
            summary: "Saved section summary",
            includes: ["Saved bullet"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    };
    const reconciledDraft = {
      ...draft,
      cpaHandoff: {
        ...draft.cpaHandoff,
        summary: "Revalidated handoff summary",
      },
    };

    revalidateTinaCompletedDerivedWorkspaceMock.mockReturnValue(reconciledDraft);

    const req = new NextRequest("http://localhost/api/tina/cpa-packet/export", {
      method: "POST",
      body: JSON.stringify({ draft }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      fileName: "tina-cpa-packet.md",
      mimeType: "text/markdown; charset=utf-8",
      contents: "# Tina CPA Review Packet",
    });
    expect(revalidateTinaCompletedDerivedWorkspaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cpaHandoff: expect.objectContaining({
          status: "complete",
          summary: "Saved handoff summary",
        }),
      })
    );
    expect(persistTinaPacketVersionMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      reconciledDraft,
      "cpa_packet_export"
    );
    expect(buildTinaCpaPacketExportMock).toHaveBeenCalledWith(
      reconciledDraft,
      { packetReview: null }
    );
  });

  it("uses the exact saved packet when a packet fingerprint is provided", async () => {
    const base = createDefaultTinaWorkspaceDraft();
    const savedDraft = {
      ...base,
      cpaHandoff: {
        ...base.cpaHandoff,
        status: "complete" as const,
        summary: "Saved packet handoff summary",
        nextStep: "Use the archived packet.",
        artifacts: [
          {
            id: "saved-packet-artifact",
            title: "Saved packet section",
            status: "ready" as const,
            summary: "Saved packet section summary",
            includes: ["Saved packet bullet"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    };

    loadTinaStoredPacketVersionMock.mockResolvedValue({
      packetId: "TINA-2025-ABCDEFGH",
      packetVersion: "rev-00000000001",
      fingerprint: "00000000001",
      createdAt: "2026-03-28T20:00:00.000Z",
      lastStoredAt: "2026-03-28T20:05:00.000Z",
      workspaceSavedAt: "2026-03-28T20:04:00.000Z",
      origins: ["cpa_packet_export"],
      review: {
        decision: "reference_only" as const,
        reviewerName: "Pat Reviewer",
        reviewerNote: "Saved review note",
        reviewedAt: "2026-03-28T20:30:00.000Z",
        events: [],
      },
      draft: savedDraft,
    });

    const req = new NextRequest("http://localhost/api/tina/cpa-packet/export", {
      method: "POST",
      body: JSON.stringify({ packetFingerprint: "00000000001" }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).toEqual({
      fileName: "tina-cpa-packet.md",
      mimeType: "text/markdown; charset=utf-8",
      contents: "# Tina CPA Review Packet",
    });
    expect(revalidateTinaCompletedDerivedWorkspaceMock).not.toHaveBeenCalled();
    expect(persistTinaPacketVersionMock).not.toHaveBeenCalled();
    expect(buildTinaCpaPacketExportMock).toHaveBeenCalledWith(savedDraft, {
      packetReview: {
        decision: "reference_only",
        reviewerName: "Pat Reviewer",
        reviewerNote: "Saved review note",
        reviewedAt: "2026-03-28T20:30:00.000Z",
        events: [],
      },
    });
  });
});
