import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultTinaAuthorityWorkItem,
  failTinaAuthorityResearchRun,
  queueTinaAuthorityResearchRun,
  startTinaAuthorityResearchRun,
} from "@/tina/lib/authority-work";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

const {
  requireAuthMock,
  createServerClientMock,
  loadTinaWorkspaceStateMock,
  saveTinaWorkspaceStateMock,
  processTinaAuthorityQueueTaskMock,
  isTinaAuthorityBackgroundJobActiveMock,
  startTinaAuthorityBackgroundJobMock,
  waitForTinaAuthorityBackgroundJobsForTestingMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
  loadTinaWorkspaceStateMock: vi.fn(),
  saveTinaWorkspaceStateMock: vi.fn(),
  processTinaAuthorityQueueTaskMock: vi.fn(),
  isTinaAuthorityBackgroundJobActiveMock: vi.fn(),
  startTinaAuthorityBackgroundJobMock: vi.fn(),
  waitForTinaAuthorityBackgroundJobsForTestingMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/tina/lib/server-packet-store", () => ({
  loadTinaWorkspaceState: loadTinaWorkspaceStateMock,
  saveTinaWorkspaceState: saveTinaWorkspaceStateMock,
}));

vi.mock("@/tina/lib/authority-queue", () => ({
  processTinaAuthorityQueueTask: processTinaAuthorityQueueTaskMock,
}));

vi.mock("@/tina/lib/authority-background-jobs", () => ({
  getTinaAuthorityBackgroundPollDelayMs: () => 5000,
  isTinaAuthorityBackgroundJobActive: isTinaAuthorityBackgroundJobActiveMock,
  startTinaAuthorityBackgroundJob: startTinaAuthorityBackgroundJobMock,
  waitForTinaAuthorityBackgroundJobsForTesting: waitForTinaAuthorityBackgroundJobsForTestingMock,
}));

import { POST } from "@/app/api/tina/research/process-queue/route";
import { waitForTinaAuthorityBackgroundJobsForTesting } from "@/tina/lib/authority-background-jobs";

