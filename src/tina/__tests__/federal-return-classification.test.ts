import { describe, expect, it } from "vitest";
import { buildTinaFederalReturnClassification } from "@/tina/lib/federal-return-classification";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("federal-return-classification", () => {
  it("builds a high-confidence supported Schedule C classification when the lane is clean", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Clean Sole Prop",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop",
      },
    });

    expect(snapshot.route).toBe("supported");
    expect(snapshot.confidence).toBe("high");
    expect(snapshot.returnFamily).toBe("Form 1040 Schedule C");
    expect(snapshot.issues).toHaveLength(0);
    expect(snapshot.signals.some((signal) => signal.id === "organizer-posture")).toBe(true);
  });

  it("blocks classification when ownership-change and buyout facts make the route unsafe", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Buyout Year LLC",
        taxYear: "2025",
        entityType: "multi_member_llc",
        ownerCount: 3,
        ownershipChangedDuringYear: true,
        hasOwnerBuyoutOrRedemption: true,
        hasFormerOwnerPayments: true,
      },
      documents: [
        {
          id: "doc-1065",
          name: "2025-Form-1065.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/2025-Form-1065.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Prior return",
          uploadedAt: "2026-04-02T09:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "return-type-1065",
          sourceDocumentId: "doc-1065",
          label: "Return type hint",
          value: "Form 1065 partnership return",
          confidence: "high",
          capturedAt: "2026-04-02T09:01:00.000Z",
        },
      ],
    });

    expect(snapshot.route).toBe("blocked");
    expect(snapshot.confidence).toBe("blocked");
    expect(snapshot.returnFamily).toBe("Partnership return");
    expect(snapshot.signals.some((signal) => signal.id === "paper-trail-hints")).toBe(true);
    expect(snapshot.signals.some((signal) => signal.id === "entity-ambiguity")).toBe(true);
    expect(snapshot.issues.some((issue) => issue.severity === "blocking")).toBe(true);
  });

  it("keeps an explicit filing-remediation signal when prior filings and current route disagree", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Drifted Members LLC",
        taxYear: "2025",
        entityType: "multi_member_llc",
        ownerCount: 2,
      },
      documents: [
        {
          id: "doc-prior-return",
          name: "2024 Schedule C return.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/tests/2024-return.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Prior return",
          uploadedAt: "2026-04-04T09:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-multi-owner",
          sourceDocumentId: "doc-prior-return",
          label: "Multi-owner clue",
          value: "Two or more members split profit informally.",
          confidence: "high",
          capturedAt: "2026-04-04T09:01:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-prior-return",
          status: "complete",
          kind: "pdf",
          summary: "Prior return and missing 1065 note",
          nextStep: "Resolve entity continuity",
          facts: [],
          detailLines: [
            "2024 return was filed on Schedule C.",
            "No 1065 or K-1 was filed for the multi-owner years.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T09:02:00.000Z",
        },
      ],
    });

    expect(snapshot.confidence).toBe("blocked");
    expect(snapshot.signals.some((signal) => signal.id === "entity-filing-remediation")).toBe(
      true
    );
    expect(
      snapshot.issues.some((issue) => /missing entity-return backlog|prior-return/i.test(issue.summary))
    ).toBe(true);
  });

  it("keeps classification under reviewer control when late-election relief and amended-return sequencing still matter", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Election Drift Co",
        taxYear: "2025",
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

    expect(snapshot.confidence).toBe("blocked");
    expect(snapshot.summary).toMatch(/single-member history|books posture|transition-year/i);
    expect(snapshot.nextStep).toMatch(/owner history|prior filings|books catch-up/i);
  });

  it("blocks classification when a single-owner s-corp story exists without payroll support", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
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

    expect(snapshot.confidence).toBe("blocked");
    expect(
      snapshot.signals.some((signal) => signal.id === "single-owner-corporate-route-proof")
    ).toBe(true);
    expect(snapshot.summary).toMatch(/single-owner corporate route|no-payroll s-corp/i);
  });

  it("blocks classification when single-member history and books catch-up still control the route", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaFederalReturnClassification({
      ...base,
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
          uploadedAt: "2026-04-05T11:50:00.000Z",
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
          lastReadAt: "2026-04-05T11:51:00.000Z",
        },
      ],
    });

    expect(snapshot.confidence).toBe("blocked");
    expect(
      snapshot.signals.some((signal) => signal.id === "single-member-entity-history-proof")
    ).toBe(true);
    expect(snapshot.summary).toMatch(/single-member history|books/i);
  });
});
