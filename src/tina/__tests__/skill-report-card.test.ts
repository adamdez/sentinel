import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaSkillReportCard, renderTinaSkillReportCardMarkdown } from "@/tina/lib/skill-report-card";
import { buildTinaSmokeCaseReport } from "@/tina/lib/smoke-report";

const reports = Object.fromEntries(
  Object.entries(TINA_SKILL_REVIEW_DRAFTS).map(([id, draft]) => [id, buildTinaSmokeCaseReport(draft)])
);

function report(id: keyof typeof reports) {
  return reports[id];
}

describe("tina skill report card challenge harness", () => {
  it("attacks technical tax law with route-family and authority-backed treatment conflicts", () => {
    expect(report("supported-core").federalReturnRequirements.returnFamily).toBe("Form 1040 Schedule C");
    expect(report("s-corp-election").federalReturnRequirements.returnFamily).toBe("S-corporation return");
    expect(report("buyout-year").federalReturnRequirements.returnFamily).toBe("Partnership return");
    expect(
      report("sales-tax-authority").treatmentJudgment.items.find((item) => item.id === "sales-tax-treatment")
        ?.taxPositionBucket
    ).toBe("use");
  });

  it("attacks accounting fluency with dirty books and thin proof", () => {
    expect(report("dirty-books").booksNormalization.issues.some((issue) => issue.id === "owner-flow-normalization")).toBe(true);
    expect(report("dirty-books").booksNormalization.issues.some((issue) => issue.id === "mixed-use-normalization")).toBe(true);
    expect(report("dirty-books").booksReconciliation.overallStatus).not.toBe("reconciled");
    expect(report("thin-proof").evidenceSufficiency.overallStatus).not.toBe("reviewer_grade");
  });

  it("attacks fact-pattern judgment with spouse-exception and buyout-year traps", () => {
    expect(report("spouse-community-property").startPath.route).toBe("review_only");
    expect(report("spouse-community-property").startPath.proofRequirements.length).toBeGreaterThan(0);
    expect(report("buyout-year").ownershipCapitalEvents.eventCount).toBeGreaterThan(0);
    expect(report("thin-proof").startPath.route).toBe("supported");
  });

  it("attacks entity classification across partnership and S-election routes", () => {
    expect(report("uneven-multi-owner").startPath.recommendation.laneId).toBe("1065");
    expect(report("s-corp-election").startPath.recommendation.laneId).toBe("1120_s");
    expect(report("buyout-year").startPath.route).toBe("blocked");
    expect(report("uneven-multi-owner").entityReturnRunbook.executionMode).not.toBe("tina_supported");
  });

  it("attacks tax treatment selection with reject, review, and use buckets", () => {
    expect(report("dirty-books").treatmentJudgment.items.some((item) => item.taxPositionBucket === "reject")).toBe(true);
    expect(report("dirty-books").treatmentJudgment.items.some((item) => item.taxPositionBucket === "review")).toBe(true);
    expect(
      report("sales-tax-authority").treatmentJudgment.items.find((item) => item.id === "sales-tax-treatment")
        ?.taxPositionBucket
    ).toBe("use");
    expect(report("creator-media").treatmentJudgment.items.length).toBeGreaterThan(0);
  });

  it("attacks record and evidence analysis with strong, weak, and blocked support states", () => {
    expect(report("supported-core").evidenceSufficiency.counts.strong).toBeGreaterThan(0);
    expect(report("thin-proof").evidenceSufficiency.issues.length).toBeGreaterThan(0);
    expect(report("dirty-books").evidenceSufficiency.overallStatus).toBe("blocked");
    expect(report("dirty-books").formTrace.lines.length).toBeGreaterThanOrEqual(0);
  });

  it("attacks risk and materiality judgment with blocked lanes and stale signoff", () => {
    expect(report("buyout-year").operationalStatus.blockers.length).toBeGreaterThan(0);
    expect(report("dirty-books").materialityPriority.overallStatus).not.toBe("monitor_only");
    expect(report("drifted-package").operationalStatus.packageState).toBe("signed_off_stale");
  });

  it("attacks tax planning and savings identification with planning board friction", () => {
    expect(report("supported-core").taxOpportunityEngine.items.length).toBeGreaterThan(0);
    expect(report("sales-tax-authority").planningActionBoard.items.length).toBeGreaterThan(0);
    expect(report("creator-media").taxPlanningMemo.overallStatus).not.toBe("idle");
  });

  it("attacks form and compliance execution with supported, thin, and blocked lanes", () => {
    expect(report("supported-core").officialFormExecution.overallStatus).not.toBe("blocked");
    expect(report("supported-core").officialFormFill.mode).toBe("overlay_plan");
    expect(report("thin-proof").officialFormExecution.overallStatus).not.toBe("ready_to_fill");
    expect(report("s-corp-election").officialFormExecution.overallStatus).toBe("blocked");
  });

  it("attacks review and error detection with drift, cross-form, and challenge forecasts", () => {
    expect(report("dirty-books").reviewerChallenges.items.length).toBeGreaterThan(0);
    expect(report("dirty-books").crossFormConsistency.overallStatus).not.toBe("clear");
    expect(report("drifted-package").operationalStatus.packageState).toBe("signed_off_stale");
    expect(report("supported-core").pdfValidationIssueCount).toBeGreaterThanOrEqual(0);
  });

  it("attacks documentation and defensibility with bundle and briefing depth", () => {
    expect(report("supported-core").reviewBundleFileCount).toBeGreaterThanOrEqual(10);
    expect(report("dirty-books").decisionBriefings.reviewer.openQuestions.length).toBeGreaterThan(0);
    expect(report("buyout-year").pdfValidationIssueCount).toBeGreaterThan(0);
  });

  it("attacks client communication with owner and reviewer briefings", () => {
    expect(report("thin-proof").decisionBriefings.owner.openQuestions.length).toBeGreaterThan(0);
    expect(report("spouse-community-property").decisionBriefings.reviewer.openQuestions.length).toBeGreaterThan(0);
    expect(report("creator-media").decisionBriefings.owner.keyPoints.length).toBeGreaterThan(0);
  });

  it("attacks workflow and case management with blocked and stale package states", () => {
    expect(report("drifted-package").operationalStatus.packageState).toBe("signed_off_stale");
    expect(report("buyout-year").packageReadiness.level).toBe("blocked");
    expect(report("supported-core").packageReadiness.level).toBe("ready_for_cpa");
  });

  it("attacks industry and scenario familiarity with creator, trades, and ecommerce cases", () => {
    expect(report("creator-media").industryPlaybooks.primaryIndustryId).toBe("creator_media");
    expect(report("dirty-books").industryPlaybooks.primaryIndustryId).toBe("skilled_trades");
    expect(report("sales-tax-authority").industryPlaybooks.primaryIndustryId).toBe("e_commerce_retail");
  });

  it("attacks ethics and professional responsibility with unsupported-position discipline", () => {
    expect(report("thin-proof").formReadiness.level).not.toBe("reviewer_ready");
    expect(report("dirty-books").treatmentJudgment.items.some((item) => item.taxPositionBucket === "reject")).toBe(true);
    expect(report("buyout-year").startPath.route).toBe("blocked");
  });

  it("attacks practice judgment with sequencing and stale-signoff prioritization", () => {
    expect(report("dirty-books").materialityPriority.items.some((item) => item.priority === "immediate")).toBe(true);
    expect(report("sales-tax-authority").planningActionBoard.items.length).toBeGreaterThan(0);
    expect(report("drifted-package").operationalStatus.packageState).toBe("signed_off_stale");
  });

  it("builds a 16-skill report card with a seven-agent panel", () => {
    const card = buildTinaSkillReportCard();

    expect(card.panelCount).toBe(7);
    expect(card.skills).toHaveLength(16);
    expect(card.skills.every((skill) => skill.panelNotes.length === 7)).toBe(true);
    expect(card.overallScore).toBeGreaterThan(0);
  }, 20000);

  it("renders a school-style markdown report card with all skills and panel notes", () => {
    const markdown = renderTinaSkillReportCardMarkdown(buildTinaSkillReportCard());

    expect(markdown).toContain("# Tina School Report Card");
    expect(markdown).toContain("## 1. Technical Tax Law");
    expect(markdown).toContain("## 16. Practice Judgment");
    expect(markdown).toContain("Seven-agent panel notes");
  }, 20000);
});
