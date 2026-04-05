import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function cloneDraft<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findCheck(
  snapshot: ReturnType<typeof buildTinaConfidenceCalibration>,
  id: string
) {
  return snapshot.checks.find((check) => check.id === id);
}

function buildReadyDraft() {
  const base = createDefaultTinaWorkspaceDraft();

  return {
    ...base,
    profile: {
      ...base.profile,
      businessName: "Confidence Governance LLC",
      entityType: "sole_prop" as const,
    },
    packageReadiness: {
      lastRunAt: "2026-04-04T01:00:00.000Z",
      status: "complete" as const,
      level: "ready_for_cpa" as const,
      summary: "Ready for CPA review.",
      nextStep: "Capture snapshot.",
      items: [],
    },
    reviewerFinal: {
      ...base.reviewerFinal,
      status: "complete" as const,
    },
    scheduleCDraft: {
      ...base.scheduleCDraft,
      status: "complete" as const,
      fields: [
        {
          id: "line-1",
          lineNumber: "Line 1",
          label: "Gross receipts",
          amount: 120000,
          status: "ready" as const,
          summary: "Supported by books and bank support.",
          reviewerFinalLineIds: [],
          taxAdjustmentIds: [],
          sourceDocumentIds: [],
        },
      ],
      notes: [],
    },
  };
}

