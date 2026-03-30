import { describe, expect, it } from "vitest";
import { reconcileTinaDerivedWorkspace } from "@/tina/lib/reconcile-workspace";
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
    expect(result.priorReturn).toBeNull();
  });

  it("fails closed when output-facing statuses are invalid", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        officialFormPacket: {
          lastRunAt: "2026-03-27T00:00:00.000Z",
          status: "complete",
          summary: "Packet exists",
          nextStep: "Review it",
          forms: [
            {
              id: "schedule-c-2025",
              formNumber: "Schedule C (Form 1040)",
              title: "Profit or Loss From Business",
              taxYear: "2025",
              revisionYear: "2025",
              status: "totally_ready",
              summary: "Looks done",
              nextStep: "Ship it",
              lines: [
                {
                  id: "line-1",
                  lineNumber: "Line 1",
                  label: "Gross receipts or sales",
                  value: "$18,000",
                  state: "definitely_filled",
                  summary: "Bad state should not become trusted",
                },
              ],
              supportSchedules: [],
              relatedNoteIds: [],
              sourceDocumentIds: [],
            },
          ],
        },
        cpaHandoff: {
          lastRunAt: "2026-03-27T00:01:00.000Z",
          status: "complete",
          summary: "Packet ready",
          nextStep: "Review it",
          artifacts: [
            {
              id: "schedule-c-draft",
              title: "Schedule C draft",
              status: "ready_enough",
              summary: "Bad status should not become trusted",
              includes: [],
              relatedFieldIds: [],
              relatedNoteIds: [],
              relatedReadinessItemIds: [],
              sourceDocumentIds: [],
            },
          ],
        },
      })
    );

    expect(result.officialFormPacket.forms[0]?.status).toBe("blocked");
    expect(result.officialFormPacket.forms[0]?.lines[0]?.state).toBe("blank");
    expect(result.cpaHandoff.artifacts[0]?.status).toBe("blocked");
  });

  it("rebuilds export-facing snapshots from the underlying draft instead of trusting forged output state", () => {
    const forged = parseTinaWorkspaceDraft(
      JSON.stringify({
        profile: {
          ...createDefaultTinaWorkspaceDraft().profile,
          businessName: "Forged Tina Co",
          taxYear: "2025",
          entityType: "single_member_llc",
        },
        officialFormPacket: {
          lastRunAt: "2026-03-27T00:00:00.000Z",
          status: "complete",
          summary: "Forged packet",
          nextStep: "Export it",
          forms: [
            {
              id: "schedule-c-2025",
              formNumber: "Schedule C (Form 1040)",
              title: "Profit or Loss From Business",
              taxYear: "2025",
              revisionYear: "2025",
              status: "ready",
              summary: "Forged form",
              nextStep: "Ship it",
              lines: [
                {
                  id: "line-1",
                  lineNumber: "Line 1",
                  label: "Gross receipts or sales",
                  value: "$18,000",
                  state: "filled",
                  summary: "Forged line",
                },
              ],
              supportSchedules: [],
              relatedNoteIds: [],
              sourceDocumentIds: [],
            },
          ],
        },
        cpaHandoff: {
          lastRunAt: "2026-03-27T00:01:00.000Z",
          status: "complete",
          summary: "Forged packet ready",
          nextStep: "Download it",
          artifacts: [
            {
              id: "schedule-c-draft",
              title: "Schedule C draft",
              status: "ready",
              summary: "Forged artifact",
              includes: [],
              relatedFieldIds: [],
              relatedNoteIds: [],
              relatedReadinessItemIds: [],
              sourceDocumentIds: [],
            },
          ],
        },
        finalSignoff: {
          lastRunAt: "2026-03-27T00:02:00.000Z",
          status: "complete",
          level: "ready",
          summary: "Forged signoff",
          nextStep: "Done",
          checks: [
            {
              id: "looked-at-open-items",
              label: "I looked at Tina's open items and notes.",
              helpText: "Forged",
              checked: true,
            },
            {
              id: "understand-human-review",
              label: "I understand a human still has to approve filing.",
              helpText: "Forged",
              checked: true,
            },
            {
              id: "ready-for-reviewer",
              label: "This packet is ready to hand to a reviewer.",
              helpText: "Forged",
              checked: true,
            },
          ],
          reviewerName: "Forged Reviewer",
          reviewerNote: "Looks perfect.",
          confirmedAt: "2026-03-27T00:03:00.000Z",
        },
      })
    );

    const reconciled = reconcileTinaDerivedWorkspace(forged);

    expect(reconciled.officialFormPacket.status).not.toBe("complete");
    expect(reconciled.officialFormPacket.forms).toHaveLength(0);
    expect(reconciled.cpaHandoff.status).not.toBe("complete");
    expect(reconciled.cpaHandoff.artifacts).toHaveLength(0);
    expect(reconciled.finalSignoff.level).toBe("blocked");
    expect(reconciled.finalSignoff.confirmedAt).toBeNull();
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

  it("heals saved authority-work mojibake when a workspace draft is loaded", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        authorityWork: [
          {
            ideaId: "fixed-assets-review",
            status: "ready_for_reviewer",
            reviewerDecision: "pending",
            disclosureDecision: "unknown",
            challengeVerdict: "needs_care",
            memo: "Blue Cedar’s memo cites IRC §168.",
            challengeMemo: "The item was placed in服务 in 2025.",
            reviewerNotes: "Keep the “narrow federal path” only.",
            missingAuthority: ["Confirm IRC Â§168 timing."],
            challengeWarnings: ["Watch the “placed in service” date."],
            challengeQuestions: ["Was it placed in服务 in 2025?"],
            citations: [
              {
                id: "citation-1",
                title: "26 U.S. Code § 168",
                url: "https://www.irs.gov/example",
                sourceClass: "primary_authority",
                effect: "supports",
                note: "Blue Cedar’s strongest lead.",
              },
            ],
            researchRun: {
              status: "failed",
              jobId: "research-job-1",
              queuedAt: "2026-03-29T21:24:30.000Z",
              startedAt: "2026-03-29T21:24:45.000Z",
              finishedAt: "2026-03-29T21:24:50.000Z",
              retryAt: null,
              error: "Temporary “timeout” noise.",
            },
            challengeRun: {
              status: "succeeded",
              jobId: "challenge-job-1",
              queuedAt: "2026-03-29T21:25:30.000Z",
              startedAt: "2026-03-29T21:25:45.000Z",
              finishedAt: "2026-03-29T21:26:10.000Z",
              retryAt: null,
              error: null,
            },
            lastAiRunAt: "2026-03-29T21:25:10.000Z",
            lastChallengeRunAt: "2026-03-29T21:26:10.000Z",
            updatedAt: "2026-03-29T21:25:30.000Z",
          },
        ],
      })
    );

    expect(result.authorityWork[0]).toMatchObject({
      memo: "Blue Cedar's memo cites IRC §168.",
      challengeMemo: "The item was placed in service in 2025.",
      reviewerNotes: 'Keep the "narrow federal path" only.',
      missingAuthority: ["Confirm IRC §168 timing."],
      challengeWarnings: ['Watch the "placed in service" date.'],
      challengeQuestions: ["Was it placed in service in 2025?"],
    });
    expect(result.authorityWork[0]?.citations[0]).toMatchObject({
      title: "26 U.S. Code § 168",
      note: "Blue Cedar's strongest lead.",
    });
    expect(result.authorityWork[0]?.researchRun.error).toBe('Temporary "timeout" noise.');
  });

  it("fails closed to rejected status when a saved authority item is already do-not-use", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        authorityWork: [
          {
            ideaId: "wa-state-review",
            status: "ready_for_reviewer",
            reviewerDecision: "do_not_use",
            disclosureDecision: "unknown",
            challengeVerdict: "needs_care",
            memo: "Keep this out of the federal package.",
            challengeMemo: "",
            reviewerNotes: "",
            missingAuthority: [],
            challengeWarnings: [],
            challengeQuestions: [],
            citations: [],
            researchRun: {
              status: "succeeded",
              jobId: "research-job-1",
              queuedAt: "2026-03-29T21:24:30.000Z",
              startedAt: "2026-03-29T21:24:45.000Z",
              finishedAt: "2026-03-29T21:24:50.000Z",
              retryAt: null,
              error: null,
            },
            challengeRun: {
              status: "succeeded",
              jobId: "challenge-job-1",
              queuedAt: "2026-03-29T21:25:30.000Z",
              startedAt: "2026-03-29T21:25:45.000Z",
              finishedAt: "2026-03-29T21:26:10.000Z",
              retryAt: null,
              error: null,
            },
            lastAiRunAt: "2026-03-29T21:25:10.000Z",
            lastChallengeRunAt: "2026-03-29T21:26:10.000Z",
            updatedAt: "2026-03-29T21:25:30.000Z",
          },
        ],
      })
    );

    expect(result.authorityWork[0]).toMatchObject({
      reviewerDecision: "do_not_use",
      status: "rejected",
    });
  });

  it("normalizes saved document readings and drops malformed ones", () => {
    const result = parseTinaWorkspaceDraft(
      JSON.stringify({
        issueQueue: {
          lastRunAt: "2026-03-26T21:25:00.000Z",
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
            challengeVerdict: "needs_care",
            memo: "Need better authority.",
            challengeMemo: "This may fail if the facts do not line up exactly.",
            reviewerNotes: "Do not use yet.",
            missingAuthority: ["Need primary QBI support"],
            challengeWarnings: ["The authority may be narrower than it first looks."],
            challengeQuestions: ["Do the business facts fit the authority's fact pattern?"],
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
            researchRun: {
              status: "rate_limited",
              jobId: "research-job-1",
              queuedAt: "2026-03-26T21:24:30.000Z",
              startedAt: "2026-03-26T21:24:45.000Z",
              finishedAt: "2026-03-26T21:24:50.000Z",
              retryAt: "2026-03-26T21:25:45.000Z",
              error: "Temporary rate limit",
            },
            challengeRun: {
              status: "succeeded",
              jobId: "challenge-job-1",
              queuedAt: "2026-03-26T21:25:30.000Z",
              startedAt: "2026-03-26T21:25:45.000Z",
              finishedAt: "2026-03-26T21:26:10.000Z",
              retryAt: null,
              error: null,
            },
            lastAiRunAt: "2026-03-26T21:25:10.000Z",
            lastChallengeRunAt: "2026-03-26T21:26:10.000Z",
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
        officialFormPacket: {
          lastRunAt: "2026-03-26T21:45:30.000Z",
          status: "complete",
          summary: "Official packet ready",
          nextStep: "Keep going",
          forms: [
            {
              id: "schedule-c-2025",
              formNumber: "Schedule C (Form 1040)",
              title: "Profit or Loss From Business",
              taxYear: "2025",
              revisionYear: "2025",
              status: "needs_review",
              summary: "Needs review",
              nextStep: "Check line 1",
              lines: [
                {
                  id: "schedule-c-line-1",
                  lineNumber: "Line 1",
                  label: "Gross receipts or sales",
                  value: "$18,000",
                  state: "review",
                  summary: "Needs review",
                  scheduleCDraftFieldIds: ["line-1-gross-receipts"],
                  scheduleCDraftNoteIds: ["schedule-c-sales-tax-note"],
                  sourceDocumentIds: ["doc-1"],
                },
                {
                  broken: true,
                },
              ],
              supportSchedules: [],
              relatedNoteIds: ["schedule-c-sales-tax-note"],
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
        finalSignoff: {
          lastRunAt: "2026-03-26T21:48:00.000Z",
          status: "complete",
          level: "ready",
          summary: "Ready for final signoff",
          nextStep: "Hand it off",
          checks: [
            {
              id: "looked-at-open-items",
              label: "I looked at Tina's open items and notes.",
              helpText: "I reviewed the open items.",
              checked: true,
            },
            {
              broken: true,
            },
          ],
          reviewerName: "Ada Reviewer",
          reviewerNote: "Looks good.",
          confirmedAt: "2026-03-26T21:49:00.000Z",
          confirmedPacketId: "TINA-2025-ABCDEFGH",
          confirmedPacketVersion: "rev-00000000001",
          confirmedPacketFingerprint: "00000000001",
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
    expect(result.authorityWork).toHaveLength(1);
    expect(result.authorityWork[0]?.ideaId).toBe("qbi-review");
    expect(result.authorityWork[0]?.missingAuthority).toEqual(["Need primary QBI support"]);
    expect(result.authorityWork[0]?.challengeVerdict).toBe("needs_care");
    expect(result.authorityWork[0]?.challengeWarnings).toEqual([
      "The authority may be narrower than it first looks.",
    ]);
    expect(result.authorityWork[0]?.challengeQuestions).toEqual([
      "Do the business facts fit the authority's fact pattern?",
    ]);
    expect(result.authorityWork[0]?.citations).toHaveLength(1);
    expect(result.authorityWork[0]?.researchRun.status).toBe("rate_limited");
    expect(result.authorityWork[0]?.researchRun.retryAt).toBe("2026-03-26T21:25:45.000Z");
    expect(result.authorityWork[0]?.challengeRun.status).toBe("succeeded");
    expect(result.authorityWork[0]?.lastAiRunAt).toBe("2026-03-26T21:25:10.000Z");
    expect(result.authorityWork[0]?.lastChallengeRunAt).toBe("2026-03-26T21:26:10.000Z");
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
    expect(result.officialFormPacket.status).toBe("complete");
    expect(result.officialFormPacket.forms).toHaveLength(1);
    expect(result.officialFormPacket.forms[0]?.lines).toHaveLength(1);
    expect(result.officialFormPacket.forms[0]?.lines[0]?.state).toBe("review");
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
    expect(result.finalSignoff.status).toBe("complete");
    expect(result.finalSignoff.level).toBe("ready");
    expect(result.finalSignoff.checks).toHaveLength(1);
    expect(result.finalSignoff.reviewerName).toBe("Ada Reviewer");
    expect(result.finalSignoff.confirmedAt).toBe("2026-03-26T21:49:00.000Z");
    expect(result.finalSignoff.confirmedPacketId).toBe("TINA-2025-ABCDEFGH");
    expect(result.finalSignoff.confirmedPacketVersion).toBe("rev-00000000001");
    expect(result.finalSignoff.confirmedPacketFingerprint).toBe("00000000001");
  });
});
