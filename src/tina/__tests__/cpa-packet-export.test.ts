import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaCpaPacketExport", () => {
  it("creates a markdown packet summary from the current Tina draft", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-1",
          name: "2025-return.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/2025-return.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "reviewer-final-1",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready for a return preview.",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-1"],
          },
          {
            id: "reviewer-final-2",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 1200,
            status: "ready" as const,
            summary: "Advertising expense candidate",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-2"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Review it",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Mapped safely.",
            reviewerFinalLineIds: ["reviewer-final-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
      cpaHandoff: {
        lastRunAt: "2026-03-27T04:04:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        artifacts: [],
      },
      reviewerSignoff: {
        ...createDefaultTinaWorkspaceDraft().reviewerSignoff,
        packageState: "ready_for_cpa_review" as const,
        summary: "Capture snapshot next",
        nextStep: "Capture snapshot",
      },
      appendix: {
        lastRunAt: "2026-03-27T04:05:00.000Z",
        status: "complete" as const,
        summary: "One appendix item",
        nextStep: "Review it",
        items: [
          {
            id: "appendix-1",
            title: "Appendix idea",
            summary: "Potential idea",
            whyItMatters: "Could save money",
            taxPositionBucket: "appendix" as const,
            category: "deduction",
            nextStep: "Research it",
            authoritySummary: "Need more support",
            reviewerQuestion: "Would a reviewer use it?",
            disclosureFlag: "unknown",
            authorityTargets: ["IRS guidance"],
            sourceLabels: [],
            factIds: [],
            documentIds: [],
          },
        ],
      },
      quickBooksConnection: {
        ...createDefaultTinaWorkspaceDraft().quickBooksConnection,
        status: "connected" as const,
        companyName: "Tina Books LLC",
        summary: "Connected and ready",
        importedDocumentIds: ["doc-quickbooks"],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:03:30.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Carry it",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "It matters",
            amount: 18000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerNotes: "",
          },
          {
            id: "tax-2",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Carry it",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "It matters",
            amount: 1200,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerNotes: "",
          },
        ],
      },
    };

    const exportFile = buildTinaCpaPacketExport(draft);

    expect(exportFile.fileName).toContain("tina-sole-prop");
    expect(exportFile.fileName).toContain("2025");
    expect(exportFile.contents).toContain("# Tina CPA Review Packet");
    expect(exportFile.contents).toContain("Line 1 Gross receipts or sales");
    expect(exportFile.contents).toContain("## Schedule C form snapshot");
    expect(exportFile.contents).toContain("## Form validation");
    expect(exportFile.contents).toContain("## Official-form readiness");
    expect(exportFile.contents).toContain("## Official federal form templates");
    expect(exportFile.contents).toContain("## Official-form fill plan");
    expect(exportFile.contents).toContain("## Official-form execution");
    expect(exportFile.contents).toContain("## Entity filing continuity and remediation");
    expect(exportFile.contents).toContain("## Single-member entity-history proof");
    expect(exportFile.contents).toContain("## Single-owner corporate route proof");
    expect(exportFile.contents).toContain("- History status: aligned");
    expect(exportFile.contents).toContain("- Election status: not applicable");
    expect(exportFile.contents).toContain("- Amendment status: not applicable");
    expect(exportFile.contents).toContain("## Unknown-pattern resolution");
    expect(exportFile.contents).toContain("## Confidence calibration");
    expect(exportFile.contents).toContain("## Deep document intelligence and entity continuity");
    expect(exportFile.contents).toContain("## Durable case memory and decision ledger");
    expect(exportFile.contents).toContain("## Reviewer learning loop");
    expect(exportFile.contents).toContain("## Reviewer observed deltas");
    expect(exportFile.contents).toContain("## Reviewer override governance");
    expect(exportFile.contents).toContain("## Reviewer policy versioning");
    expect(exportFile.contents).toContain("## Reviewer acceptance reality");
    expect(exportFile.contents).toContain("2025 Schedule C (Form 1040)");
    expect(exportFile.contents).toContain("## Official-form coverage");
    expect(exportFile.contents).toContain("## Entity treatment judgment");
    expect(exportFile.contents).toContain("## Federal return requirements");
    expect(exportFile.contents).toContain("## Ownership timeline");
    expect(exportFile.contents).toContain("## Supported Part II expense boxes");
    expect(exportFile.contents).toContain("Line 8 Advertising");
    expect(exportFile.contents).toContain("## Form trace");
    expect(exportFile.contents).toContain("## Books normalization");
    expect(exportFile.contents).toContain("## Books reconciliation");
    expect(exportFile.contents).toContain("## Accounting artifact coverage");
    expect(exportFile.contents).toContain("## Industry playbooks");
    expect(exportFile.contents).toContain("## Industry evidence matrix");
    expect(exportFile.contents).toContain("## Tax opportunity engine");
    expect(exportFile.contents).toContain("## Tax planning memo");
    expect(exportFile.contents).toContain("## Planning action board");
    expect(exportFile.contents).toContain("## Authority position matrix");
    expect(exportFile.contents).toContain("## Disclosure readiness");
    expect(exportFile.contents).toContain("## Reviewer acceptance forecast");
    expect(exportFile.contents).toContain("## Document request plan");
    expect(exportFile.contents).toContain("## Attachment statements");
    expect(exportFile.contents).toContain("## Structured attachment schedules");
    expect(exportFile.contents).toContain("## Companion form calculations");
    expect(exportFile.contents).toContain("## Companion form render plan");
    expect(exportFile.contents).toContain("Schedule C line 31 carryover amount");
    expect(exportFile.contents).toContain("## Companion form plan");
    expect(exportFile.contents).toContain("## Cross-form consistency");
    expect(exportFile.contents).toContain("## Entity record matrix");
    expect(exportFile.contents).toContain("## Entity economics readiness");
    expect(exportFile.contents).toContain("## Owner-flow and basis adjudication");
    expect(exportFile.contents).toContain("## Entity return calculations");
    expect(exportFile.contents).toContain("## Entity return schedule families");
    expect(exportFile.contents).toContain("## Entity return schedule-family payloads");
    expect(exportFile.contents).toContain("## Entity return schedule-family finalizations");
    expect(exportFile.contents).toContain("## Entity return runbook");
    expect(exportFile.contents).toContain("## Decision briefings");
    expect(exportFile.contents).toContain("## Reviewer challenge forecast");
    expect(exportFile.contents).toContain("## Tax treatment judgment");
    expect(exportFile.contents).toContain("## Reviewer signoff");
    expect(exportFile.contents).toContain("## Reviewer appendix");
    expect(exportFile.contents).toContain("## Ledger source");
    expect(exportFile.contents).toContain("Tina Books LLC");
    expect(exportFile.contents).toContain("2025-return.pdf");
  });

  it("shows exact start-path proof requirements for complex llc packets", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex Packet LLC",
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

    const exportFile = buildTinaCpaPacketExport(draft);

    expect(exportFile.contents).toContain("## Start path proof requirements");
    expect(exportFile.contents).toContain("## Federal return classification engine");
    expect(exportFile.contents).toContain("Operating agreement or ownership breakdown [needed]");
    expect(exportFile.contents).toContain("## Ownership and capital events");
    expect(exportFile.contents).toContain("## Evidence sufficiency");
    expect(exportFile.contents).toContain("## Books-to-tax reconstruction");
    expect(exportFile.contents).toContain("## Tax treatment policy engine");
    expect(exportFile.contents).toContain("## Materiality and priority engine");
    expect(exportFile.contents).toContain("## Entity record matrix");
    expect(exportFile.contents).toContain("## Entity economics readiness");
    expect(exportFile.contents).toContain("## Entity return calculations");
    expect(exportFile.contents).toContain("## Entity return runbook");
  }, 15000);

  it(
    "shows structured 1065 calculation values in reviewer-controlled partnership packets",
    { timeout: 15000 },
    () => {
    const exportFile = buildTinaCpaPacketExport(TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]);

    expect(exportFile.contents).toContain("## Entity return calculations");
      expect(exportFile.contents).toContain("## Owner-flow and basis adjudication");
      expect(exportFile.contents).toContain("Form 1065 primary return [blocked]");
      expect(exportFile.contents).toContain("Likely partner count: 2");
      expect(exportFile.contents).toContain("Ownership split signal: 70/30");
      expect(exportFile.contents).toContain("Opening basis and capital footing");
      expect(exportFile.contents).toContain("Basis rollforward:");
    }
  );

  it("recomputes package readiness so the open-items section stays truthful", () => {
    const profile = {
      ...createDefaultTinaWorkspaceDraft().profile,
      businessName: "Truthful Packet LLC",
      taxYear: "2025",
      principalBusinessActivity: "Consulting",
      naicsCode: "541611",
      entityType: "single_member_llc" as const,
    };
    const profileFingerprint = buildTinaProfileFingerprint(profile);
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile,
      bootstrapReview: {
        ...createDefaultTinaWorkspaceDraft().bootstrapReview,
        status: "complete" as const,
        lastRunAt: "2026-03-27T05:00:00.000Z",
        profileFingerprint,
      },
      issueQueue: {
        ...createDefaultTinaWorkspaceDraft().issueQueue,
        status: "complete" as const,
        lastRunAt: "2026-03-27T05:01:00.000Z",
        profileFingerprint,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lastRunAt: "2026-03-27T05:02:00.000Z",
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        lastRunAt: "2026-03-27T05:03:00.000Z",
        fields: [
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: 3000,
            status: "waiting" as const,
            summary: "Still needs classification.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "idle" as const,
      },
    };

    const exportFile = buildTinaCpaPacketExport(draft);

    expect(exportFile.contents).not.toContain("Tina does not see any open filing-package items right now.");
    expect(exportFile.contents).toContain("Line 27a: Other expenses [blocking]");
  });
});
