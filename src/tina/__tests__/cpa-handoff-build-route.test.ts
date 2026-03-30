import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  createServerClientMock,
  parseTinaWorkspaceDraftMock,
  reconcileTinaDerivedWorkspaceMock,
  buildTinaCpaHandoffMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
  parseTinaWorkspaceDraftMock: vi.fn(),
  reconcileTinaDerivedWorkspaceMock: vi.fn(),
  buildTinaCpaHandoffMock: vi.fn(),
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

vi.mock("@/tina/lib/cpa-handoff", () => ({
  buildTinaCpaHandoff: buildTinaCpaHandoffMock,
}));

import { POST } from "@/app/api/tina/cpa-handoff/build/route";

describe("POST /api/tina/cpa-handoff/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    parseTinaWorkspaceDraftMock.mockReturnValue({ stage: "parsed" });
    reconcileTinaDerivedWorkspaceMock.mockReturnValue({ stage: "reconciled" });
    buildTinaCpaHandoffMock.mockReturnValue({
      lastRunAt: "2026-03-28T18:20:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Review it",
      artifacts: [],
    });
  });

  it("reconciles the workspace before building the CPA handoff packet", async () => {
    const req = new NextRequest("http://localhost/api/tina/cpa-handoff/build", {
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
    expect(buildTinaCpaHandoffMock).toHaveBeenCalledWith({ stage: "reconciled" });
    expect(payload).toEqual({
      cpaHandoff: {
        lastRunAt: "2026-03-28T18:20:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review it",
        artifacts: [],
      },
    });
  });
});
