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
  it("tracks operational and qualified-conversation outcomes in one snapshot", async () => {
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
    expect(snapshot.qualifiedConversations).toBe(2);
    expect(snapshot.qualifiedConversationRate).toBeCloseTo(2 / 3, 5);
    expect(snapshot.appointmentSignals).toBe(0);
    expect(snapshot.offerSignals).toBe(0);
    expect(snapshot.contractSignals).toBe(0);
    expect(snapshot.transferAttempts).toBe(1);
    expect(snapshot.successfulTransfers).toBe(1);
    expect(snapshot.callbackRequests).toBe(1);
    expect(snapshot.machineEnds).toBe(1);
    expect(snapshot.totalCostCents).toBe(480);
    expect(snapshot.averageDurationSec).toBe(96);
    expect(snapshot.costPerQualifiedConversationCents).toBe(240);
    expect(snapshot.costPerSuccessfulTransferCents).toBe(480);
    expect(snapshot.answerRate).toBeCloseTo(2 / 3, 5);
    expect(snapshot.callbackRate).toBeCloseTo(1 / 3, 5);
    expect(snapshot.qualityReviewPassRate).toBe(0.5);
  });

  it("maps appointment, offer, and contract dispositions to founder-outcome signals", async () => {
    const { computeJeffKpis } = await import("@/lib/jeff-control");
    const snapshot = computeJeffKpis(
      [
        { id: "s1", status: "completed", metadata: { source: "jeff-supervised-queue" }, duration_seconds: 150, cost_cents: 180 },
        { id: "s2", status: "completed", metadata: { source: "jeff-supervised-queue" }, duration_seconds: 175, cost_cents: 210 },
        { id: "s3", status: "completed", metadata: { source: "jeff-supervised-queue" }, duration_seconds: 200, cost_cents: 240 },
      ],
      [
        { voice_session_id: "s1", disposition: "appointment_set", duration_sec: 150 },
        { voice_session_id: "s2", disposition: "offer_made", duration_sec: 175 },
        { voice_session_id: "s3", disposition: "contracted", duration_sec: 200 },
      ],
      [],
    );

    expect(snapshot.liveAnswers).toBe(3);
    expect(snapshot.qualifiedConversations).toBe(3);
    expect(snapshot.appointmentSignals).toBe(1);
    expect(snapshot.offerSignals).toBe(1);
    expect(snapshot.contractSignals).toBe(1);
    expect(snapshot.costPerQualifiedConversationCents).toBe(210);
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

describe("Jeff quality tuning summary", () => {
  it("derives policy tuning suggestions from recurring review tags", async () => {
    const { buildJeffQualityTuningSummary } = await import("@/lib/jeff-control");
    const summary = buildJeffQualityTuningSummary([
      { voice_session_id: "s1", score: 2, review_tags: ["weak opener", "transferred too early"] },
      { voice_session_id: "s2", score: 2, review_tags: ["weak opener", "missed callback opportunity"] },
      { voice_session_id: "s3", score: 3, review_tags: ["transferred too early", "too robotic"] },
      { voice_session_id: "s4", score: 2, review_tags: ["transferred too early", "missed callback opportunity"] },
      { voice_session_id: "s5", score: 4, review_tags: ["good transfer timing"] },
      { voice_session_id: "s6", score: 3, review_tags: ["weak opener"] },
    ] as Array<Record<string, unknown>>);

    expect(summary.sampleSize).toBe(6);
    expect(summary.scoredSampleSize).toBe(6);
    expect(summary.passRate).toBeCloseTo(0.17, 2);
    expect(summary.suggestions.length).toBeGreaterThan(0);
    expect(summary.suggestions.some((s) => s.code === "transfer_too_early")).toBe(true);
    expect(summary.suggestions.some((s) => s.code === "weak_openers")).toBe(true);
    expect(summary.suggestions.some((s) => s.code === "review_pass_rate")).toBe(true);
  });

  it("avoids noisy recommendations when review volume is too low", async () => {
    const { buildJeffQualityTuningSummary } = await import("@/lib/jeff-control");
    const summary = buildJeffQualityTuningSummary([
      { voice_session_id: "s1", score: 4, review_tags: ["great opener"] },
      { voice_session_id: "s2", score: 3, review_tags: ["weak opener"] },
      { voice_session_id: "s3", score: 5, review_tags: ["good transfer timing"] },
    ] as Array<Record<string, unknown>>);

    expect(summary.sampleSize).toBe(3);
    expect(summary.suggestions).toHaveLength(0);
  });

  it("flags policy-version regressions when pass-rate drops materially", async () => {
    const { buildJeffQualityTuningSummary } = await import("@/lib/jeff-control");
    const summary = buildJeffQualityTuningSummary([
      { voice_session_id: "p1", policy_version: "jeff-outbound-2026-03-21", score: 5, created_at: "2026-03-21T12:00:00.000Z" },
      { voice_session_id: "p2", policy_version: "jeff-outbound-2026-03-21", score: 4, created_at: "2026-03-21T13:00:00.000Z" },
      { voice_session_id: "p3", policy_version: "jeff-outbound-2026-03-21", score: 5, created_at: "2026-03-21T14:00:00.000Z" },
      { voice_session_id: "p4", policy_version: "jeff-outbound-2026-03-21", score: 4, created_at: "2026-03-21T15:00:00.000Z" },
      { voice_session_id: "c1", policy_version: "jeff-outbound-2026-03-30", score: 2, created_at: "2026-03-30T12:00:00.000Z" },
      { voice_session_id: "c2", policy_version: "jeff-outbound-2026-03-30", score: 3, created_at: "2026-03-30T13:00:00.000Z" },
      { voice_session_id: "c3", policy_version: "jeff-outbound-2026-03-30", score: 4, created_at: "2026-03-30T14:00:00.000Z" },
      { voice_session_id: "c4", policy_version: "jeff-outbound-2026-03-30", score: 2, created_at: "2026-03-30T15:00:00.000Z" },
    ] as Array<Record<string, unknown>>);

    const regression = summary.suggestions.find((suggestion) => suggestion.code === "policy_version_regression");
    expect(regression).toBeTruthy();
    expect(regression?.severity).toBe("critical");
  });

  it("compares current policy quality against the previous policy version", async () => {
    const { buildJeffPolicyVersionComparison } = await import("@/lib/jeff-control");
    const comparison = buildJeffPolicyVersionComparison([
      { voice_session_id: "c1", policy_version: "jeff-outbound-2026-03-30", score: 5, created_at: "2026-04-01T12:00:00.000Z" },
      { voice_session_id: "c2", policy_version: "jeff-outbound-2026-03-30", score: 4, created_at: "2026-04-01T13:00:00.000Z" },
      { voice_session_id: "c3", policy_version: "jeff-outbound-2026-03-30", score: 3, created_at: "2026-04-01T14:00:00.000Z" },
      { voice_session_id: "c4", policy_version: "jeff-outbound-2026-03-30", score: 4, created_at: "2026-04-01T15:00:00.000Z" },
      { voice_session_id: "p1", policy_version: "jeff-outbound-2026-03-21", score: 2, created_at: "2026-03-25T12:00:00.000Z" },
      { voice_session_id: "p2", policy_version: "jeff-outbound-2026-03-21", score: 3, created_at: "2026-03-25T13:00:00.000Z" },
      { voice_session_id: "p3", policy_version: "jeff-outbound-2026-03-21", score: 4, created_at: "2026-03-25T14:00:00.000Z" },
      { voice_session_id: "p4", policy_version: "jeff-outbound-2026-03-21", score: 5, created_at: "2026-03-25T15:00:00.000Z" },
    ] as Array<Record<string, unknown>>, { minScoredForComparison: 4 });

    expect(comparison.currentPolicyVersion).toBe("jeff-outbound-2026-03-30");
    expect(comparison.previousPolicyVersion).toBe("jeff-outbound-2026-03-21");
    expect(comparison.currentPassRate).toBe(0.75);
    expect(comparison.previousPassRate).toBe(0.5);
    expect(comparison.passRateDeltaPctPoints).toBe(25);
    expect(comparison.currentAverageScore).toBe(4);
    expect(comparison.previousAverageScore).toBe(3.5);
    expect(comparison.averageScoreDelta).toBe(0.5);
    expect(comparison.hasSufficientData).toBe(true);
  });

  it("prefers updated_at over created_at when ranking policy recency", async () => {
    const { buildJeffPolicyVersionComparison } = await import("@/lib/jeff-control");
    const comparison = buildJeffPolicyVersionComparison([
      {
        voice_session_id: "older-created-but-latest-updated",
        policy_version: "jeff-outbound-2026-04-02",
        score: 5,
        created_at: "2026-03-01T12:00:00.000Z",
        updated_at: "2026-04-02T12:00:00.000Z",
      },
      {
        voice_session_id: "newer-created",
        policy_version: "jeff-outbound-2026-03-30",
        score: 4,
        created_at: "2026-03-31T12:00:00.000Z",
      },
    ] as Array<Record<string, unknown>>, { minScoredForComparison: 2 });

    expect(comparison.currentPolicyVersion).toBe("jeff-outbound-2026-04-02");
    expect(comparison.previousPolicyVersion).toBe("jeff-outbound-2026-03-30");
  });
});
