import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultTinaAuthorityWorkItem,
  queueTinaAuthorityChallengeRun,
} from "@/tina/lib/authority-work";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

const {
  requireAuthMock,
  createServerClientMock,
  processTinaAuthorityQueueTaskMock,
  loadTinaWorkspaceStateMock,
  saveTinaWorkspaceStateMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
  processTinaAuthorityQueueTaskMock: vi.fn(),
  loadTinaWorkspaceStateMock: vi.fn(),
  saveTinaWorkspaceStateMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/tina/lib/authority-queue", () => ({
  processTinaAuthorityQueueTask: processTinaAuthorityQueueTaskMock,
}));

vi.mock("@/tina/lib/server-packet-store", () => ({
  loadTinaWorkspaceState: loadTinaWorkspaceStateMock,
  saveTinaWorkspaceState: saveTinaWorkspaceStateMock,
}));

import { POST } from "@/app/api/tina/research/challenge/route";

describe("POST /api/tina/research/challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    saveTinaWorkspaceStateMock.mockImplementation(async (_sb, _userId, draft) => ({
      draft,
      packetVersions: [],
    }));
  });

  it("reapplies the finished challenge result onto the latest saved workspace draft", async () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const queuedChallenge = queueTinaAuthorityChallengeRun(
      createDefaultTinaAuthorityWorkItem("wa-state-review")
    );
    const initialDraft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Original Challenge Draft",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [queuedChallenge],
    };
    const latestDraft = {
      ...initialDraft,
      documents: [
        ...initialDraft.documents,
        {
          id: "fresh-doc",
          requestId: "supporting-paper",
          requestLabel: "Fresh supporting paper",
          name: "fresh.pdf",
          storagePath: "fresh.pdf",
          kind: "pdf" as const,
          mimeType: "application/pdf",
          sizeBytes: 128,
          uploadedAt: "2026-03-29T18:12:00.000Z",
        },
      ],
    };

    loadTinaWorkspaceStateMock
      .mockResolvedValueOnce({
        draft: initialDraft,
        packetVersions: [],
      })
      .mockResolvedValueOnce({
        draft: latestDraft,
        packetVersions: [],
      });
    processTinaAuthorityQueueTaskMock.mockImplementation(async (args) => ({
      workItem: {
        ...args.currentWorkItem,
        status: "rejected",
        reviewerDecision: "do_not_use",
        disclosureDecision: "needs_review",
        challengeVerdict: "likely_fails",
        challengeMemo: "Finished queued challenge.",
        lastChallengeRunAt: "2026-03-29T18:15:00.000Z",
        challengeRun: {
          ...args.currentWorkItem.challengeRun,
          status: "succeeded",
          finishedAt: "2026-03-29T18:15:00.000Z",
          retryAt: null,
          error: null,
        },
      },
      responseStatus: 200,
    }));

    const req = new NextRequest("http://localhost/api/tina/research/challenge", {
      method: "POST",
      body: JSON.stringify({ ideaId: "wa-state-review", action: "process" }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(loadTinaWorkspaceStateMock).toHaveBeenCalledTimes(2);
    expect(saveTinaWorkspaceStateMock).toHaveBeenCalledTimes(2);
    expect(processTinaAuthorityQueueTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "challenge",
        currentWorkItem: expect.objectContaining({
          ideaId: "wa-state-review",
          challengeRun: expect.objectContaining({
            status: "running",
          }),
        }),
      })
    );
    expect(saveTinaWorkspaceStateMock.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        documents: expect.arrayContaining([
          expect.objectContaining({
            id: "fresh-doc",
          }),
        ]),
      })
    );
    expect(payload).toEqual({
      workItem: expect.objectContaining({
        ideaId: "wa-state-review",
        challengeMemo: "Finished queued challenge.",
        challengeRun: expect.objectContaining({
          status: "succeeded",
        }),
      }),
    });
  });
});
