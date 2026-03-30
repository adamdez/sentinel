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
