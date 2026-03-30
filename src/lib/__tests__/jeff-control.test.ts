import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon-test-key";
});

describe("Jeff controller access", () => {
  it("allows Adam and rejects non-controller emails", async () => {
    const { isJeffController } = await import("@/lib/jeff-control");
    expect(isJeffController("adam@dominionhomedeals.com")).toBe(true);
    expect(isJeffController("logan@dominionhomedeals.com")).toBe(false);
    expect(isJeffController(null)).toBe(false);
  });
});

describe("Jeff KPI aggregation", () => {
  it("tracks live answers, transfers, callbacks, machine ends, and quality pass rate", async () => {
    const { computeJeffKpis } = await import("@/lib/jeff-control");
    const snapshot = computeJeffKpis(
      [
        {
          id: "s1",
          status: "transferred",
          metadata: { source: "jeff-manual-single" },
          transferred_to: "+15095550000",
          duration_seconds: 180,
          cost_cents: 240,
        },
        {
          id: "s2",
          status: "completed",
          metadata: { source: "jeff-auto-redial" },
          callback_requested: true,
          duration_seconds: 95,
          cost_cents: 180,
        },
        {
          id: "s3",
          status: "completed",
          metadata: { source: "jeff-manual-batch" },
          duration_seconds: 12,
          cost_cents: 60,
        },
      ],
      [
        { voice_session_id: "s1", disposition: "answered", duration_sec: 180 },
        { voice_session_id: "s2", disposition: "follow_up", duration_sec: 95 },
        { voice_session_id: "s3", disposition: "voicemail", duration_sec: 12 },
      ],
      [
        { voice_session_id: "s1", score: 5 },
        { voice_session_id: "s2", score: 3 },
      ],
    );

    expect(snapshot.attempts).toBe(3);
    expect(snapshot.liveAnswers).toBe(2);
    expect(snapshot.transferAttempts).toBe(1);
    expect(snapshot.successfulTransfers).toBe(1);
    expect(snapshot.callbackRequests).toBe(1);
    expect(snapshot.machineEnds).toBe(1);
    expect(snapshot.totalCostCents).toBe(480);
    expect(snapshot.averageDurationSec).toBe(96);
    expect(snapshot.costPerSuccessfulTransferCents).toBe(480);
    expect(snapshot.answerRate).toBeCloseTo(2 / 3, 5);
    expect(snapshot.callbackRate).toBeCloseTo(1 / 3, 5);
    expect(snapshot.qualityReviewPassRate).toBe(0.5);
  });
});

describe("Jeff recent session shaping", () => {
  it("keeps recent outcomes human-readable for the Jeff control center", async () => {
    const { buildJeffRecentSessions } = await import("@/lib/jeff-control");
    const recent = buildJeffRecentSessions(
      [
        {
          id: "s1",
          status: "transferred",
          lead_id: "lead-1",
          created_at: "2026-03-30T16:00:00.000Z",
          duration_seconds: 181,
          cost_cents: 245,
          transferred_to: "+15095550000",
          transfer_reason: "Seller is ready for Logan now",
          callback_requested: false,
        },
        {
          id: "s2",
          status: "completed",
          lead_id: "lead-2",
          created_at: "2026-03-30T17:00:00.000Z",
          duration_seconds: 63,
          cost_cents: 90,
          callback_requested: true,
        },
      ],
      [
        { id: "lead-1", properties: { owner_name: "Ada Seller", address: "123 Main St" } },
        { id: "lead-2", properties: { owner_name: "Ben Owner", address: "456 Oak Ave" } },
      ],
      8,
    );

    expect(recent).toEqual([
      expect.objectContaining({
        id: "s1",
        leadId: "lead-1",
        ownerName: "Ada Seller",
        address: "123 Main St",
        status: "transferred",
        transferredTo: "+15095550000",
        transferReason: "Seller is ready for Logan now",
        callbackRequested: false,
      }),
      expect.objectContaining({
        id: "s2",
        leadId: "lead-2",
        ownerName: "Ben Owner",
        address: "456 Oak Ave",
        status: "completed",
        callbackRequested: true,
      }),
    ]);
  });
});

describe("Jeff queue launch rules", () => {
  it("distinguishes manual-eligible from callable queue entries", async () => {
    const { isJeffCallableQueueEntry, isJeffManualQueueEntry } = await import("@/lib/jeff-control");

    expect(isJeffManualQueueEntry({ queueStatus: "active", queueTier: "eligible" } as never)).toBe(true);
    expect(isJeffCallableQueueEntry({ queueStatus: "active", queueTier: "eligible" } as never)).toBe(false);

    expect(isJeffManualQueueEntry({ queueStatus: "active", queueTier: "active" } as never)).toBe(true);
    expect(isJeffCallableQueueEntry({ queueStatus: "active", queueTier: "active" } as never)).toBe(true);

    expect(isJeffManualQueueEntry({ queueStatus: "paused", queueTier: "auto" } as never)).toBe(false);
    expect(isJeffCallableQueueEntry({ queueStatus: "removed", queueTier: "auto" } as never)).toBe(false);
  });
});
