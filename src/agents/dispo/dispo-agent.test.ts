import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAgentOutput, dispoGoldDataset } from "../gold-datasets";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/control-plane", () => ({
  isAgentEnabled: vi.fn().mockResolvedValue(true),
  createAgentRun: vi.fn().mockResolvedValue("test-run-dispo-001"),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
  submitProposal: vi.fn().mockResolvedValue("proposal-dispo-001"),
}));

vi.mock("@/lib/buyer-fit", () => ({
  scoreBuyers: vi.fn().mockReturnValue([
    {
      buyer: {
        id: "buyer-001",
        contact_name: "Jake Morrison",
        company_name: "Morrison Rehabs LLC",
        phone: "+15091112222",
        email: "jake@morrisonrehabs.com",
        preferred_contact_method: "phone",
        markets: ["spokane_county"],
        price_range_low: 100000,
        price_range_high: 250000,
        asset_types: ["SFR"],
        funding_type: "cash",
        proof_of_funds: true,
        rehab_tolerance: "heavy",
        reliability_score: 4,
        deals_closed: 12,
        status: "active",
      },
      score: 85,
      flags: ["exact_market_match", "price_in_range"],
      stale: false,
    },
    {
      buyer: {
        id: "buyer-002",
        contact_name: "Sarah Kim",
        company_name: "Kim Properties",
        phone: "+15093334444",
        email: "sarah@kimprops.com",
        preferred_contact_method: "email",
        markets: ["spokane_county"],
        price_range_low: 50000,
        price_range_high: 200000,
        asset_types: ["SFR", "duplex"],
        funding_type: "hard_money",
        proof_of_funds: true,
        rehab_tolerance: "medium",
        reliability_score: 3,
        deals_closed: 5,
        status: "active",
      },
      score: 72,
      flags: ["exact_market_match"],
      stale: false,
    },
    {
      buyer: {
        id: "buyer-003",
        contact_name: "Tom Wheeler",
        company_name: null,
        phone: "+15095556666",
        email: null,
        preferred_contact_method: "phone",
        markets: ["spokane_county", "kootenai_county"],
        price_range_low: 120000,
        price_range_high: 300000,
        asset_types: ["SFR"],
        funding_type: "cash",
        proof_of_funds: false,
        rehab_tolerance: "light",
        reliability_score: 2,
        deals_closed: 2,
        status: "active",
      },
      score: 55,
      flags: [],
      stale: false,
    },
  ]),
  rankedRadarEntries: vi.fn().mockImplementation((results: unknown[]) => results),
}));

vi.mock("@/lib/claude-client", () => ({
  analyzeWithClaude: vi.fn().mockResolvedValue(JSON.stringify({
    drafts: [
      {
        buyerId: "buyer-001",
        buyerName: "Jake Morrison",
        channel: "phone",
        body: "Hey Jake, got a 3/2 in East Central Spokane. ARV $285k, needs roof and kitchen. Contract at $155k with a $12k assignment. Right in your wheelhouse — interested?",
        reasoning: "Jake is a heavy rehab buyer in Spokane with cash. Perfect fit for this deal.",
      },
      {
        buyerId: "buyer-002",
        buyerName: "Sarah Kim",
        channel: "email",
        subject: "New Deal: 3/2 SFR in East Central Spokane - $155k",
        body: "Hi Sarah, new deal just came in. 3bd/2ba SFR at 2847 E 5th Ave. ARV $285k, repairs ~$42k, contract $155k. Let me know if you want details.",
        reasoning: "Sarah buys in Spokane, price range fits. Email preferred.",
      },
      {
        buyerId: "buyer-003",
        buyerName: "Tom Wheeler",
        channel: "phone",
        body: "Tom, quick one — 3/2 SFR in East Central, $155k contract, $285k ARV. Needs some work but solid bones. Want to take a look?",
        reasoning: "Tom is in market but lower reliability. Still worth reaching out.",
      },
    ],
  })),
}));

vi.mock("./prompt", () => ({
  DISPO_AGENT_VERSION: "1.0.0",
  DISPO_AGENT_MODEL: "claude-sonnet-4-20250514",
  DISPO_SYSTEM_PROMPT: "You are a dispo agent.",
}));

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";

  const goldCase = dispoGoldDataset[0];

  mockFrom.mockImplementation((table: string) => {
    if (table === "deals") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: goldCase.input.dealId,
                lead_id: "test-lead-dispo-001",
                status: "under_contract",
                contract_price: goldCase.input.contractPrice,
                arv: goldCase.input.arv,
                repair_estimate: goldCase.input.repairEstimate,
                assignment_fee: goldCase.input.assignmentFee,
                dispo_prep: null,
                entered_dispo_at: new Date().toISOString(),
                leads: {
                  id: "test-lead-dispo-001",
                  first_name: "Test",
                  last_name: "Seller",
                  status: "lead",
                  motivation_level: 4,
                  properties: {
                    address: goldCase.input.propertyAddress.split(",")[0],
                    city: "Spokane",
                    state: "WA",
                    zip: "99202",
                    county: "Spokane",
                    owner_name: "Test Seller",
                  },
                },
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "buyers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [{ id: "buyer-001" }, { id: "buyer-002" }, { id: "buyer-003" }],
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "deal_buyers") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("DispoAgent", () => {
  it("should produce valid output for strong_fix_flip_candidate", async () => {
    const { runDispoAgent } = await import("./index");
    const goldCase = dispoGoldDataset[0];

    const result = await runDispoAgent({
      dealId: goldCase.input.dealId as string,
      leadId: "test-lead-dispo-001",
      triggerType: "operator_request",
    });

    expect(result.status).not.toBe("failed");
    expect(result.drafts.length).toBeGreaterThan(0);

    // Validate against gold dataset
    const validationOutput = {
      buyerType: "fix_and_flip",
      shouldMatchBuyers: true,
      buyerCount: result.drafts.length,
    };

    const validation = validateAgentOutput("dispo", "strong_fix_flip_candidate", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should generate drafts for at least 3 buyers (gold dataset minBuyersToContact)", async () => {
    const { runDispoAgent } = await import("./index");

    const result = await runDispoAgent({
      dealId: "test-deal-001",
      leadId: "test-lead-dispo-001",
      triggerType: "operator_request",
    });

    expect(result.drafts.length).toBeGreaterThanOrEqual(
      dispoGoldDataset[0].expectedOutput.minBuyersToContact,
    );
  });

  it("should return disabled when agent is disabled", async () => {
    const { isAgentEnabled } = await import("@/lib/control-plane");
    vi.mocked(isAgentEnabled).mockResolvedValueOnce(false);

    const { runDispoAgent } = await import("./index");

    const result = await runDispoAgent({
      dealId: "test-deal-001",
      leadId: "test-lead-dispo-001",
      triggerType: "operator_request",
    });

    expect(result.status).toBe("disabled");
  });
});
