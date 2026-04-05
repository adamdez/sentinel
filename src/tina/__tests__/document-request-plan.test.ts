import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaDocumentRequestPlan } from "@/tina/lib/document-request-plan";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("document-request-plan", () => {
  it("prioritizes ownership proof and weak evidence asks", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex LLC",
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
          capturedAt: "2026-04-03T09:05:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Income",
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: [],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
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
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
    };

    const plan = buildTinaDocumentRequestPlan(draft);

    expect(plan.overallStatus).toBe("blocked");
    expect(plan.items.find((item) => item.id === "proof-ownership-agreement")?.priority).toBe(
      "immediate"
    );
    expect(
      plan.items.some(
        (item) =>
          item.id.startsWith("document-intelligence-") &&
          /ownership roster or agreement papers/i.test(item.title)
      )
    ).toBe(true);
    expect(plan.items.some((item) => item.id.startsWith("evidence-"))).toBe(true);
  });

  it("asks for entity identity clarification when structured papers contain multiple EINs", () => {
    const plan = buildTinaDocumentRequestPlan(TINA_SKILL_REVIEW_DRAFTS["dirty-books"]);

    expect(
      plan.items.find((item) => item.id === "document-intelligence-identity-conflict")?.priority
    ).toBe("immediate");
    expect(
      plan.items.some((item) => /which EIN belongs to the current filing entity/i.test(item.request))
    ).toBe(true);
  });

  it("adds entity-filing remediation asks when prior return history and owner timing can change the route", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const plan = buildTinaDocumentRequestPlan({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Drifted Members LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
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
          uploadedAt: "2026-04-04T09:20:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-prior-return",
          label: "Multi-owner clue",
          value: "Two or more members split profit informally and no one tracked ownership percentages cleanly.",
          confidence: "high",
          capturedAt: "2026-04-04T09:21:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-prior-return",
          status: "complete",
          kind: "pdf",
          summary: "Prior return and continuity notes",
          nextStep: "Resolve route drift",
          facts: [],
          detailLines: [
            "2024 return was filed on Schedule C.",
            "No 1065 or K-1 was filed for the multi-owner years.",
            "No clean election trail exists if S-corp treatment is claimed.",
            "Beginning balances were rolled forward manually and may require an amended return.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T09:22:00.000Z",
        },
      ],
    });

    expect(
      plan.items.find((item) => item.id === "entity-filing-remediation-prior-return-history")
        ?.priority
    ).toBe("immediate");
    expect(
      plan.items.find((item) => item.id === "entity-filing-remediation-ownership-timeline")
        ?.request
    ).toMatch(/operating agreement|ownership breakdown/i);
    expect(
      plan.items.find((item) => item.id === "entity-filing-remediation-election-trail")?.request
    ).toMatch(/2553|8832|acceptance/i);
    expect(
      plan.items.find((item) => item.id === "entity-filing-remediation-amended-return-sequencing")
        ?.request
    ).toMatch(/opening-balance support|amended returns|rolled forward manually/i);
  });

  it("adds owner-flow requests when basis rollforward and transition economics are still unresolved", () => {
    const plan = buildTinaDocumentRequestPlan(TINA_SKILL_REVIEW_DRAFTS["buyout-year"]);

    expect(plan.items.find((item) => item.id === "owner-flow-basis-rollforward")?.priority).toBe(
      "immediate"
    );
    expect(plan.items.find((item) => item.id === "owner-flow-transition-economics")?.request).toMatch(
      /transfer|buyout|redemption|payout|notes/i
    );
  });

  it("adds single-owner corporate route and payroll-proof asks for no-payroll s-corp files", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const plan = buildTinaDocumentRequestPlan({
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

    expect(plan.items.find((item) => item.id === "single-owner-corporate-route-election-proof")?.priority).toBe(
      "immediate"
    );
    expect(plan.items.find((item) => item.id === "single-owner-corporate-route-owner-services")?.request).toMatch(
      /what services the owner performed|wages|draws|distributions/i
    );
    expect(plan.items.find((item) => item.id === "single-owner-corporate-route-payroll-proof")?.request).toMatch(
      /941|W-2|payroll account|provider/i
    );
  });

  it("adds single-member entity-history asks when owner count, spouse exception, and books posture are unresolved", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const plan = buildTinaDocumentRequestPlan({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Spouse Transition LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc",
        ownerCount: 2,
        spouseCommunityPropertyTreatment: "possible",
        ownershipChangedDuringYear: true,
        notes:
          "The married-couple file may have changed mid-year and the books still reflect the old owner-pay story.",
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
          uploadedAt: "2026-04-05T11:30:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-transition",
          status: "complete",
          kind: "pdf",
          summary: "Single-member history notes",
          nextStep: "Resolve the route first",
          facts: [],
          detailLines: [
            "The books still reflect the old business and owner-flow labels.",
            "A married couple may have owned the business during the year.",
            "No one is sure when the ownership or route changed.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T11:31:00.000Z",
        },
      ],
    });

    expect(plan.items.find((item) => item.id === "single-member-entity-history-owner-proof")?.priority).toBe(
      "immediate"
    );
    expect(plan.items.find((item) => item.id === "single-member-entity-history-spouse-exception")?.request).toMatch(
      /community-property|qualified joint venture|spouse/i
    );
    expect(plan.items.find((item) => item.id === "single-member-entity-history-books-catch-up")?.request).toMatch(
      /books|payroll|owner-equity|owner-pay/i
    );
  });
});
