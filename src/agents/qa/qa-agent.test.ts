import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAgentOutput, qaGoldDataset } from "../gold-datasets";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/control-plane", () => ({
  isAgentEnabled: vi.fn().mockResolvedValue(true),
  createAgentRun: vi.fn().mockResolvedValue("test-run-qa-001"),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./prompt", () => ({
  QA_AGENT_VERSION: "1.0.0",
  QA_THRESHOLDS: {
    maxOperatorTalkPercent: 60,
    minMeaningfulCallSeconds: 30,
    qualifyingThresholdSeconds: 120,
  },
}));

// ── Setup ────────────────────────────────────────────────────────────────────

function setupQAMocks(goldCase: typeof qaGoldDataset[0]) {
  // Build transcript chunks from the gold dataset transcript
  const lines = goldCase.input.transcript.split("\n").filter(Boolean);
  const chunks = lines.map((line, i) => {
    const isOperator = line.startsWith("Logan:");
    const text = line.replace(/^(Logan|Margaret|Robert):\s*/, "");
    return {
      speaker: isOperator ? "operator" : "seller",
      text,
      start_ms: i * 10000,
      end_ms: (i + 1) * 10000,
    };
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === "calls_log") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: goldCase.input.callId,
                lead_id: "test-lead-qa",
                disposition: goldCase.input.disposition,
                duration: goldCase.input.duration,
                notes: goldCase.input.disposition === "appointment"
                  ? "Good conversation. Seller is motivated and interested in an offer."
                  : "Seller not interested. Hung up quickly.",
                direction: "outbound",
                recording_url: null,
                created_at: new Date().toISOString(),
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "dialer_sessions") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{
                  id: "session-001",
                  transcript_chunks: chunks,
                  ai_notes: null,
                  duration_seconds: goldCase.input.duration,
                  ended_at: new Date().toISOString(),
                }],
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "leads") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "test-lead-qa",
                status: "prospect",
                next_action: goldCase.input.disposition === "appointment" ? "send_offer" : null,
                next_action_due_at: null,
              },
              error: null,
            }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("QAAgent", () => {
  it("should produce a high score for good_call_nepq_approach", async () => {
    const goldCase = qaGoldDataset[0];
    setupQAMocks(goldCase);

    const { runQAAgent } = await import("./index");

    const result = await runQAAgent({
      callLogId: goldCase.input.callId,
      leadId: "test-lead-qa",
      triggerType: "post_call",
    });

    expect(result.overallRating).not.toBe("insufficient_data");
    expect(result.score).toBeGreaterThan(0);

    // Validate against gold dataset — score must be in plausible range for a good call
    const validationOutput = {
      overallScore: Math.round(result.score / 10), // normalize 0-100 to 0-10 scale
      nepqAdherence: result.overallRating === "excellent" || result.overallRating === "good" ? "strong" : "weak",
      shouldFlagIssues: result.flags.some(f => f.severity === "critical" || f.severity === "warning"),
    };

    const validation = validateAgentOutput("qa", "good_call_nepq_approach", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should produce a low score for bad_call_pushy_pitch", async () => {
    const goldCase = qaGoldDataset[1];
    setupQAMocks(goldCase);

    const { runQAAgent } = await import("./index");

    const result = await runQAAgent({
      callLogId: goldCase.input.callId,
      leadId: "test-lead-qa",
      triggerType: "post_call",
    });

    // The deterministic QA agent should detect issues on a pushy call
    // Short duration (60s with live answer) + no next_action = flags
    expect(result.score).toBeLessThan(70);

    const validationOutput = {
      overallScore: Math.round(result.score / 10),
      nepqAdherence: result.overallRating === "poor" || result.overallRating === "needs_improvement" ? "poor" : "moderate",
      shouldFlagIssues: result.flags.some(f => f.severity === "critical" || f.severity === "warning"),
      flagged: result.flags.some(f => f.severity === "critical" || f.severity === "warning"),
    };

    const validation = validateAgentOutput("qa", "bad_call_pushy_pitch", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should return empty result when agent is disabled", async () => {
    const { isAgentEnabled } = await import("@/lib/control-plane");
    vi.mocked(isAgentEnabled).mockResolvedValueOnce(false);

    const { runQAAgent } = await import("./index");

    const result = await runQAAgent({
      callLogId: "test-call-001",
      leadId: "test-lead-qa",
      triggerType: "post_call",
    });

    expect(result.overallRating).toBe("insufficient_data");
    expect(result.score).toBe(0);
  });
});
