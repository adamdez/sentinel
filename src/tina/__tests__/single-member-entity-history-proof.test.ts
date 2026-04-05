import { describe, expect, it } from "vitest";
import { buildTinaSingleMemberEntityHistoryProof } from "@/tina/lib/single-member-entity-history-proof";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("single-member-entity-history-proof", () => {
  it("clears a single-member route when owner proof and prior filing history align", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaSingleMemberEntityHistoryProof({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Aligned Solo LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc",
        ownerCount: 1,
      },
      documents: [
        {
          id: "doc-prior-return",
          name: "2024 Schedule C return.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/tests/2024-schedule-c-return.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Prior return",
          uploadedAt: "2026-04-05T11:00:00.000Z",
        },
        {
          id: "doc-operating-agreement",
          name: "operating-agreement.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/tests/operating-agreement.pdf",
          category: "supporting_document",
          requestId: "ownership-agreement",
          requestLabel: "Operating agreement",
          uploadedAt: "2026-04-05T11:01:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-prior-return",
          status: "complete",
          kind: "pdf",
          summary: "Prior Schedule C filing",
          nextStep: "Carry forward aligned route facts",
          facts: [],
          detailLines: [
            "2024 return was filed on Schedule C for the single-member LLC.",
            "The organizer and return package both used the Schedule C path.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T11:02:00.000Z",
        },
        {
          documentId: "doc-operating-agreement",
          status: "complete",
          kind: "pdf",
          summary: "Single-member operating agreement",
          nextStep: "Keep as ownership proof",
          facts: [],
          detailLines: [
            "Operating agreement confirms one member for the LLC.",
            "The LLC has one member and no change in ownership during the year.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T11:03:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("clear");
    expect(snapshot.posture).toBe("single_member_path_proved");
    expect(snapshot.ownerHistoryStatus).toBe("proved");
    expect(snapshot.priorFilingAlignmentStatus).toBe("aligned");
  });

  it("fails closed when a married-couple file still needs spouse-exception proof", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaSingleMemberEntityHistoryProof({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Spouse Exception LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc",
        ownerCount: 2,
        spouseCommunityPropertyTreatment: "possible",
      },
      documents: [
        {
          id: "doc-prior-return",
          name: "2024 Schedule C return.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/tests/2024-schedule-c-return.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Prior return",
          uploadedAt: "2026-04-05T11:10:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-prior-return",
          status: "complete",
          kind: "pdf",
          summary: "Married-couple filing notes",
          nextStep: "Prove the narrow exception first",
          facts: [],
          detailLines: [
            "The business was described as a married couple business.",
            "Prior years were filed on Schedule C.",
            "No community-property proof or spouse exception support was provided.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T11:11:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.posture).toBe("spouse_exception_candidate");
    expect(snapshot.spouseExceptionStatus).toBe("conditional");
    expect(snapshot.issues.some((issue) => issue.id === "single-member-spouse-exception-proof")).toBe(
      true
    );
  });

  it("blocks the route when books still reflect an older entity story", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaSingleMemberEntityHistoryProof({
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
          uploadedAt: "2026-04-05T11:20:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-transition",
          status: "complete",
          kind: "pdf",
          summary: "Books never caught up to the transition",
          nextStep: "Rebuild the route timeline",
          facts: [],
          detailLines: [
            "The business changed structure mid-year and the books never caught up.",
            "The books still reflect the old business and owner-flow labels.",
            "No clean IRS acceptance trail exists and payroll actually started later.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T11:21:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.posture).toBe("books_not_caught_up");
    expect(snapshot.booksPostureStatus).toBe("not_caught_up");
    expect(snapshot.issues.some((issue) => issue.id === "single-member-books-not-caught-up")).toBe(
      true
    );
  });
});
