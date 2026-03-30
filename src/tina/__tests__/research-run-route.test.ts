import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultTinaAuthorityWorkItem,
  queueTinaAuthorityResearchRun,
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

import { POST } from "@/app/api/tina/research/run/route";

describe("POST /api/tina/research/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    saveTinaWorkspaceStateMock.mockImplementation(async (_sb, _userId, draft) => ({
      draft,
      packetVersions: [],
    }));
  });

  it("reapplies the finished research result onto the latest saved workspace draft", async () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const queuedResearch = queueTinaAuthorityResearchRun(
      createDefaultTinaAuthorityWorkItem("qbi-review")
    );
    const initialDraft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Original Queue Draft",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [queuedResearch],
    };
    const latestDraft = {
      ...initialDraft,
      sourceFacts: [
        ...initialDraft.sourceFacts,
        {
          id: "fresh-fact",
          label: "Fresh fact from a newer autosave",
          value: "Latest server state",
          category: "business_profile" as const,
          sourceDocumentId: null,
          readingId: null,
          confidence: "high" as const,
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
        status: "ready_for_reviewer",
        reviewerDecision: "pending",
        disclosureDecision: "needs_review",
        memo: "Finished queued research.",
        lastAiRunAt: "2026-03-29T18:10:00.000Z",
        researchRun: {
          ...args.currentWorkItem.researchRun,
          status: "succeeded",
          finishedAt: "2026-03-29T18:10:00.000Z",
          retryAt: null,
          error: null,
        },
      },
      responseStatus: 200,
    }));

    const req = new NextRequest("http://localhost/api/tina/research/run", {
      method: "POST",
      body: JSON.stringify({ ideaId: "qbi-review", action: "process" }),
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
        kind: "research",
        currentWorkItem: expect.objectContaining({
          ideaId: "qbi-review",
          researchRun: expect.objectContaining({
            status: "running",
          }),
        }),
      })
    );
    expect(saveTinaWorkspaceStateMock.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        sourceFacts: expect.arrayContaining([
          expect.objectContaining({
            id: "fresh-fact",
          }),
        ]),
      })
    );
    expect(payload).toEqual({
      workItem: expect.objectContaining({
        ideaId: "qbi-review",
        memo: "Finished queued research.",
        researchRun: expect.objectContaining({
          status: "succeeded",
        }),
      }),
    });
  });
});
