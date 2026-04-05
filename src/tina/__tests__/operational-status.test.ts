import { describe, expect, it } from "vitest";
import { buildTinaOperationalStatus } from "@/tina/lib/operational-status";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("operational-status", () => {
  it("reports reviewer-grade core when snapshots, decisions, and appendix exist", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
      },
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-8-advertising",
            lineNumber: "Line 8",
            label: "Advertising",
            amount: 800,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-advertising"],
            taxAdjustmentIds: ["tax-advertising"],
            sourceDocumentIds: ["doc-advertising"],
          },
        ],
      },
      packageReadiness: {
        lastRunAt: "2026-03-27T05:00:00.000Z",
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Capture snapshot",
        items: [],
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete" as const,
      },
      appendix: {
        lastRunAt: "2026-03-27T05:01:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Review",
        items: [],
      },
      packageSnapshots: [
        {
          id: "snapshot-1",
          createdAt: "2026-03-27T05:02:00.000Z",
          packageFingerprint: "abc123",
          packageState: "ready_for_cpa_review" as const,
          readinessLevel: "ready_for_cpa" as const,
          blockerCount: 0,
          attentionCount: 0,
          summary: "Ready",
          exportFileName: "packet.md",
          exportContents: "# Packet",
        },
      ],
      reviewerDecisions: [
        {
          id: "review-1",
          snapshotId: "snapshot-1",
          decision: "approved" as const,
          reviewerName: "CPA Tina",
          notes: "Good",
          decidedAt: "2026-03-27T05:03:00.000Z",
        },
      ],
      quickBooksConnection: {
        ...createDefaultTinaWorkspaceDraft().quickBooksConnection,
        status: "connected" as const,
        companyName: "Tina Books LLC",
      },
    };

    const status = buildTinaOperationalStatus(draft);
    expect(status.maturity).toBe("reviewer_grade_core");
    expect(status.truths.some((truth) => truth.includes("QuickBooks connection"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Schedule C form"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("form trace"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Supported Part II expense boxes"))).toBe(
      true
    );
    expect(status.truths.some((truth) => truth.includes("Reviewer challenge forecast"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity treatment judgment"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Federal return family"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Ownership timeline"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Treatment judgment"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Official-form fill plan"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Official-form execution"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Confidence calibration"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Case memory ledger"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Reviewer learning loop"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Reviewer override governance"))).toBe(
      true
    );
    expect(status.truths.some((truth) => truth.includes("Reviewer policy versioning"))).toBe(
      true
    );
    expect(status.truths.some((truth) => truth.includes("Reviewer acceptance reality"))).toBe(
      true
    );
    expect(status.truths.some((truth) => truth.includes("Document intelligence"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Document-intelligence extracted facts"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity filing remediation"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity filing history status"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity filing election status"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity filing amendment status"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Single-member entity-history proof"))).toBe(
      true
    );
    expect(status.truths.some((truth) => truth.includes("Single-owner corporate route"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Companion-form calculations"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Accounting artifact coverage"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Attachment statements"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Structured attachment schedules"))).toBe(
      true
    );
    expect(status.truths.some((truth) => truth.includes("Books reconciliation"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Ledger reconstruction"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Evidence credibility"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Industry evidence matrix"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Tax planning memo status"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Planning action board"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Authority position matrix"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Disclosure readiness"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Reviewer acceptance forecast"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Document request plan"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity record matrix"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity economics readiness"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity return package plan"))).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity return schedule families"))).toBe(
      true
    );
    expect(
      status.truths.some((truth) => truth.includes("Entity return schedule-family finalizations"))
    ).toBe(true);
    expect(
      status.truths.some((truth) => truth.includes("Entity return schedule-family payloads"))
    ).toBe(true);
    expect(status.truths.some((truth) => truth.includes("Entity return runbook"))).toBe(true);
  });

  it("surfaces missing start-path proof in operational truths and blockers", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Proof Gap LLC",
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

    const status = buildTinaOperationalStatus(draft);
    expect(status.truths.some((truth) => truth.includes("Start-path proof still needed"))).toBe(true);
    expect(status.blockers).toContain("Operating agreement or ownership breakdown");
    expect(status.blockers).toContain("Opening ownership picture");
  });

  it(
    "surfaces single-member history blockers when books still reflect an older entity story",
    { timeout: 15000 },
    () => {
    const base = createDefaultTinaWorkspaceDraft();
    const status = buildTinaOperationalStatus({
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
          uploadedAt: "2026-04-05T12:10:00.000Z",
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
          lastReadAt: "2026-04-05T12:11:00.000Z",
        },
      ],
    });

    expect(status.blockers).toContain("Books still reflect an older entity story");
    expect(
      status.truths.some((truth) => truth.includes("Single-member entity-history questions"))
    ).toBe(true);
    }
  );

  it("surfaces blocking treatment and entity judgment calls in operational blockers", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Judgment Gap LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
        hasOwnerBuyoutOrRedemption: true,
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
        {
          id: "mixed-use-fact",
          sourceDocumentId: "doc-ledger",
          label: "Mixed personal/business clue",
          value: "Personal and business charges appear in the same ledger stream.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:03:00.000Z",
        },
      ],
    };

    const status = buildTinaOperationalStatus(draft);
    expect(status.blockers).toContain("Operating agreement or ownership breakdown still needs judgment");
    expect(status.blockers).toContain("Partnership return core");
    expect(status.blockers).toContain("Reject unallocated mixed personal/business deductions");
    expect(status.blockers).toContain("Partner roster and ownership economics");
    expect(status.blockers).toContain("Partner capital accounts");
  }, 15000);

  it("surfaces disclosure-required and likely-reject positions as blockers", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      appendix: {
        ...createDefaultTinaWorkspaceDraft().appendix,
        status: "complete" as const,
        items: [
          {
            id: "appendix-1",
            title: "Aggressive state position",
            summary: "Potentially usable with disclosure",
            whyItMatters: "Could reduce tax if support holds",
            taxPositionBucket: "appendix" as const,
            category: "position",
            nextStep: "Review it",
            authoritySummary: "Credible but needs explicit disclosure handling",
            reviewerQuestion: "Should this move forward with disclosure?",
            disclosureFlag: "required",
            authorityTargets: ["State guidance"],
            sourceLabels: [],
            factIds: ["fact-1"],
            documentIds: ["doc-1"],
          },
        ],
      },
    };

    const status = buildTinaOperationalStatus(draft);

    expect(status.blockers).toContain("Aggressive state position");
  });
});
