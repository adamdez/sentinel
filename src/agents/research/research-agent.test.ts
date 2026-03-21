import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAgentOutput, researchGoldDataset } from "../gold-datasets";

// ── Mock dependencies ────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

vi.mock("@/lib/control-plane", () => ({
  isAgentEnabled: vi.fn().mockResolvedValue(true),
  createAgentRun: vi.fn().mockResolvedValue("test-run-001"),
  completeAgentRun: vi.fn().mockResolvedValue(undefined),
  getAgentMode: vi.fn().mockResolvedValue("manual"),
  getFeatureFlag: vi.fn().mockResolvedValue({ enabled: false }),
  submitProposal: vi.fn().mockResolvedValue("proposal-001"),
  resolveReviewItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/intelligence", () => ({
  createArtifact: vi.fn().mockResolvedValue("artifact-001"),
  createFact: vi.fn().mockResolvedValue({ factId: "fact-001", contradictions: [] }),
  compileDossier: vi.fn().mockResolvedValue("dossier-001"),
  reviewDossier: vi.fn().mockResolvedValue(undefined),
  startResearchRun: vi.fn().mockResolvedValue("research-run-001"),
  closeResearchRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/claude-client", () => ({
  analyzeWithClaude: vi.fn().mockResolvedValue(JSON.stringify({
    artifacts: [
      {
        sourceUrl: "https://spokanecounty.org/probate/12345",
        sourceType: "probate_filing",
        sourceLabel: "Spokane County Probate Docket",
        extractedNotes: "Probate filed for Thompson estate. Margaret Thompson listed as personal representative.",
      },
      {
        sourceUrl: "https://spokanecounty.org/assessor/4215-n-monroe",
        sourceType: "assessor",
        sourceLabel: "Spokane County Assessor - 4215 N Monroe",
        extractedNotes: "Property assessed at $185,000. Single family residence, 3bd/1ba, built 1942.",
      },
    ],
    facts: [
      {
        factType: "probate_status",
        factValue: "Probate filed November 2025",
        confidence: "medium",
        artifactIndex: 0,
        promotedField: "situation_summary",
      },
      {
        factType: "ownership",
        factValue: "Margaret Thompson - personal representative, inherited from mother",
        confidence: "medium",
        artifactIndex: 0,
        promotedField: "owner_background",
      },
      {
        factType: "property_condition",
        factValue: "Vacant 6+ months, 1942 construction, likely deferred maintenance",
        confidence: "low",
        artifactIndex: 1,
        promotedField: "property_records",
      },
    ],
    dossier: {
      situationSummary: "Margaret Thompson inherited 4215 N Monroe from her deceased mother. She lives in Seattle and the property has been vacant for 6+ months. Probate filed November 2025.",
      likelyDecisionMaker: "Margaret Thompson (personal representative / sole heir)",
      recommendedCallAngle: "Lead with empathy about managing an inherited property from out of state. Acknowledge the burden of distance + vacant property maintenance.",
      topFacts: [
        { type: "probate_status", value: "Probate filed Nov 2025", confidence: "medium" },
        { type: "ownership", value: "Inherited from mother, sole heir", confidence: "medium" },
      ],
      verificationChecklist: [
        { item: "Verify probate case number", verified: false },
        { item: "Confirm sole heir status", verified: false },
      ],
      sourceLinks: [
        { url: "https://spokanecounty.org/probate/12345", label: "Probate docket" },
      ],
      contradictions: [],
    },
  })),
  extractJsonObject: vi.fn().mockImplementation((raw: string) => raw),
}));

vi.mock("./prompt", () => ({
  RESEARCH_AGENT_PROMPT: "You are a research agent.",
  RESEARCH_AGENT_MODEL: "claude-sonnet-4-20250514",
  RESEARCH_AGENT_VERSION: "1.0.0",
}));

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";

  // Chain Supabase mock: from().select().eq().single()
  mockSingle.mockResolvedValue({
    data: {
      id: "test-lead-003",
      status: "prospect",
      priority: "medium",
      source: "direct_mail",
      notes: null,
      tags: null,
      next_action: null,
      next_action_due_at: null,
      decision_maker_note: null,
      properties: {
        id: "prop-001",
        address: "4215 N Monroe St",
        city: "Spokane",
        state: "WA",
        zip: "99205",
        county: "Spokane",
        owner_name: "Margaret Thompson",
        owner_phone: null,
        estimated_value: 185000,
        equity_percent: 100,
        property_type: "SFR",
        year_built: 1942,
        bedrooms: 3,
        bathrooms: 1,
        sqft: 1200,
        lot_size: 6500,
      },
      contacts: [
        { first_name: "Margaret", last_name: "Thompson", phone: null, email: null },
      ],
    },
    error: null,
  });
  mockEq.mockReturnValue({ single: mockSingle });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
  mockFrom.mockImplementation((table: string) => {
    if (table === "dossier_artifacts") return { update: mockUpdate };
    return { select: mockSelect };
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ResearchAgent", () => {
  it("should produce valid output for spokane_inherited_property", async () => {
    const { runResearchAgent } = await import("./index");
    const goldCase = researchGoldDataset[0];

    const result = await runResearchAgent({
      leadId: goldCase.input.leadId,
      triggeredBy: "test-operator",
    });

    // Agent should complete successfully
    expect(result.status).not.toBe("failed");
    expect(result.artifactCount).toBeGreaterThan(0);
    expect(result.factCount).toBeGreaterThan(0);
    expect(result.dossierId).toBeTruthy();

    // Validate against gold dataset
    const validationOutput = {
      artifactsCreated: result.artifactCount,
      factsCreated: result.factCount,
      dossierId: result.dossierId,
    };

    const validation = validateAgentOutput("research", "spokane_inherited_property", validationOutput);
    expect(validation).not.toBeNull();
    expect(validation!.pass).toBe(true);
  });

  it("should return failed when agent is disabled", async () => {
    const { isAgentEnabled } = await import("@/lib/control-plane");
    vi.mocked(isAgentEnabled).mockResolvedValueOnce(false);

    const { runResearchAgent } = await import("./index");

    const result = await runResearchAgent({
      leadId: "test-lead-003",
      triggeredBy: "test-operator",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("disabled");
  });

  it("should handle dedup guard (already running)", async () => {
    const { createAgentRun } = await import("@/lib/control-plane");
    vi.mocked(createAgentRun).mockResolvedValueOnce(null as unknown as string);

    const { runResearchAgent } = await import("./index");

    const result = await runResearchAgent({
      leadId: "test-lead-003",
      triggeredBy: "test-operator",
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("duplicate");
  });
});
