import { describe, expect, it } from "vitest";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("entity-filing-remediation", () => {
  it("stays aligned on a clean sole-prop route with no continuity debt", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEntityFilingRemediation({
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

    expect(snapshot.overallStatus).toBe("aligned");
    expect(snapshot.posture).toBe("aligned_current_path");
    expect(snapshot.historyStatus).toBe("aligned");
    expect(snapshot.electionStatus).toBe("not_applicable");
    expect(snapshot.amendmentStatus).toBe("not_applicable");
    expect(snapshot.signals).toHaveLength(0);
    expect(snapshot.actions.find((action) => action.id === "current-year-return-path")?.status).toBe(
      "aligned"
    );
  });

  it("blocks files with prior-return drift, likely missing 1065 backlog, and unresolved owner timing", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEntityFilingRemediation({
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
          uploadedAt: "2026-04-04T08:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-multi-owner",
          sourceDocumentId: "doc-prior-return",
          label: "Multi-owner clue",
          value: "Two or more members split profit informally and no one tracked ownership percentages cleanly.",
          confidence: "high",
          capturedAt: "2026-04-04T08:01:00.000Z",
        },
        {
          id: "fact-prior-schedule-c",
          sourceDocumentId: "doc-prior-return",
          label: "Prior return clue",
          value: "Prior-year filing was prepared on Schedule C even though multiple owners existed.",
          confidence: "high",
          capturedAt: "2026-04-04T08:02:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-prior-return",
          status: "complete",
          kind: "pdf",
          summary: "Prior return and ownership notes",
          nextStep: "Reconcile entity history",
          facts: [],
          detailLines: [
            "2024 return was filed on Schedule C.",
            "Two or more members ran the LLC and split profits informally.",
            "No 1065 or K-1 was filed for the partnership years.",
            "No clean election trail exists if S-corp treatment is claimed.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T08:03:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.posture).toBe("missing_return_backlog");
    expect(snapshot.historyStatus).toBe("blocked");
    expect(snapshot.amendmentStatus).toBe("not_applicable");
    expect(snapshot.likelyPriorLaneIds).toContain("schedule_c_single_member_llc");
    expect(snapshot.signals.some((signal) => signal.category === "missing_return_backlog")).toBe(
      true
    );
    expect(snapshot.signals.some((signal) => signal.category === "ownership_timeline_gap")).toBe(
      true
    );
    expect(snapshot.priorityQuestions).toContain("How many owners existed during the year and when?");
    expect(snapshot.actions.some((action) => action.id === "missing-return-1065")).toBe(true);
    expect(
      snapshot.actions.some((action) => action.id === "prior-return-route-reconciliation")
    ).toBe(true);
  });

  it("treats late-election relief and prior-year books drift as blocking remediation debt", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEntityFilingRemediation({
      ...base,
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
      sourceFacts: [
        {
          id: "fact-election",
          sourceDocumentId: "doc-election-notes",
          label: "Election relief clue",
          value: "The business started as a single-member LLC, later ran payroll like an S corp, and may need late-election relief because no clean IRS acceptance trail exists.",
          confidence: "high",
          capturedAt: "2026-04-05T08:01:00.000Z",
        },
        {
          id: "fact-books-drift",
          sourceDocumentId: "doc-election-notes",
          label: "Beginning balance drift",
          value: "Beginning balances do not reconcile to filed prior-year returns and the current-year fix may require an amended return.",
          confidence: "high",
          capturedAt: "2026-04-05T08:02:00.000Z",
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

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.posture).toBe("late_election_relief");
    expect(snapshot.electionStatus).toBe("relief_candidate");
    expect(snapshot.amendmentStatus).toBe("sequencing_required");
    expect(snapshot.signals.some((signal) => signal.category === "late_election_relief")).toBe(
      true
    );
    expect(
      snapshot.signals.some((signal) => signal.category === "amended_return_sequencing")
    ).toBe(true);
    expect(snapshot.actions.some((action) => action.id === "amended-return-sequencing")).toBe(
      true
    );
  });
});
