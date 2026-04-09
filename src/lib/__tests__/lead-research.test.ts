import { describe, expect, it, vi } from "vitest";
import type { AgentFinding, DeepSkipPerson } from "@/lib/openclaw-client";

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(),
}));

const { extractNextOfKinCandidates, summarizeResearchSignals } = await import("@/lib/lead-research");

function person(overrides: Partial<DeepSkipPerson>): DeepSkipPerson {
  return {
    name: "Unknown Person",
    role: "owner",
    phones: [],
    emails: [],
    notes: "",
    source: "openclaw",
    confidence: 0.5,
    ...overrides,
  };
}

function finding(overrides: Partial<AgentFinding>): AgentFinding {
  return {
    agentId: "agent-1",
    category: "social_media",
    source: "Open Source",
    finding: "Generic finding",
    confidence: 0.5,
    ...overrides,
  };
}

describe("extractNextOfKinCandidates", () => {
  it("keeps estate-relevant people and sorts them by confidence", () => {
    const result = extractNextOfKinCandidates([
      person({ name: "Owner Person", role: "owner", confidence: 0.99 }),
      person({ name: "Jane Executor", role: "executor", confidence: 0.82, notes: "Named as executor in probate filing." }),
      person({ name: "Tim Heir", role: "heir", confidence: 0.74, phones: ["5095551111"] }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Jane Executor");
    expect(result[0].role).toBe("executor");
    expect(result[1].name).toBe("Tim Heir");
    expect(result[1].phones).toContain("5095551111");
  });

  it("includes spouse and attorney contacts but excludes unrelated categories", () => {
    const result = extractNextOfKinCandidates([
      person({ name: "Mia Spouse", role: "spouse", confidence: 0.61 }),
      person({ name: "Alex Attorney", role: "attorney", confidence: 0.58 }),
      person({ name: "Beth Contact", role: "owner", confidence: 0.8 }),
    ]);

    expect(result.map((item) => item.name)).toEqual(["Mia Spouse", "Alex Attorney"]);
  });
});

describe("summarizeResearchSignals", () => {
  it("counts corroborating hard-record findings even when normalized legal documents are missing", () => {
    const result = summarizeResearchSignals({
      legalDocumentsFound: 0,
      agentFindings: [
        finding({ category: "financial", finding: "Civil judgment lien filed against owner" }),
        finding({ category: "court_record", finding: "Probate case filed in superior court" }),
        finding({ category: "social_media", finding: "Facebook profile found" }),
      ],
    });

    expect(result.confirmedLegalRecords).toBe(0);
    expect(result.corroboratingHardRecordFindings).toBe(2);
  });
});
