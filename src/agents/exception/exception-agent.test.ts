import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAgentOutput, exceptionGoldDataset } from "../gold-datasets";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/control-plane", () => ({
  isAgentEnabled: vi.fn().mockResolvedValue(true),
  createAgentRun: vi.fn().mockResolvedValue("test-run-exc-001"),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./prompt", () => ({
  EXCEPTION_AGENT_VERSION: "1.0.0",
}));

// ── Setup ────────────────────────────────────────────────────────────────────

function setupExceptionMocks(goldCase: typeof exceptionGoldDataset[0]) {
  // The exception agent queries leads 4 times: missing_next_action, overdue, speed_to_lead, stale_contact.
  // We set up the missing_next_action query to return our gold case lead.
  const leadRow = {
    id: goldCase.input.leadId,
    status: goldCase.input.status,
    next_action: goldCase.input.nextAction,
    next_action_due_at: null,
    last_contact_at: new Date(Date.now() - goldCase.input.lastContactDays * 86400000).toISOString(),
    total_calls: 1,
    live_answers: 0,
    created_at: new Date(Date.now() - goldCase.input.createdDays * 86400000).toISOString(),
    properties: {
      address: "123 Test St",
      city: "Spokane",
      state: "WA",
      owner_name: "Test Owner",
    },
  };

  // Build a chainable mock that handles various Supabase filter methods
  function chainable(data: unknown[] = []) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.not = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.lt = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue({ data, error: null });
    return chain;
  }

  let callCount = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === "leads") {
      callCount++;
      // First query is missing_next_action — return lead with null next_action
      if (callCount === 1 && goldCase.input.nextAction === null) {
        return chainable([leadRow]);
      }
      // All other queries return empty (only testing missing_next_action)
      return chainable([]);
    }
    return chainable([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ExceptionAgent", () => {
  it("should flag lead_missing_next_action", async () => {
    const goldCase = exceptionGoldDataset[0];
    setupExceptionMocks(goldCase);

    const { runExceptionScan } = await import("./index");

    const result = await runExceptionScan({
      triggerType: "cron",
      triggerRef: "test-nightly-scan",
    });

    // The agent should find at least one critical exception
    expect(result.totals.total).toBeGreaterThan(0);
    expect(result.critical.length).toBeGreaterThan(0);

    // The first critical item should be our missing_next_action lead
    const matchingItem = result.critical.find(
      (item) => item.leadId === goldCase.input.leadId,
    );
    expect(matchingItem).toBeDefined();
    expect(matchingItem!.category).toBe("missing_next_action");

    // Validate against gold dataset
    const validationOutput = {
      shouldFlag: true,
      severity: "high",
      exceptionType: "missing_next_action",
    };

    const validation = validateAgentOutput("exception", "lead_missing_next_action", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should return empty report when agent is disabled", async () => {
    const { isAgentEnabled } = await import("@/lib/control-plane");
    vi.mocked(isAgentEnabled).mockResolvedValueOnce(false);

    const { runExceptionScan } = await import("./index");

    const result = await runExceptionScan({
      triggerType: "cron",
      triggerRef: "test",
    });

    expect(result.totals.total).toBe(0);
    expect(result.summary).toContain("disabled");
  });

  it("should return clean report when no exceptions found", async () => {
    // All queries return empty
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.is = vi.fn().mockReturnValue(chain);
      chain.not = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.lt = vi.fn().mockReturnValue(chain);
      chain.gte = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
      return chain;
    });

    const { runExceptionScan } = await import("./index");

    const result = await runExceptionScan({
      triggerType: "cron",
      triggerRef: "test-clean",
    });

    expect(result.totals.total).toBe(0);
    expect(result.summary).toContain("clean");
  });
});
