import { describe, expect, it } from "vitest";
import { TINA_EXTREME_SMOKE_DRAFTS } from "@/tina/data/extreme-smoke-drafts";
import { buildTinaReviewBundle } from "@/tina/lib/review-bundle";
import { buildTinaScheduleCPdfExport } from "@/tina/lib/schedule-c-pdf";
import { buildTinaSmokeCaseReport } from "@/tina/lib/smoke-report";

describe("extreme smoke datasets", () => {
  it("covers the core weird-business scenarios Tina must keep surviving", () => {
    expect(TINA_EXTREME_SMOKE_DRAFTS.map((dataset) => dataset.id)).toEqual([
      "sole-prop-supported-core",
      "spouse-community-property-llc",
      "uneven-multi-owner-llc",
      "s-corp-elected-llc",
      "buyout-year-llc",
    ]);
  });

  TINA_EXTREME_SMOKE_DRAFTS.forEach((dataset) => {
    it(`builds stable artifacts for ${dataset.id}`, () => {
      const report = buildTinaSmokeCaseReport(dataset.draft);
      const bundle = buildTinaReviewBundle(dataset.draft);
      const pdf = buildTinaScheduleCPdfExport(dataset.draft);

      expect(report.startPath.route).toBe(dataset.expected.route);
      expect(report.startPath.recommendation.laneId).toBe(dataset.expected.laneId);
      expect(report.formReadiness.level).toBe(dataset.expected.formReadiness);
      expect(report.packageReadiness.level).toBe(dataset.expected.packageReadiness);
      expect(report.reviewBundleFileCount).toBeGreaterThanOrEqual(10);
      expect(report.federalReturnClassification.returnFamily.length).toBeGreaterThan(0);
      expect(report.ownershipCapitalEvents.eventCount).toBeGreaterThan(0);
      expect(report.taxTreatmentPolicy.decisions.length).toBeGreaterThanOrEqual(0);
      expect(report.booksReconstruction.areas.length).toBeGreaterThan(0);
      expect(report.evidenceSufficiency.lines.length).toBeGreaterThanOrEqual(0);
      expect(report.materialityPriority.items.length).toBeGreaterThanOrEqual(0);
      expect(report.officialFormTemplates.primaryTemplateId).not.toBeNull();
      expect(bundle.files.some((file) => file.id === "bundle-manifest")).toBe(true);
      expect(bundle.files.some((file) => file.id === "federal-return-classification")).toBe(true);
      expect(bundle.files.some((file) => file.id === "ownership-capital-events")).toBe(true);
      expect(bundle.files.some((file) => file.id === "tax-treatment-policy")).toBe(true);
      expect(bundle.files.some((file) => file.id === "books-reconstruction")).toBe(true);
      expect(bundle.files.some((file) => file.id === "evidence-sufficiency")).toBe(true);
      expect(bundle.files.some((file) => file.id === "materiality-priority")).toBe(true);
      expect(bundle.files.some((file) => file.id === "industry-playbooks")).toBe(true);
      expect(bundle.files.some((file) => file.id === "tax-opportunity-engine")).toBe(true);
      expect(bundle.files.some((file) => file.id === "authority-position-matrix")).toBe(true);
      expect(bundle.files.some((file) => file.id === "disclosure-readiness")).toBe(true);
      expect(bundle.files.some((file) => file.id === "reviewer-acceptance-forecast")).toBe(true);
      expect(bundle.files.some((file) => file.id === "companion-form-plan")).toBe(true);
      expect(bundle.files.some((file) => file.id === "cross-form-consistency")).toBe(true);
      expect(bundle.files.some((file) => file.id === "official-form-templates")).toBe(true);
      expect(pdf.bytes[0]).toBe(37);
      expect(report.industryPlaybooks.items.length).toBeGreaterThan(0);
      expect(report.taxOpportunityEngine.items.length).toBeGreaterThan(0);
      expect(report.authorityPositionMatrix.items.length).toBeGreaterThanOrEqual(0);
      expect(report.disclosureReadiness.items.length).toBeGreaterThanOrEqual(0);
      expect(report.reviewerAcceptanceForecast.items.length).toBeGreaterThanOrEqual(0);
      expect(report.companionFormPlan.items.length).toBeGreaterThan(0);

      if (dataset.expected.route === "supported") {
        expect(report.pdfFileName).toContain("schedule-c");
        expect(report.pdfFieldCount).toBeGreaterThan(0);
        expect(report.officialFormTemplates.primaryTemplateId).toBe("f1040sc");
        expect(report.crossFormConsistency.overallStatus).not.toBe("blocked");
      } else {
        expect(report.pdfFileName).toContain("start-path");
        expect(report.pdfValidationIssueCount).toBeGreaterThan(0);
        expect(report.formCoverage.items.every((item) => item.status === "unsupported")).toBe(true);
      }

      if (dataset.expected.laneId === "1065") {
        expect(report.officialFormTemplates.primaryTemplateId).toBe("f1065");
      }

      if (dataset.expected.laneId === "1120_s") {
        expect(report.officialFormTemplates.primaryTemplateId).toBe("f1120s");
      }
    }, 60000);
  });
});
