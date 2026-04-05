import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEvidenceCredibility } from "@/tina/lib/evidence-credibility";

describe("evidence-credibility", () => {
  it("treats supported-core evidence as credible once completeness only counts evidence-facing blockers", () => {
    const snapshot = buildTinaEvidenceCredibility(TINA_SKILL_REVIEW_DRAFTS["supported-core"]);

    expect(snapshot.overallStatus).toBe("credible");
    expect(snapshot.factors.find((factor) => factor.dimension === "completeness")?.status).toBe(
      "strong"
    );
  });

  it("blocks dirty-books files when ledger integrity and reconciliation quality are still weak", () => {
    const snapshot = buildTinaEvidenceCredibility(TINA_SKILL_REVIEW_DRAFTS["dirty-books"]);

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.blockingFactorCount).toBeGreaterThan(0);
    expect(
      snapshot.factors.find((factor) => factor.dimension === "ledger_integrity")?.status
    ).toBe("blocked");
    expect(
      snapshot.factors.find((factor) => factor.dimension === "reconciliation_quality")?.status
    ).toBe("blocked");
  });

  it("treats thin-proof files as thin or blocked rather than credible", () => {
    const snapshot = buildTinaEvidenceCredibility(TINA_SKILL_REVIEW_DRAFTS["thin-proof"]);

    expect(["thin", "blocked"]).toContain(snapshot.overallStatus);
    expect(snapshot.concentratedGroupCount).toBeGreaterThanOrEqual(1);
  });
});
