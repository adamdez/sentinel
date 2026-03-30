import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  createServerClientMock,
  parseTinaWorkspaceDraftMock,
  reconcileTinaDerivedWorkspaceMock,
  buildTinaScheduleCDraftMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
  parseTinaWorkspaceDraftMock: vi.fn(),
  reconcileTinaDerivedWorkspaceMock: vi.fn(),
  buildTinaScheduleCDraftMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/tina/lib/workspace-draft", () => ({
  parseTinaWorkspaceDraft: parseTinaWorkspaceDraftMock,
}));

vi.mock("@/tina/lib/reconcile-workspace", () => ({
  reconcileTinaDerivedWorkspace: reconcileTinaDerivedWorkspaceMock,
}));

vi.mock("@/tina/lib/schedule-c-draft", () => ({
  buildTinaScheduleCDraft: buildTinaScheduleCDraftMock,
}));

import { POST } from "@/app/api/tina/schedule-c/build/route";

describe("POST /api/tina/schedule-c/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    parseTinaWorkspaceDraftMock.mockReturnValue({ stage: "parsed" });
    reconcileTinaDerivedWorkspaceMock.mockReturnValue({ stage: "reconciled" });
    buildTinaScheduleCDraftMock.mockReturnValue({
      lastRunAt: "2026-03-28T18:30:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Review it",
      fields: [],
      notes: [],
    });
  });

  it("reconciles the workspace before building the Schedule C draft", async () => {
    const req = new NextRequest("http://localhost/api/tina/schedule-c/build", {
      method: "POST",
      body: JSON.stringify({ draft: { version: 1 } }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await POST(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(parseTinaWorkspaceDraftMock).toHaveBeenCalledWith(JSON.stringify({ version: 1 }));
    expect(reconcileTinaDerivedWorkspaceMock).toHaveBeenCalledWith({ stage: "parsed" });
    expect(buildTinaScheduleCDraftMock).toHaveBeenCalledWith({ stage: "reconciled" });
    expect(payload).toEqual({
      scheduleCDraft: {
        lastRunAt: "2026-03-28T18:30:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review it",
        fields: [],
        notes: [],
      },
    });
  });
});
