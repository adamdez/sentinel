import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  createServerClientMock,
  parseTinaWorkspaceDraftMock,
  reconcileTinaDerivedWorkspaceMock,
  buildTinaFinalSignoffMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
  parseTinaWorkspaceDraftMock: vi.fn(),
  reconcileTinaDerivedWorkspaceMock: vi.fn(),
  buildTinaFinalSignoffMock: vi.fn(),
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

vi.mock("@/tina/lib/final-signoff", () => ({
  buildTinaFinalSignoff: buildTinaFinalSignoffMock,
}));

import { POST } from "@/app/api/tina/final-signoff/build/route";

describe("POST /api/tina/final-signoff/build", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({ from: vi.fn() });
    requireAuthMock.mockResolvedValue({ id: "user-1" });
    parseTinaWorkspaceDraftMock.mockReturnValue({ stage: "parsed" });
    reconcileTinaDerivedWorkspaceMock.mockReturnValue({ stage: "reconciled" });
    buildTinaFinalSignoffMock.mockReturnValue({
      lastRunAt: "2026-03-28T18:40:00.000Z",
      status: "complete",
      level: "blocked",
      summary: "Built",
      nextStep: "Review it",
      checks: [],
      reviewerName: "",
      reviewerNote: "",
      reviewPacketId: null,
      reviewPacketVersion: null,
      reviewPacketFingerprint: null,
      confirmedAt: null,
      confirmedPacketId: null,
      confirmedPacketVersion: null,
      confirmedPacketFingerprint: null,
    });
  });

  it("reconciles the workspace before building final signoff", async () => {
    const req = new NextRequest("http://localhost/api/tina/final-signoff/build", {
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
    expect(buildTinaFinalSignoffMock).toHaveBeenCalledWith({ stage: "reconciled" });
    expect(payload).toEqual({
      finalSignoff: {
        lastRunAt: "2026-03-28T18:40:00.000Z",
        status: "complete",
        level: "blocked",
        summary: "Built",
        nextStep: "Review it",
        checks: [],
        reviewerName: "",
        reviewerNote: "",
        reviewPacketId: null,
        reviewPacketVersion: null,
        reviewPacketFingerprint: null,
        confirmedAt: null,
        confirmedPacketId: null,
        confirmedPacketVersion: null,
        confirmedPacketFingerprint: null,
      },
    });
  });
});
