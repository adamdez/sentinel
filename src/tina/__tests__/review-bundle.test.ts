import { describe, expect, it } from "vitest";
import { buildTinaReviewBundle } from "@/tina/lib/review-bundle";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("review-bundle", () => {
  it("builds a multi-file reviewer bundle from the live Tina draft", { timeout: 15000 }, () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Bundle Test LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-advertising",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 700,
            status: "ready" as const,
            summary: "Advertising expense candidate",
            sourceDocumentIds: ["doc-advertising"],
            sourceFactIds: ["fact-advertising"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-advertising"],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income"],
          },
          {
            id: "line-8-advertising",
            lineNumber: "Line 8",
            label: "Advertising",
            amount: 700,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-advertising"],
            taxAdjustmentIds: ["tax-advertising"],
            sourceDocumentIds: ["doc-advertising"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete" as const,
      },
    };

    const bundle = buildTinaReviewBundle(draft);

    expect(bundle.sourceMode).toBe("live_draft");
    expect(bundle.files.some((file) => file.id === "cpa-packet")).toBe(true);
    expect(bundle.files.some((file) => file.id === "schedule-c-pdf")).toBe(true);
    expect(bundle.files.some((file) => file.id === "schedule-c-trace")).toBe(true);
    expect(bundle.files.some((file) => file.id === "form-coverage")).toBe(true);
    expect(bundle.files.some((file) => file.id === "form-readiness")).toBe(true);
    expect(bundle.files.some((file) => file.id === "official-form-templates")).toBe(true);
    expect(bundle.files.some((file) => file.id === "official-form-fill")).toBe(true);
    expect(bundle.files.some((file) => file.id === "official-form-execution")).toBe(true);
    expect(bundle.files.some((file) => file.id === "federal-return-classification")).toBe(true);
    expect(bundle.files.some((file) => file.id === "entity-filing-remediation")).toBe(true);
    expect(bundle.files.some((file) => file.id === "single-member-entity-history-proof")).toBe(
      true
    );
    expect(bundle.files.some((file) => file.id === "single-owner-corporate-route-proof")).toBe(true);
    expect(bundle.files.some((file) => file.id === "unknown-pattern-engine")).toBe(true);
    expect(bundle.files.some((file) => file.id === "confidence-calibration")).toBe(true);
    expect(bundle.files.some((file) => file.id === "document-intelligence")).toBe(true);
    expect(bundle.files.some((file) => file.id === "case-memory-ledger")).toBe(true);
    expect(bundle.files.some((file) => file.id === "reviewer-learning-loop")).toBe(true);
    expect(bundle.files.some((file) => file.id === "reviewer-observed-deltas")).toBe(true);
    expect(bundle.files.some((file) => file.id === "reviewer-override-governance")).toBe(true);
    expect(bundle.files.some((file) => file.id === "reviewer-policy-versioning")).toBe(true);
    expect(bundle.files.some((file) => file.id === "reviewer-acceptance-reality")).toBe(true);
    expect(bundle.files.some((file) => file.id === "entity-judgment")).toBe(true);
    expect(bundle.files.some((file) => file.id === "federal-return-requirements")).toBe(true);
    expect(bundle.files.some((file) => file.id === "ownership-capital-events")).toBe(true);
    expect(bundle.files.some((file) => file.id === "ownership-timeline")).toBe(true);
    expect(bundle.files.some((file) => file.id === "tax-treatment-policy")).toBe(true);
    expect(bundle.files.some((file) => file.id === "treatment-judgment")).toBe(true);
    expect(bundle.files.some((file) => file.id === "start-path")).toBe(true);
    expect(bundle.files.some((file) => file.id === "materiality-priority")).toBe(true);
    expect(bundle.files.some((file) => file.id === "evidence-sufficiency")).toBe(true);
    expect(bundle.files.some((file) => file.id === "reviewer-challenges")).toBe(true);
    expect(bundle.files.some((file) => file.id === "books-reconstruction")).toBe(true);
    expect(bundle.files.some((file) => file.id === "ledger-reconstruction")).toBe(true);
    expect(bundle.files.some((file) => file.id === "evidence-credibility")).toBe(true);
    expect(bundle.files.some((file) => file.id === "accounting-artifact-coverage")).toBe(true);
    expect(bundle.files.some((file) => file.id === "books-reconciliation")).toBe(true);
    expect(bundle.files.some((file) => file.id === "books-normalization")).toBe(true);
    expect(bundle.files.some((file) => file.id === "industry-playbooks")).toBe(true);
    expect(bundle.files.some((file) => file.id === "industry-evidence-matrix")).toBe(true);
    expect(bundle.files.some((file) => file.id === "tax-opportunity-engine")).toBe(true);
    expect(bundle.files.some((file) => file.id === "tax-planning-memo")).toBe(true);
    expect(bundle.files.some((file) => file.id === "planning-action-board")).toBe(true);
    expect(bundle.files.some((file) => file.id === "authority-position-matrix")).toBe(true);
    expect(bundle.files.some((file) => file.id === "disclosure-readiness")).toBe(true);
    expect(bundle.files.some((file) => file.id === "reviewer-acceptance-forecast")).toBe(true);
    expect(bundle.files.some((file) => file.id === "document-request-plan")).toBe(true);
    expect(bundle.files.some((file) => file.id === "attachment-statements")).toBe(true);
    expect(bundle.files.some((file) => file.id === "attachment-schedules")).toBe(true);
    expect(bundle.files.some((file) => file.id === "decision-briefings")).toBe(true);
    expect(bundle.files.some((file) => file.id === "companion-form-calculations")).toBe(true);
    expect(bundle.files.some((file) => file.id === "companion-form-render-plan")).toBe(true);
    expect(bundle.files.some((file) => file.id === "companion-form-plan")).toBe(true);
    expect(bundle.files.some((file) => file.id === "cross-form-consistency")).toBe(true);
    expect(bundle.files.some((file) => file.id === "entity-record-matrix")).toBe(true);
    expect(bundle.files.some((file) => file.id === "entity-economics-readiness")).toBe(true);
    expect(bundle.files.some((file) => file.id === "owner-flow-basis-adjudication")).toBe(true);
    expect(bundle.files.some((file) => file.id === "entity-return-calculations")).toBe(true);
    expect(bundle.files.some((file) => file.id === "entity-return-schedule-families")).toBe(true);
    expect(bundle.files.some((file) => file.id === "entity-return-schedule-family-finalizations")).toBe(
      true
    );
    expect(bundle.files.some((file) => file.id === "entity-return-schedule-family-payloads")).toBe(
      true
    );
    expect(bundle.files.some((file) => file.id === "entity-return-runbook")).toBe(true);
    expect(bundle.files.find((file) => file.id === "schedule-c-pdf")?.encoding).toBe("base64");
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"taxTreatmentPolicyStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"materialityPriorityStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"federalReturnClassificationConfidence\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityFilingRemediationOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityFilingRemediationHistoryStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityFilingRemediationElectionStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityFilingRemediationAmendmentStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"singleMemberEntityHistoryOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"singleMemberEntityHistoryBooksPostureStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"singleOwnerCorporateRouteOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"singleOwnerCorporateRoutePayrollRequirementStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"unknownPatternOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"unknownPatternCustomProofRequestCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"confidenceCalibrationStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"confidenceCalibrationDebtCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"caseMemoryLedgerStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"caseMemoryOpenOverrideCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerLearningLoopStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerLearningPolicyCandidateCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerObservedDeltasOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerObservedDeltaCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerOverrideGovernanceOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerOverrideGovernanceBlockingAcceptanceDeltaCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerPolicyVersioningOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerPolicyVersioningBenchmarkCoverageGapCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerAcceptanceRealityOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerAcceptanceRealityObservedAcceptanceRate\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"evidenceSufficiencyStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"ownershipCapitalOverallStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"booksReconstructionStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"ledgerReconstructionStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"evidenceCredibilityStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"booksReconciliationStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"primaryIndustryId\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"industryEvidenceMatrixStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"readyTaxOpportunityCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"companionFormPlanCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"crossFormConsistencyStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"primaryOfficialFormTemplateId\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"officialFormFillStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"officialFormExecutionStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"accountingArtifactCoverageStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"attachmentStatementCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"attachmentScheduleCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"taxPlanningMemoStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"planningActionBoardStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"authorityPositionMatrixStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"disclosureReadinessStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerAcceptanceStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"documentRequestPlanStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"companionFormCalculationStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"companionFormRenderPlanStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"companionFormRenderPayloadCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityRecordMatrixStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityEconomicsStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"ownerFlowBasisOverallStatus\""
    );
      expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
        "\"ownerFlowBasisBlockedCount\""
      );
      expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
        "\"ownerFlowBasisRollforwardStatus\""
      );
      expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
        "\"entityReturnCalculationsStatus\""
      );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityReturnCalculationFieldCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityReturnScheduleFamiliesStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityReturnScheduleFamilyFinalizationsStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityReturnScheduleFamilyPayloadsStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"entityReturnRunbookStatus\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"reviewerBriefingOpenQuestionCount\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"supportedExpenseBoxesWithAmounts\""
    );
    expect(bundle.files.find((file) => file.id === "bundle-manifest")?.contents).toContain(
      "\"advertising\""
    );
    expect(bundle.files.some((file) => file.id === "official-primary-blank-form")).toBe(true);
  });

  it(
    "includes missing start-path proof ids in the bundle manifest for complex LLCs",
    { timeout: 15000 },
    () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex Bundle LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
      ],
    };

    const bundle = buildTinaReviewBundle(draft);
    const manifest = bundle.files.find((file) => file.id === "bundle-manifest")?.contents ?? "";

    expect(manifest).toContain("\"missingStartPathProofIds\"");
    expect(manifest).toContain("\"ownership-agreement\"");
    expect(manifest).toContain("\"reviewerChallengeCount\"");
    expect(manifest).toContain("\"federalReturnClassificationIssueCount\"");
    expect(manifest).toContain("\"evidenceSufficiencyIssueCount\"");
    expect(manifest).toContain("\"ownershipCapitalBlockedCount\"");
    expect(manifest).toContain("\"booksReconstructionBlockedAreaCount\"");
    expect(manifest).toContain("\"taxTreatmentPolicyDecisionCount\"");
    expect(manifest).toContain("\"materialityImmediateCount\"");
    expect(manifest).toContain("\"entityJudgmentStatus\"");
    expect(manifest).toContain("\"federalReturnFamily\"");
    expect(manifest).toContain("\"federalReturnRequirementCount\"");
    expect(manifest).toContain("\"ownershipTimelineEventCount\"");
    expect(manifest).toContain("\"treatmentJudgmentItemCount\"");
    expect(manifest).toContain("\"entityRecordMissingCriticalCount\"");
    expect(manifest).toContain("\"blockedEntityEconomicsCount\"");
    expect(manifest).toContain("\"entityReturnRunbookExecutionMode\"");
    }
  );
});
