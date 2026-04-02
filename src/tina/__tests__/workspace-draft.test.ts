import { describe, expect, it } from "vitest";
import {
  createDefaultTinaWorkspaceDraft,
  parseTinaWorkspaceDraft,
  pickLatestTinaWorkspaceDraft,
} from "@/tina/lib/workspace-draft";

describe("workspace draft helpers", () => {
  it("picks the newer remote draft when it has the latest save time", () => {
    const localDraft = {
      ...createDefaultTinaWorkspaceDraft(),
      savedAt: "2026-03-26T20:00:00.000Z",
    };
    const remoteDraft = {
      ...createDefaultTinaWorkspaceDraft(),
      savedAt: "2026-03-26T21:00:00.000Z",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Remote Tina Co",
      },
    };

    const result = pickLatestTinaWorkspaceDraft(localDraft, remoteDraft);

    expect(result.profile.businessName).toBe("Remote Tina Co");
  });

  it("falls back to defaults when stored JSON is invalid", () => {
    const result = parseTinaWorkspaceDraft("{not-json");

    expect(result.profile.entityType).toBe("unsure");
    expect(result.profile.ownerCount).toBeNull();
    expect(result.profile.taxElection).toBe("unsure");
    expect(result.priorReturn).toBeNull();
  });

  it("normalizes new ownership and election profile fields", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        profile: {
          businessName: "Lane Check LLC",
          entityType: "single_member_llc",
          ownerCount: "2",
          taxElection: "weird-value",
          ownershipChangedDuringYear: true,
          hasOwnerBuyoutOrRedemption: 1,
          hasFormerOwnerPayments: "yes",
          spouseCommunityPropertyTreatment: "confirmed",
        },
      })
    );

    expect(result.profile.businessName).toBe("Lane Check LLC");
    expect(result.profile.ownerCount).toBeNull();
    expect(result.profile.taxElection).toBe("unsure");
    expect(result.profile.ownershipChangedDuringYear).toBe(true);
    expect(result.profile.hasOwnerBuyoutOrRedemption).toBe(true);
    expect(result.profile.hasFormerOwnerPayments).toBe(true);
    expect(result.profile.spouseCommunityPropertyTreatment).toBe("confirmed");
  });

  it("normalizes older saved documents that do not have request metadata yet", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        documents: [
          {
            id: "doc-1",
            name: "return.pdf",
            size: 1234,
            mimeType: "application/pdf",
            storagePath: "user/2025/doc-1-return.pdf",
            category: "prior_return",
            uploadedAt: "2026-03-26T21:00:00.000Z",
          },
        ],
      })
    );

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.requestId).toBeNull();
    expect(result.documents[0]?.requestLabel).toBeNull();
  });

  it("normalizes saved document readings and drops malformed ones", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        issueQueue: {
          lastRunAt: "2026-03-26T21:25:00.000Z",
          profileFingerprint: "profile-v1",
          status: "complete",
          summary: "Checked",
          nextStep: "Keep going",
          items: [
            {
              id: "issue-1",
              title: "Mismatch",
              summary: "Needs review",
              severity: "blocking",
              status: "open",
              category: "fact_mismatch",
              documentId: "doc-1",
              factId: "source-1",
            },
            {
              broken: true,
            },
          ],
          records: [
            {
              id: "books",
              label: "Books and money records",
              status: "needs_attention",
              summary: "Needs review",
              issueIds: ["issue-1"],
            },
            {
              bad: true,
            },
          ],
        },
        authorityWork: [
          {
            ideaId: "qbi-review",
            status: "researching",
            reviewerDecision: "need_more_support",
            disclosureDecision: "needs_review",
            memo: "Need better authority.",
            reviewerNotes: "Do not use yet.",
            missingAuthority: ["Need primary QBI support"],
            citations: [
              {
                id: "citation-1",
                title: "IRS",
                url: "https://www.irs.gov/example",
                sourceClass: "primary_authority",
                effect: "supports",
                note: "Helpful source",
              },
              {
                broken: true,
              },
            ],
            lastAiRunAt: "2026-03-26T21:25:10.000Z",
            updatedAt: "2026-03-26T21:25:30.000Z",
          },
          {
            broken: true,
          },
        ],
        workpapers: {
          lastRunAt: "2026-03-26T21:40:00.000Z",
          status: "complete",
          summary: "Built",
          nextStep: "Keep going",
          lines: [
            {
              id: "line-1",
              kind: "income",
              layer: "book_original",
              label: "Money in",
              amount: 18000,
              status: "ready",
              summary: "Looks good",
              sourceDocumentIds: ["doc-1"],
              sourceFactIds: ["source-1"],
              issueIds: ["issue-1"],
              derivedFromLineIds: [],
              cleanupSuggestionIds: [],
            },
            {
              broken: true,
            },
          ],
        },
        cleanupPlan: {
          lastRunAt: "2026-03-26T21:41:00.000Z",
          status: "complete",
          summary: "Cleanup ideas ready",
          nextStep: "Review them",
          suggestions: [
            {
              id: "cleanup-1",
              type: "confirm_scope",
              priority: "important",
              status: "reviewing",
              title: "Check payroll",
              summary: "Payroll may belong here.",
              suggestedAction: "Ask for payroll papers.",
              whyItMatters: "Payroll changes cleanup buckets.",
              workpaperLineIds: ["line-1"],
              issueIds: ["issue-1"],
              sourceDocumentIds: ["doc-1"],
              sourceFactIds: ["source-1"],
              reviewerNotes: "Waiting on owner reply.",
            },
            {
              broken: true,
            },
          ],
        },
        aiCleanup: {
          lastRunAt: "2026-03-26T21:42:00.000Z",
          status: "complete",
          summary: "AI cleanup ready",
          nextStep: "Keep going",
          lines: [
            {
              id: "ai-cleanup-1",
              kind: "income",
              layer: "ai_cleanup",
              label: "Money in cleanup",
              amount: 18000,
              status: "ready",
              summary: "Approved carry-forward",
              sourceDocumentIds: ["doc-1"],
              sourceFactIds: ["source-1"],
              issueIds: [],
              derivedFromLineIds: ["line-1"],
              cleanupSuggestionIds: ["cleanup-1"],
            },
            {
              broken: true,
            },
          ],
        },
        taxAdjustments: {
          lastRunAt: "2026-03-26T21:43:00.000Z",
          status: "complete",
          summary: "Tax adjustments ready",
          nextStep: "Review them",
          adjustments: [
            {
              id: "tax-adjustment-ai-cleanup-1",
              kind: "sales_tax_exclusion",
              status: "needs_authority",
              risk: "medium",
              requiresAuthority: true,
              title: "Keep sales tax out of income",
              summary: "Needs proof first",
              suggestedTreatment: "Keep collected sales tax separate.",
              whyItMatters: "It can change income totals.",
              amount: 18000,
              authorityWorkIdeaIds: ["wa-state-review"],
              aiCleanupLineIds: ["ai-cleanup-1"],
              sourceDocumentIds: ["doc-1"],
              sourceFactIds: ["source-1"],
              reviewerNotes: "Wait for authority review.",
            },
            {
              broken: true,
            },
          ],
        },
        reviewerFinal: {
          lastRunAt: "2026-03-26T21:44:00.000Z",
          status: "complete",
          summary: "Reviewer-final ready",
          nextStep: "Keep going",
          lines: [
            {
              id: "reviewer-final-1",
              kind: "income",
              layer: "reviewer_final",
              label: "Gross receipts candidate",
              amount: 18000,
              status: "ready",
              summary: "Approved for the return-facing review layer.",
              sourceDocumentIds: ["doc-1"],
              sourceFactIds: ["source-1"],
              issueIds: [],
              derivedFromLineIds: ["ai-cleanup-1"],
              cleanupSuggestionIds: ["cleanup-1"],
              taxAdjustmentIds: ["tax-adjustment-ai-cleanup-1"],
            },
            {
              broken: true,
            },
          ],
        },
        scheduleCDraft: {
          lastRunAt: "2026-03-26T21:45:00.000Z",
          status: "complete",
          summary: "Schedule C ready",
          nextStep: "Check notes",
          fields: [
            {
              id: "line-1-gross-receipts",
              lineNumber: "Line 1",
              label: "Gross receipts or sales",
              amount: 18000,
              status: "needs_attention",
              summary: "Needs sales tax review first.",
              reviewerFinalLineIds: ["reviewer-final-1"],
              taxAdjustmentIds: ["tax-adjustment-ai-cleanup-1"],
              sourceDocumentIds: ["doc-1"],
            },
            {
              broken: true,
            },
          ],
          notes: [
            {
              id: "schedule-c-sales-tax-note",
              title: "Sales tax review is still separate",
              summary: "Needs a human look.",
              severity: "needs_attention",
              reviewerFinalLineIds: ["reviewer-final-1"],
              taxAdjustmentIds: ["tax-adjustment-ai-cleanup-1"],
              sourceDocumentIds: ["doc-1"],
            },
            {
              broken: true,
            },
          ],
        },
        packageReadiness: {
          lastRunAt: "2026-03-26T21:46:00.000Z",
          status: "complete",
          level: "blocked",
          summary: "Still blocked",
          nextStep: "Fix the blockers",
          items: [
            {
              id: "field-review-line-1-gross-receipts",
              title: "Line 1: Gross receipts or sales",
              summary: "Needs a human look.",
              severity: "needs_attention",
              relatedFieldIds: ["line-1-gross-receipts"],
              relatedNoteIds: ["schedule-c-sales-tax-note"],
              relatedReviewItemIds: ["issue-1"],
              sourceDocumentIds: ["doc-1"],
            },
            {
              broken: true,
            },
          ],
        },
        cpaHandoff: {
          lastRunAt: "2026-03-26T21:47:00.000Z",
          status: "complete",
          summary: "Packet ready",
          nextStep: "Review it",
          artifacts: [
            {
              id: "schedule-c-draft",
              title: "Schedule C draft",
              status: "waiting",
              summary: "Needs one more review pass.",
              includes: ["1 draft field", "1 draft note"],
              relatedFieldIds: ["line-1-gross-receipts"],
              relatedNoteIds: ["schedule-c-sales-tax-note"],
              relatedReadinessItemIds: ["field-review-line-1-gross-receipts"],
              sourceDocumentIds: ["doc-1"],
            },
            {
              broken: true,
            },
          ],
        },
        sourceFacts: [
          {
            id: "source-1",
            sourceDocumentId: "doc-1",
            label: "Business name",
            value: "Tina Test LLC",
            confidence: "high",
            capturedAt: "2026-03-26T21:20:00.000Z",
          },
        ],
        documentReadings: [
          {
            documentId: "doc-1",
            status: "complete",
            kind: "spreadsheet",
            summary: "Looks good",
            nextStep: "Keep going",
            facts: [],
            detailLines: ["2 sheets found"],
            rowCount: 42,
            headers: ["Date", "Amount"],
            sheetNames: ["Sheet1"],
            lastReadAt: "2026-03-26T21:20:00.000Z",
          },
          {
            bad: true,
          },
        ],
      })
    );

    expect(result.documentReadings).toHaveLength(1);
    expect(result.documentReadings[0]?.kind).toBe("spreadsheet");
    expect(result.documentReadings[0]?.headers).toEqual(["Date", "Amount"]);
    expect(result.sourceFacts).toHaveLength(1);
    expect(result.sourceFacts[0]?.label).toBe("Business name");
    expect(result.issueQueue.items).toHaveLength(1);
    expect(result.issueQueue.items[0]?.documentId).toBe("doc-1");
    expect(result.issueQueue.records).toHaveLength(1);
    expect(result.issueQueue.records[0]?.issueIds).toEqual(["issue-1"]);
    expect(result.issueQueue.profileFingerprint).toBe("profile-v1");
    expect(result.authorityWork).toHaveLength(1);
    expect(result.authorityWork[0]?.ideaId).toBe("qbi-review");
    expect(result.authorityWork[0]?.missingAuthority).toEqual(["Need primary QBI support"]);
    expect(result.authorityWork[0]?.citations).toHaveLength(1);
    expect(result.authorityWork[0]?.lastAiRunAt).toBe("2026-03-26T21:25:10.000Z");
    expect(result.workpapers.status).toBe("complete");
    expect(result.workpapers.lines).toHaveLength(1);
    expect(result.workpapers.lines[0]?.amount).toBe(18000);
    expect(result.cleanupPlan.status).toBe("complete");
    expect(result.cleanupPlan.suggestions).toHaveLength(1);
    expect(result.cleanupPlan.suggestions[0]?.status).toBe("reviewing");
    expect(result.aiCleanup.status).toBe("complete");
    expect(result.aiCleanup.lines).toHaveLength(1);
    expect(result.aiCleanup.lines[0]?.layer).toBe("ai_cleanup");
    expect(result.aiCleanup.lines[0]?.derivedFromLineIds).toEqual(["line-1"]);
    expect(result.taxAdjustments.status).toBe("complete");
    expect(result.taxAdjustments.adjustments).toHaveLength(1);
    expect(result.taxAdjustments.adjustments[0]?.kind).toBe("sales_tax_exclusion");
    expect(result.taxAdjustments.adjustments[0]?.authorityWorkIdeaIds).toEqual([
      "wa-state-review",
    ]);
    expect(result.reviewerFinal.status).toBe("complete");
    expect(result.reviewerFinal.lines).toHaveLength(1);
    expect(result.reviewerFinal.lines[0]?.layer).toBe("reviewer_final");
    expect(result.reviewerFinal.lines[0]?.taxAdjustmentIds).toEqual([
      "tax-adjustment-ai-cleanup-1",
    ]);
    expect(result.scheduleCDraft.status).toBe("complete");
    expect(result.scheduleCDraft.fields).toHaveLength(1);
    expect(result.scheduleCDraft.fields[0]?.lineNumber).toBe("Line 1");
    expect(result.scheduleCDraft.notes).toHaveLength(1);
    expect(result.scheduleCDraft.notes[0]?.title).toContain("Sales tax");
    expect(result.packageReadiness.status).toBe("complete");
    expect(result.packageReadiness.level).toBe("blocked");
    expect(result.packageReadiness.items).toHaveLength(1);
    expect(result.packageReadiness.items[0]?.relatedFieldIds).toEqual([
      "line-1-gross-receipts",
    ]);
    expect(result.cpaHandoff.status).toBe("complete");
    expect(result.cpaHandoff.artifacts).toHaveLength(1);
    expect(result.cpaHandoff.artifacts[0]?.status).toBe("waiting");
    expect(result.cpaHandoff.artifacts[0]?.relatedReadinessItemIds).toEqual([
      "field-review-line-1-gross-receipts",
    ]);
  });

  it("normalizes saved reviewer signoff, package snapshots, appendix, and operational status", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        reviewerSignoff: {
          lastEvaluatedAt: "2026-04-02T18:10:00.000Z",
          packageState: "signed_off_stale",
          summary: "Drifted",
          nextStep: "Re-run signoff",
          activeSnapshotId: "snapshot-1",
          activeDecisionId: "decision-1",
          currentPackageFingerprint: "current-fingerprint",
          signedOffPackageFingerprint: "signed-fingerprint",
          hasDriftSinceSignoff: true,
        },
        reviewerDecisions: [
          {
            id: "decision-1",
            snapshotId: "snapshot-1",
            decision: "approved",
            reviewerName: "CPA Reviewer",
            notes: "Signed.",
            decidedAt: "2026-04-02T18:09:00.000Z",
          },
          {
            bad: true,
          },
        ],
        packageSnapshots: [
          {
            id: "snapshot-1",
            createdAt: "2026-04-02T18:08:00.000Z",
            packageFingerprint: "signed-fingerprint",
            packageState: "ready_for_cpa_review",
            readinessLevel: "ready_for_cpa",
            blockerCount: 0,
            attentionCount: 0,
            summary: "Ready",
            exportFileName: "packet.md",
            exportContents: "# Packet",
          },
          {
            bad: true,
          },
        ],
        appendix: {
          lastRunAt: "2026-04-02T18:07:00.000Z",
          status: "complete",
          summary: "1 appendix idea",
          nextStep: "Review it",
          items: [
            {
              id: "appendix-1",
              title: "Odd but plausible idea",
              summary: "Worth a look",
              whyItMatters: "Could matter",
              taxPositionBucket: "appendix",
              category: "continuity",
              nextStep: "Review it",
              authoritySummary: "Needs stronger proof.",
              reviewerQuestion: "Should this reach the return?",
              disclosureFlag: "review_if_supported",
              authorityTargets: ["IRS instructions"],
              sourceLabels: ["Organizer clue"],
              factIds: ["fact-1"],
              documentIds: ["doc-1"],
            },
            {
              bad: true,
            },
          ],
        },
        operationalStatus: {
          lastRunAt: "2026-04-02T18:11:00.000Z",
          maturity: "reviewer_grade_core",
          packageState: "signed_off_stale",
          summary: "Truthful",
          nextStep: "Fix drift",
          truths: ["Immutable snapshot saved."],
          blockers: ["Live package drifted after reviewer signoff."],
        },
      })
    );

    expect(result.reviewerSignoff.packageState).toBe("signed_off_stale");
    expect(result.reviewerSignoff.hasDriftSinceSignoff).toBe(true);
    expect(result.reviewerDecisions).toHaveLength(1);
    expect(result.reviewerDecisions[0]?.reviewerName).toBe("CPA Reviewer");
    expect(result.packageSnapshots).toHaveLength(1);
    expect(result.packageSnapshots[0]?.exportFileName).toBe("packet.md");
    expect(result.appendix.items).toHaveLength(1);
    expect(result.appendix.items[0]?.taxPositionBucket).toBe("appendix");
    expect(result.appendix.items[0]?.authorityTargets).toEqual(["IRS instructions"]);
    expect(result.operationalStatus.maturity).toBe("reviewer_grade_core");
    expect(result.operationalStatus.blockers).toContain(
      "Live package drifted after reviewer signoff."
    );
  });
});
