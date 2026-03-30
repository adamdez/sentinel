import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  createServerClientMock,
  loadTinaIrsAuthorityWatchStatusMock,
  parseTinaWorkspaceDraftMock,
  reconcileTinaDerivedWorkspaceMock,
  buildTinaOfficialFormPacketMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
  loadTinaIrsAuthorityWatchStatusMock: vi.fn(),
  parseTinaWorkspaceDraftMock: vi.fn(),
  reconcileTinaDerivedWorkspaceMock: vi.fn(),
  buildTinaOfficialFormPacketMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/tina/lib/irs-authority-watch", () => ({
  loadTinaIrsAuthorityWatchStatus: loadTinaIrsAuthorityWatchStatusMock,
}));

vi.mock("@/tina/lib/workspace-draft", () => ({
  parseTinaWorkspaceDraft: parseTinaWorkspaceDraftMock,
}));

vi.mock("@/tina/lib/reconcile-workspace", () => ({
  reconcileTinaDerivedWorkspace: reconcileTinaDerivedWorkspaceMock,
}));

vi.mock("@/tina/lib/official-form-packet", () => ({
  buildTinaOfficialFormPacket: buildTinaOfficialFormPacketMock,
}));

import { POST } from "@/app/api/tina/official-forms/build/route";

describe("POST /api/tina/official-forms/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    loadTinaIrsAuthorityWatchStatusMock.mockReturnValue({
      level: "healthy",
      generatedAt: "2026-03-29T05:19:38.079Z",
      checkedCount: 18,
      failedCount: 0,
      changedCount: 0,
      newCount: 18,
      summary: "Tina has a first IRS watch baseline for 18 watched IRS sources.",
      nextStep:
        "Review this baseline once, then rerun the watch whenever the filing season or Tina's supported IRS lane changes.",
    });
    parseTinaWorkspaceDraftMock.mockReturnValue({ stage: "parsed" });
    reconcileTinaDerivedWorkspaceMock.mockReturnValue({ stage: "reconciled" });
    buildTinaOfficialFormPacketMock.mockReturnValue({
      lastRunAt: "2026-03-28T18:10:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Review it",
      forms: [],
    });
  });

  it("reconciles the workspace before building the official-form packet", async () => {
    const req = new NextRequest("http://localhost/api/tina/official-forms/build", {
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
    expect(loadTinaIrsAuthorityWatchStatusMock).toHaveBeenCalledTimes(1);
    expect(buildTinaOfficialFormPacketMock).toHaveBeenCalledWith(
      { stage: "reconciled" },
      {
        irsAuthorityWatchStatus: expect.objectContaining({
          level: "healthy",
          checkedCount: 18,
        }),
      }
    );
    expect(payload).toEqual({
      officialFormPacket: {
        lastRunAt: "2026-03-28T18:10:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review it",
        forms: [],
      },
    });
  });
});
