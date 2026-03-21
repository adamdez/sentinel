import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAgentOutput, followUpGoldDataset } from "../gold-datasets";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockIs = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/control-plane", () => ({
  isAgentEnabled: vi.fn().mockResolvedValue(true),
  createAgentRun: vi.fn().mockResolvedValue("test-run-fu-001"),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
  submitProposal: vi.fn().mockResolvedValue("proposal-fu-001"),
}));

// Return a follow-up draft via the Claude mock
function makeDraftResponse(channel: string, body: string) {
  return JSON.stringify({
    drafts: [
      {
        channel,
        body,
        reasoning: "Test reasoning for follow-up draft",
        sellerMemoryUsed: ["inherited_property"],
      },
    ],
  });
}

vi.mock("@/lib/claude-client", () => ({
  analyzeWithClaude: vi.fn(),
}));

vi.mock("./prompt", () => ({
  FOLLOW_UP_AGENT_VERSION: "1.0.0",
  FOLLOW_UP_AGENT_MODEL: "claude-sonnet-4-20250514",
  FOLLOW_UP_SYSTEM_PROMPT: "You are a follow-up agent.",
}));

// ── Setup ────────────────────────────────────────────────────────────────────

function setupSupabaseMock(goldInput: typeof followUpGoldDataset[0]["input"]) {
  // Lead query chain: from("leads").select(...).eq("id", ...).single()
  const leadData = {
    id: goldInput.leadId,
    first_name: goldInput.leadName.split(" ")[0],
    last_name: goldInput.leadName.split(" ").slice(1).join(" "),
    phone: goldInput.phone,
    email: goldInput.email,
    status: goldInput.status,
    source: "direct_mail",
    next_action: "follow_up_call",
    next_action_due_at: null,
    notes: goldInput.sellerSituation,
    motivation_level: 3,
    last_contact_at: new Date(Date.now() - goldInput.lastContactDays * 86400000).toISOString(),
    total_calls: goldInput.totalCalls,
    live_answers: goldInput.liveAnswers,
    properties: {
      address: goldInput.address.split(",")[0].trim(),
      city: goldInput.address.split(",")[1]?.trim()?.split(" ")[0] ?? "",
      state: goldInput.state,
      zip: goldInput.address.match(/\d{5}/)?.[0] ?? "",
      owner_name: goldInput.leadName,
    },
  };

  mockFrom.mockImplementation((table: string) => {
    if (table === "leads") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: leadData, error: null }),
          }),
        }),
      };
    }
    // calls_log, dialer_sessions, fact_assertions — return empty
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FollowUpAgent", () => {
  it("should produce valid output for stale_seller_wa_call_only (WA = call channel)", async () => {
    const goldCase = followUpGoldDataset[0];
    setupSupabaseMock(goldCase.input);

    // Mock Claude to return a call-channel draft mentioning inherited property
    const { analyzeWithClaude } = await import("@/lib/claude-client");
    vi.mocked(analyzeWithClaude).mockResolvedValueOnce(
      makeDraftResponse("call",
        "Hi Margaret, this is Logan with Dominion Home Deals. I wanted to follow up about the property on Monroe that you inherited from your mother. I know managing a property from Seattle can be a lot to handle, especially after losing a parent. I just wanted to check in and see if you had any questions about what we discussed.",
      ),
    );

    const { runFollowUpAgent } = await import("./index");

    const result = await runFollowUpAgent({
      leadId: goldCase.input.leadId,
      triggerType: "stale_lead",
    });

    expect(result.status).not.toBe("failed");
    expect(result.drafts.length).toBeGreaterThan(0);

    // Validate first draft against gold dataset
    const draft = result.drafts[0];
    const validationOutput = {
      channel: draft.channel,
      body: draft.body,
      urgencyScore: 7,
    };

    const validation = validateAgentOutput("follow-up", "stale_seller_wa_call_only", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should produce valid output for stale_seller_id_auto_channel", async () => {
    const goldCase = followUpGoldDataset[1];
    setupSupabaseMock(goldCase.input);

    const { analyzeWithClaude } = await import("@/lib/claude-client");
    vi.mocked(analyzeWithClaude).mockResolvedValueOnce(
      makeDraftResponse("sms",
        "Hi Robert, this is Logan with Dominion Home Deals. I know dealing with difficult tenants can be exhausting. If you're still thinking about selling the property on Best Ave, I'd love to chat about what a simple exit could look like for you. No pressure at all.",
      ),
    );

    const { runFollowUpAgent } = await import("./index");

    const result = await runFollowUpAgent({
      leadId: goldCase.input.leadId,
      triggerType: "stale_lead",
    });

    expect(result.status).not.toBe("failed");
    expect(result.drafts.length).toBeGreaterThan(0);

    const draft = result.drafts[0];
    const validationOutput = {
      channel: draft.channel,
      body: draft.body,
      urgencyScore: 6,
    };

    const validation = validateAgentOutput("follow-up", "stale_seller_id_auto_channel", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should return disabled when agent is disabled", async () => {
    const { isAgentEnabled } = await import("@/lib/control-plane");
    vi.mocked(isAgentEnabled).mockResolvedValueOnce(false);

    const { runFollowUpAgent } = await import("./index");

    const result = await runFollowUpAgent({
      leadId: "test-lead-001",
      triggerType: "stale_lead",
    });

    expect(result.status).toBe("disabled");
  });
});
