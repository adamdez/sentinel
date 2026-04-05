import { describe, expect, it } from "vitest";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("single-owner-corporate-route-proof", () => {
  it("stays out of scope for clean sole proprietorship files", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaSingleOwnerCorporateRouteProof({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Quiet Sole Prop",
        entityType: "sole_prop",
        ownerCount: 1,
      },
    });

    expect(snapshot.overallStatus).toBe("not_applicable");
    expect(snapshot.posture).toBe("not_applicable");
  });

  it("blocks single-owner s-corp files when the owner worked but no payroll trail exists", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaSingleOwnerCorporateRouteProof({
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
    expect(snapshot.electionProofStatus).toBe("missing");
    expect(snapshot.payrollRequirementStatus).toBe("missing");
    expect(snapshot.ownerServiceStatus).toBe("likely_active");
    expect(snapshot.issues.some((issue) => issue.id === "single-owner-s-corp-no-payroll")).toBe(
      true
    );
  });

  it("keeps late-election single-owner corporate files under reviewer control instead of calling them settled", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaSingleOwnerCorporateRouteProof({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Late Election Solo LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        entityType: "single_member_llc",
        ownerCount: 1,
        taxElection: "s_corp",
        hasPayroll: true,
      },
      documents: [
        {
          id: "doc-late-election",
          name: "late-election-relief.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/tests/late-election-relief.pdf",
          category: "supporting_document",
          requestId: "entity-election",
          requestLabel: "Entity election",
          uploadedAt: "2026-04-05T10:10:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-late-election",
          status: "complete",
          kind: "pdf",
          summary: "Late election relief notes",
          nextStep: "Keep under review",
          facts: [],
          detailLines: [
            "The business started as a single-member LLC before it called itself an S corp.",
            "Late election relief may be needed because no clean IRS acceptance trail exists.",
            "Payroll started later in the year once the owner believed the S election was effective.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T10:11:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("review_required");
    expect(snapshot.posture).toBe("corporate_route_conditional");
    expect(snapshot.electionProofStatus).toBe("conditional");
    expect(snapshot.payrollRequirementStatus).toBe("supported");
  });
});