describe("confidence-calibration", () => {
  it("keeps clean supported-core route and evidence posture calibrated", () => {
    const snapshot = buildTinaConfidenceCalibration(
      cloneDraft(TINA_SKILL_REVIEW_DRAFTS["supported-core"])
    );

    expect(snapshot.recommendedPosture).not.toBe("hold_until_proved");
    expect(findCheck(snapshot, "route-confidence")?.status).toBe("calibrated");
    expect(findCheck(snapshot, "evidence-confidence")?.status).toBe("calibrated");
  });

  it("blocks thin-proof files when evidence confidence outruns support", () => {
    const snapshot = buildTinaConfidenceCalibration(
      cloneDraft(TINA_SKILL_REVIEW_DRAFTS["thin-proof"])
    );

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.recommendedPosture).toBe("hold_until_proved");
    expect(findCheck(snapshot, "evidence-confidence")?.status).toBe("blocked");
    expect(
      snapshot.debts.some((debt) => /Evidence posture/i.test(debt.title))
    ).toBe(true);
  });

  it(
    "treats prior-return drift as blocked route confidence debt instead of reviewer-ready certainty",
    { timeout: 10000 },
    () => {
    const snapshot = buildTinaConfidenceCalibration(
      cloneDraft(TINA_SKILL_REVIEW_DRAFTS["prior-return-drift"])
    );
    const routeCheck = findCheck(snapshot, "route-confidence");

    expect(snapshot.overallStatus).toBe("blocked");
    expect(routeCheck?.status).toBe("blocked");
    expect(routeCheck?.ownerEngines).toContain("entity-filing-remediation");
    expect(
      snapshot.debts.some((debt) => /Route certainty/i.test(debt.title))
    ).toBe(true);
    }
  );

  it("keeps buyout-year treatment confidence blocked when owner-flow and basis proof is unresolved", () => {
    const snapshot = buildTinaConfidenceCalibration(
      cloneDraft(TINA_SKILL_REVIEW_DRAFTS["buyout-year"])
    );
    const treatmentCheck = findCheck(snapshot, "treatment-confidence");

    expect(snapshot.overallStatus).toBe("blocked");
    expect(treatmentCheck?.status).toBe("blocked");
    expect(treatmentCheck?.ownerEngines).toContain("owner-flow-basis-adjudication");
  });

  it("blocks route confidence when late-election relief and amended-return sequencing still control the route", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaConfidenceCalibration({
      ...buildReadyDraft(),
      profile: {
        ...base.profile,
        businessName: "Election Drift Co",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc",
        taxElection: "s_corp",
        hasPayroll: true,
      },
      documents: [
        {
          id: "doc-election-notes",
          name: "Late election notes.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/tests/election-notes.pdf",
          category: "supporting_document",
          requestId: "entity-election",
          requestLabel: "Entity election",
          uploadedAt: "2026-04-05T08:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-election-notes",
          status: "complete",
          kind: "pdf",
          summary: "Election relief and prior-year drift notes",
          nextStep: "Separate amended-return pressure from the current year",
          facts: [],
          detailLines: [
            "The business started as a single-member LLC before it called itself an S corp.",
            "No clean IRS acceptance trail exists and late-election relief may be needed.",
            "Beginning balances were rolled forward manually and do not tie to filed prior-year returns.",
            "The mismatch may require an amended return before the current year is trusted.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T08:03:00.000Z",
        },
      ],
    });
    const routeCheck = findCheck(snapshot, "route-confidence");

    expect(snapshot.overallStatus).toBe("blocked");
    expect(routeCheck?.status).toBe("blocked");
    expect(routeCheck?.ownerEngines).toContain("entity-filing-remediation");
    expect(routeCheck?.supportedConfidence).toBe("low");
  });

  it("blocks route confidence when single-member history and books catch-up are unresolved", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaConfidenceCalibration({
      ...buildReadyDraft(),
      profile: {
        ...base.profile,
        businessName: "Transition Drift LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc",
        ownerCount: 1,
        taxElection: "s_corp",
        hasPayroll: true,
        ownershipChangedDuringYear: true,
        notes:
          "A sole prop became an LLC and maybe later an S corp, but the books still look like the old business and no one is sure when payroll actually started.",
      },
      documents: [
        {
          id: "doc-transition",
          name: "entity-transition-notes.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/tests/entity-transition-notes.pdf",
          category: "supporting_document",
          requestId: "entity-election",
          requestLabel: "Entity transition notes",
          uploadedAt: "2026-04-05T11:40:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-transition",
          status: "complete",
          kind: "pdf",
          summary: "Books never caught up",
          nextStep: "Resolve route history",
          facts: [],
          detailLines: [
            "The business changed structure mid-year and the books never caught up.",
            "The books still reflect the old business and owner-flow labels.",
            "No clean IRS acceptance trail exists and payroll actually started later.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T11:41:00.000Z",
        },
      ],
    });
    const routeCheck = findCheck(snapshot, "route-confidence");

    expect(snapshot.overallStatus).toBe("blocked");
    expect(routeCheck?.status).toBe("blocked");
    expect(routeCheck?.ownerEngines).toContain("single-member-entity-history-proof");
  });

  it("downgrades reviewer-acceptance confidence when governed overrides are still open", () => {
    const readyDraft = buildReadyDraft();
    const packageSnapshot = createTinaPackageSnapshotRecord(
      readyDraft,
      "2026-04-04T01:05:00.000Z"
    );
    const reviewerDecision = recordTinaReviewerDecision({
      snapshotId: packageSnapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need stronger route proof before trusting the election story.",
      decidedAt: "2026-04-04T01:10:00.000Z",
    });

    const snapshot = buildTinaConfidenceCalibration({
      ...readyDraft,
      packageSnapshots: [packageSnapshot],
      reviewerDecisions: [reviewerDecision],
    });

    expect(findCheck(snapshot, "reviewer-acceptance-confidence")?.status).toBe("blocked");
    expect(snapshot.recommendedPosture).toBe("hold_until_proved");
  });

  it("keeps reviewer-acceptance confidence on watch when policy maturity is only partially benchmark-backed", () => {
    const readyDraft = buildReadyDraft();

    const snapshot = buildTinaConfidenceCalibration({
      ...readyDraft,
      authorityWork: [
        {
          ideaId: "sales-tax-authority-review",
          status: "reviewed",
          reviewerDecision: "use_it",
          disclosureDecision: "not_needed",
          memo: "Sales tax exclusion treatment looks supportable on the current facts.",
          reviewerNotes: "Sales tax exclusion is usable here with reviewer backing.",
          missingAuthority: [],
          citations: [{ title: "Primary authority", citation: "Rev. Rul. 2000-1" }],
          lastAiRunAt: "2026-04-04T02:00:00.000Z",
          updatedAt: "2026-04-04T02:05:00.000Z",
        },
      ],
    });

    expect(findCheck(snapshot, "reviewer-acceptance-confidence")?.status).toBe("watch");
    expect(findCheck(snapshot, "reviewer-acceptance-confidence")?.supportedConfidence).toBe(
      "medium"
    );
  });

  it("blocks reviewer-acceptance confidence when live acceptance reality is regressing", () => {
    const readyDraft = buildReadyDraft();
    const packageSnapshot = createTinaPackageSnapshotRecord(
      readyDraft,
      "2026-04-04T03:05:00.000Z"
    );
    const approval = recordTinaReviewerDecision({
      snapshotId: packageSnapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Approved with the current package.",
      decidedAt: "2026-04-04T03:10:00.000Z",
    });

    const snapshot = buildTinaConfidenceCalibration({
      ...readyDraft,
      packageSnapshots: [packageSnapshot],
      reviewerDecisions: [approval],
      packageReadiness: {
        ...readyDraft.packageReadiness,
        level: "blocked",
        summary: "Drifted after approval.",
        nextStep: "Rebuild before signoff.",
        items: [
          {
            id: "drift-blocker",
            title: "New blocking item",
            summary: "A new blocker appeared after approval.",
            severity: "blocking",
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });

    expect(findCheck(snapshot, "reviewer-acceptance-confidence")?.status).toBe("blocked");
    expect(findCheck(snapshot, "reviewer-acceptance-confidence")?.supportedConfidence).toBe(
      "low"
    );
  });

  it("blocks route confidence when document identity and continuity drift stays unresolved", () => {
    const readyDraft = buildReadyDraft();

    const snapshot = buildTinaConfidenceCalibration({
      ...readyDraft,
      documents: [
        {
          id: "doc-entity-a",
          name: "Continuity Governance LLC formation certificate.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/test/entity-a.pdf",
          category: "supporting_document",
          requestId: "formation-papers",
          requestLabel: "Formation papers",
          uploadedAt: "2026-04-04T04:00:00.000Z",
        },
        {
          id: "doc-entity-b",
          name: "Confidence Governance Operating LLC certificate of authority.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/test/entity-b.pdf",
          category: "supporting_document",
          requestId: null,
          requestLabel: "State registration",
          uploadedAt: "2026-04-04T04:01:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-entity-a",
          status: "complete",
          kind: "pdf",
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: ["Continuity Governance LLC was formed in Washington."],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T04:02:00.000Z",
        },
        {
          documentId: "doc-entity-b",
          status: "complete",
          kind: "pdf",
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [
            "Confidence Governance Operating LLC is qualified in Idaho and uses EIN 98-7654321.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T04:03:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-entity-a-ein",
          sourceDocumentId: "doc-entity-a",
          label: "EIN clue",
          value: "EIN 12-3456789 appears on the formation certificate.",
          confidence: "high",
          capturedAt: "2026-04-04T04:04:00.000Z",
        },
      ],
    });

    expect(findCheck(snapshot, "route-confidence")?.status).toBe("blocked");
    expect(findCheck(snapshot, "route-confidence")?.supportedConfidence).toBe("low");
  });

  it("blocks route and evidence confidence when a single-owner s-corp story exists without payroll proof", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaConfidenceCalibration({
      ...buildReadyDraft(),
      profile: {
        ...base.profile,
        businessName: "No Payroll S Corp LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        entityType: "single_member_llc",
        ownerCount: 1,
        taxElection: "s_corp",
        hasPayroll: false,
        notes:
          "Single owner runs the business full time. The company uses S-corp treatment, but no payroll was run and the owner took shareholder distributions instead of payroll.",
      },
      documents: [
        {
          id: "doc-owner-pay",
          name: "owner-distributions-notes.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/tests/owner-distributions-notes.pdf",
          category: "supporting_document",
          requestId: "owner-pay",
          requestLabel: "Owner pay notes",
          uploadedAt: "2026-04-05T10:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-owner-pay",
          status: "complete",
          kind: "pdf",
          summary: "Single-owner S-corp notes",
          nextStep: "Resolve payroll",
          facts: [],
          detailLines: [
            "The single owner worked full time in the business.",
            "An S corp election was believed to be in place.",
            "No payroll account or payroll provider existed.",
            "Cash was taken as shareholder distributions instead of payroll.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T10:02:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(findCheck(snapshot, "route-confidence")?.status).toBe("blocked");
    expect(findCheck(snapshot, "evidence-confidence")?.status).toBe("blocked");
  });
});