describe("POST /api/tina/research/process-queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T16:02:00.000Z"));
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    isTinaAuthorityBackgroundJobActiveMock.mockReturnValue(false);
    waitForTinaAuthorityBackgroundJobsForTestingMock.mockImplementation(async () => {});
    saveTinaWorkspaceStateMock.mockImplementation(async (_sb, _userId, draft) => ({
      draft,
      packetVersions: [],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes the next due research task and persists running then finished state", async () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const queuedResearch = queueTinaAuthorityResearchRun(
      createDefaultTinaAuthorityWorkItem("qbi-review")
    );
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Queue Test LLC",
        entityType: "single_member_llc" as const,
        hasFixedAssets: true,
      },
      authorityWork: [queuedResearch],
    };

    loadTinaWorkspaceStateMock.mockResolvedValue({
      draft,
      packetVersions: [],
    });
    processTinaAuthorityQueueTaskMock.mockImplementation(async (args) => ({
      workItem: {
        ...args.currentWorkItem,
        status: "ready_for_reviewer",
        reviewerDecision: "pending",
        disclosureDecision: "needs_review",
        memo: "Tina finished the queued research pass.",
        lastAiRunAt: "2026-03-29T16:03:00.000Z",
        researchRun: {
          ...args.currentWorkItem.researchRun,
          status: "succeeded",
          finishedAt: "2026-03-29T16:03:00.000Z",
          retryAt: null,
          error: null,
        },
      },
      responseStatus: 200,
    }));
    let backgroundPromise: Promise<void> | null = null;
    startTinaAuthorityBackgroundJobMock.mockImplementation(({ run }) => {
      backgroundPromise = run();
      return true;
    });
    waitForTinaAuthorityBackgroundJobsForTestingMock.mockImplementation(async () => {
      await backgroundPromise;
    });

    const req = new NextRequest("http://localhost/api/tina/research/process-queue", {
      method: "POST",
    });

    const res = await POST(req);
    const payload = await res.json();
    await waitForTinaAuthorityBackgroundJobsForTesting();

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
            startedAt: "2026-03-29T16:02:00.000Z",
          }),
        }),
      })
    );
    expect(payload).toEqual(
      expect.objectContaining({
        processed: false,
        task: {
          kind: "research",
          ideaId: "qbi-review",
        },
        workItem: expect.objectContaining({
          ideaId: "qbi-review",
          researchRun: expect.objectContaining({
            status: "running",
          }),
        }),
        moreWorkRemaining: true,
        nextPollDelayMs: 5000,
        taskStatus: 202,
      })
    );
  });

  it("returns a calm poll-later response when research is waiting on a retry window", async () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const queuedResearch = queueTinaAuthorityResearchRun(
      createDefaultTinaAuthorityWorkItem("qbi-review")
    );
    const delayedResearch = failTinaAuthorityResearchRun(
      startTinaAuthorityResearchRun(queuedResearch),
      {
        error: "Rate limit hit. Try again in 180s.",
        retryAt: "2026-03-29T16:05:00.000Z",
      }
    );
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Queue Test LLC",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [delayedResearch],
    };

    loadTinaWorkspaceStateMock.mockResolvedValue({
      draft,
      packetVersions: [],
    });
    startTinaAuthorityBackgroundJobMock.mockReturnValue(false);

    const req = new NextRequest("http://localhost/api/tina/research/process-queue", {
      method: "POST",
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(processTinaAuthorityQueueTaskMock).not.toHaveBeenCalled();
    expect(saveTinaWorkspaceStateMock).not.toHaveBeenCalled();
    expect(payload).toEqual({
      processed: false,
      task: null,
      workItem: null,
      moreWorkRemaining: true,
      nextPollDelayMs: 180000,
    });
  });

  it("adopts a recent running research lane instead of restarting it when the in-memory job map is gone", async () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const runningResearch = startTinaAuthorityResearchRun(
      queueTinaAuthorityResearchRun(createDefaultTinaAuthorityWorkItem("qbi-review"))
    );
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Queue Test LLC",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [
        {
          ...runningResearch,
          researchRun: {
            ...runningResearch.researchRun,
            startedAt: "2026-03-29T15:30:00.000Z",
          },
        },
      ],
    };

    loadTinaWorkspaceStateMock.mockResolvedValue({
      draft,
      packetVersions: [],
    });
    isTinaAuthorityBackgroundJobActiveMock.mockReturnValue(false);
    startTinaAuthorityBackgroundJobMock.mockReturnValue(false);

    const req = new NextRequest("http://localhost/api/tina/research/process-queue", {
      method: "POST",
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(processTinaAuthorityQueueTaskMock).not.toHaveBeenCalled();
    expect(saveTinaWorkspaceStateMock).not.toHaveBeenCalled();
    expect(payload).toEqual({
      processed: false,
      task: {
        kind: "research",
        ideaId: "qbi-review",
      },
      workItem: expect.objectContaining({
        ideaId: "qbi-review",
        researchRun: expect.objectContaining({
          status: "running",
          startedAt: "2026-03-29T15:30:00.000Z",
        }),
      }),
      moreWorkRemaining: true,
      nextPollDelayMs: 5000,
      taskStatus: 102,
    });
  });

  it("does not let an orphaned older background job write into a newer workspace run", async () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const queuedResearch = queueTinaAuthorityResearchRun(
      createDefaultTinaAuthorityWorkItem("qbi-review")
    );
    const initialDraft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Queue Test LLC",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [queuedResearch],
    };
    const latestDraft = {
      ...initialDraft,
      authorityWork: [
        {
          ...startTinaAuthorityResearchRun(queuedResearch),
          researchRun: {
            ...startTinaAuthorityResearchRun(queuedResearch).researchRun,
            jobId: "authority-research-newer-job",
          },
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
        memo: "Tina finished the older queued research pass.",
        lastAiRunAt: "2026-03-29T16:03:00.000Z",
        researchRun: {
          ...args.currentWorkItem.researchRun,
          status: "succeeded",
          finishedAt: "2026-03-29T16:03:00.000Z",
          retryAt: null,
          error: null,
        },
      },
      responseStatus: 200,
    }));
    let backgroundPromise: Promise<void> | null = null;
    startTinaAuthorityBackgroundJobMock.mockImplementation(({ run }) => {
      backgroundPromise = run();
      return true;
    });
    waitForTinaAuthorityBackgroundJobsForTestingMock.mockImplementation(async () => {
      await backgroundPromise;
    });

    const req = new NextRequest("http://localhost/api/tina/research/process-queue", {
      method: "POST",
    });

    const res = await POST(req);
    await res.json();
    await waitForTinaAuthorityBackgroundJobsForTesting();

    expect(res.status).toBe(200);
    expect(saveTinaWorkspaceStateMock).toHaveBeenCalledTimes(1);
  });
});
