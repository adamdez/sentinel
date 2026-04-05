import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("payroll-compliance-reconstruction", () => {
  it("fails closed when payroll happened but the filing and deposit trail is broken", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaPayrollComplianceReconstruction({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Cascade Payroll LLC",
        entityType: "s_corp",
        hasPayroll: true,
        notes:
          "The business used a payroll provider, but 941s were not filed consistently and deposits were late.",
      },
      documents: [
        {
          id: "doc-payroll",
          name: "payroll-register.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/payroll-register.pdf",
          category: "supporting_document",
          requestId: "payroll",
          requestLabel: "Payroll register",
          uploadedAt: "2026-04-04T08:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-payroll",
          status: "complete",
          kind: "pdf",
          summary: "Payroll register with broken compliance trail",
          nextStep: "Review",
          facts: [],
          detailLines: [
            "Payroll provider summary shows wages and officer pay.",
            "Late deposit notices appear and quarterly filing support is incomplete.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T08:02:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-payroll-gap",
          sourceDocumentId: "doc-payroll",
          label: "Payroll clue",
          value: "Payroll existed but the compliance trail is incomplete and deposits were late.",
          confidence: "high",
          capturedAt: "2026-04-04T08:03:00.000Z",
        },
      ],
      reviewerFinal: {
        ...base.reviewerFinal,
        lines: [
          {
            id: "rf-wages",
            kind: "expense",
            layer: "reviewer_final",
            label: "Wages",
            amount: 18000,
            status: "ready",
            summary: "Payroll wages visible in the books.",
            sourceDocumentIds: ["doc-payroll"],
            sourceFactIds: ["fact-payroll-gap"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        fields: [
          {
            id: "line-26-wages",
            lineNumber: "Line 26",
            label: "Wages",
            amount: 18000,
            status: "ready",
            summary: "Mapped wages line.",
            reviewerFinalLineIds: ["rf-wages"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-payroll"],
          },
        ],
      },
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.posture).toBe("payroll_with_compliance_gaps");
    expect(snapshot.likelyMissingFilings).toEqual(
      expect.arrayContaining(["Form 941", "Form W-2", "Form W-3"])
    );
    expect(snapshot.questions).toEqual(
      expect.arrayContaining([
        "Which quarters were actually run through payroll?",
        "Which payroll tax deposits actually cleared?",
      ])
    );
  });

  it("keeps mixed payroll and contractor files under reviewer control", () => {
    const snapshot = buildTinaPayrollComplianceReconstruction(
      TINA_SKILL_REVIEW_DRAFTS["payroll-contractor-overlap"]
    );

    expect(snapshot.workerClassification).toBe("mixed");
    expect(snapshot.overallStatus).toBe("needs_review");
    expect(snapshot.issues.some((issue) => issue.id === "payroll-worker-overlap")).toBe(true);
  });

  it("keeps payroll out of scope when contractor support exists without a payroll trail", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaPayrollComplianceReconstruction({
      ...base,
      profile: {
        ...base.profile,
        paysContractors: true,
        notes: "The business uses 1099 subcontractors and no payroll provider.",
      },
      documents: [
        {
          id: "doc-1099",
          name: "1099-summary.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/1099-summary.pdf",
          category: "supporting_document",
          requestId: "contractors",
          requestLabel: "1099 package",
          uploadedAt: "2026-04-04T08:10:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-1099",
          status: "complete",
          kind: "pdf",
          summary: "1099 contractor summary",
          nextStep: "Review",
          facts: [],
          detailLines: ["1099 subcontractor labor detail for the year."],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T08:12:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("not_applicable");
    expect(snapshot.posture).toBe("contractor_likely");
    expect(snapshot.workerClassification).toBe("contractor_only");
  });

  it("fails closed on single-owner s-corp files that show no payroll but active-owner distributions", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaPayrollComplianceReconstruction({
      ...base,
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
    expect(snapshot.posture).toBe("s_corp_no_payroll");
    expect(snapshot.likelyMissingFilings).toEqual(
      expect.arrayContaining(["Form 941", "Form W-2", "Form W-3"])
    );
    expect(snapshot.issues.some((issue) => issue.id === "single-owner-s-corp-no-payroll")).toBe(
      true
    );
  });
});
