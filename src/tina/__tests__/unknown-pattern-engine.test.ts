import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";

describe("unknown-pattern-engine", () => {
  it("stays in continue mode for clean supported-core files", () => {
    const snapshot = buildTinaUnknownPatternEngine(TINA_SKILL_REVIEW_DRAFTS["supported-core"]);

    expect(snapshot.overallStatus).toBe("known_pattern");
    expect(snapshot.recommendedHandling).toBe("continue");
    expect(snapshot.leadingHypothesisId).toBeTruthy();
    expect(snapshot.hypotheses.some((hypothesis) => hypothesis.status === "leading")).toBe(true);
  });

  it("keeps competing hypotheses alive when prior-return drift muddies the lane", () => {
    const snapshot = buildTinaUnknownPatternEngine(TINA_SKILL_REVIEW_DRAFTS["prior-return-drift"]);
    const leadingHypothesis = snapshot.hypotheses.find((hypothesis) => hypothesis.status === "leading");

    expect(snapshot.overallStatus).not.toBe("known_pattern");
    expect(snapshot.recommendedHandling).not.toBe("continue");
    expect(snapshot.signals.some((signal) => signal.category === "cross_year_drift")).toBe(true);
    expect(snapshot.signals.some((signal) => signal.category === "entity_ambiguity")).toBe(true);
    expect(snapshot.signals.some((signal) => signal.category === "entity_continuity")).toBe(true);
    expect(
      snapshot.signals.some((signal) => signal.category === "document_intelligence")
    ).toBe(true);
    expect(snapshot.hypotheses.length).toBeGreaterThan(1);
    expect(leadingHypothesis?.stabilityScore).toBeGreaterThan(0);
    expect(leadingHypothesis?.recommendedFirstQuestion).toBeTruthy();
    expect(
      snapshot.customProofRequests.some((request) =>
        /current-year election|filed federal return/i.test(request)
      )
    ).toBe(true);
    expect(
      snapshot.customProofRequests.some((request) =>
        /entity continuity question/i.test(request)
      )
    ).toBe(true);
  });

  it("blocks nearest-bucket confidence when messy evidence and treatment friction cluster together", () => {
    const snapshot = buildTinaUnknownPatternEngine(TINA_SKILL_REVIEW_DRAFTS["dirty-books"]);

    expect(snapshot.overallStatus).toBe("novel_pattern");
    expect(snapshot.recommendedHandling).toBe("blocked_until_proved");
    expect(snapshot.signals.some((signal) => signal.category === "messy_evidence")).toBe(true);
    expect(snapshot.signals.some((signal) => signal.category === "treatment_novelty")).toBe(true);
    expect(
      snapshot.signals.some(
        (signal) =>
          signal.category === "document_intelligence" && /multiple EINs/i.test(signal.summary)
      )
    ).toBe(true);
    expect(
      snapshot.customProofRequests.some((request) =>
        /independent books package/i.test(request)
      )
    ).toBe(true);
    expect(
      snapshot.customProofRequests.some((request) =>
        /which EIN belongs to the current filing entity/i.test(request)
      )
    ).toBe(true);
  });
});
