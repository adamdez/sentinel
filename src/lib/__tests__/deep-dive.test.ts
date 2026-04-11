import { describe, expect, it } from "vitest";
import { buildDeepDiveActionableItems, buildResearchGapSourceKey, evaluateDeepDiveReadiness } from "@/lib/deep-dive";

describe("evaluateDeepDiveReadiness", () => {
  it("marks a fully researched file ready", () => {
    expect(evaluateDeepDiveReadiness({
      research_quality: "full",
      research_gap_count: 0,
      likely_decision_maker: "Janet Bates",
    })).toEqual({
      ready: true,
      blockers: [],
    });
  });

  it("blocks files with open research gaps", () => {
    const result = evaluateDeepDiveReadiness({
      research_quality: "fallback",
      research_gap_count: 2,
      likely_decision_maker: "Janet Bates",
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("2 research gaps still open.");
  });

  it("blocks files without a confirmed decision-maker", () => {
    const result = evaluateDeepDiveReadiness({
      research_quality: "full",
      research_gap_count: 0,
      likely_decision_maker: null,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("No decision-maker has been confirmed yet.");
  });

  it("blocks degraded and needs-review runs", () => {
    expect(evaluateDeepDiveReadiness({
      research_quality: "degraded",
      research_gap_count: 0,
      likely_decision_maker: "Janet Bates",
    }).blockers[0]).toBe("Deep Search is degraded and needs a stronger pass.");

    expect(evaluateDeepDiveReadiness({
      research_quality: "needs_review",
      research_gap_count: 0,
      likely_decision_maker: "Janet Bates",
    }).blockers[0]).toBe("Deep Search still needs human review before calling.");
  });

  it("turns staged research gaps into actionable task items", () => {
    expect(buildDeepDiveActionableItems({
      leadId: "lead-1",
      research_quality: "fallback",
      research_gap_count: 2,
      research_gaps: ["Verify probate case number", "Confirm petitioner mailing address"],
      likely_decision_maker: "Janet Bates",
    })).toEqual([
      {
        key: "gap:verify_probate_case_number",
        label: "Verify probate case number",
        sourceType: "deep_search_gap",
        sourceKey: "lead-1:verify_probate_case_number",
      },
      {
        key: "gap:confirm_petitioner_mailing_address",
        label: "Confirm petitioner mailing address",
        sourceType: "deep_search_gap",
        sourceKey: "lead-1:confirm_petitioner_mailing_address",
      },
    ]);
  });

  it("matches the legacy Deep Search source-key format for research gaps", () => {
    expect(buildResearchGapSourceKey("lead-1", "Verify probate case number???")).toBe("lead-1:verify_probate_case_number_");
  });

  it("adds derived blocker tasks when decision-maker or review status is unresolved", () => {
    const actionable = buildDeepDiveActionableItems({
      leadId: "lead-1",
      research_quality: "degraded",
      research_gap_count: 0,
      research_gaps: [],
      likely_decision_maker: null,
    });

    expect(actionable).toEqual([
      {
        key: "blocker:stronger_pass",
        label: "Run a stronger Deep Search pass and verify official records.",
        sourceType: "deep_dive_blocker",
        sourceKey: "lead-1:stronger_pass",
      },
      {
        key: "blocker:decision_maker",
        label: "Confirm the decision-maker or authority contact path.",
        sourceType: "deep_dive_blocker",
        sourceKey: "lead-1:decision_maker",
      },
    ]);
  });
});
