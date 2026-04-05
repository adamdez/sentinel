import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("document-intelligence", () => {
  it("classifies prior-return drift papers into real tax artifacts and preserves the paper conflict", () => {
    const snapshot = buildTinaDocumentIntelligence(
      TINA_SKILL_REVIEW_DRAFTS["prior-return-drift"]
    );

    expect(snapshot.overallStatus).toBe("conflicted");
    expect(snapshot.items.some((item) => item.roles.includes("entity_election"))).toBe(true);
    expect(snapshot.items.some((item) => item.roles.includes("prior_return_package"))).toBe(
      true
    );
    expect(
      snapshot.items.some((item) =>
        item.extractedFacts.some(
          (fact) => fact.kind === "election_signal" && fact.valueText === "s_corp"
        )
      )
    ).toBe(true);
    expect(snapshot.conflictCount).toBeGreaterThan(0);
  });

  it("recognizes heavy depreciation support as asset-ledger level paper, not just a vague clue", () => {
    const snapshot = buildTinaDocumentIntelligence(
      TINA_SKILL_REVIEW_DRAFTS["heavy-depreciation-year"]
    );

    expect(
      snapshot.items.some(
        (item) => item.roles.includes("asset_ledger") && item.status !== "signal_only"
      )
    ).toBe(true);
    expect(
      snapshot.items.some((item) =>
        item.extractedFacts.some((fact) => fact.label === "Placed-in-service support")
      )
    ).toBe(true);
    expect(snapshot.missingCriticalRoles).not.toContain(
      "asset rollforward or depreciation support"
    );
  });

  it("recognizes payroll overlap files as real payroll artifacts and not just generic books noise", () => {
    const snapshot = buildTinaDocumentIntelligence(
      TINA_SKILL_REVIEW_DRAFTS["payroll-contractor-overlap"]
    );

    expect(
      snapshot.items.some(
        (item) => item.roles.includes("payroll_report") && item.status !== "signal_only"
      )
    ).toBe(true);
    expect(snapshot.structuredDocumentCount).toBeGreaterThan(0);
  });

  it("extracts multiple EIN identity signals from dirty-books paper trails", () => {
    const snapshot = buildTinaDocumentIntelligence(TINA_SKILL_REVIEW_DRAFTS["dirty-books"]);

    const einValues = snapshot.items
      .flatMap((item) => item.extractedFacts)
      .filter((fact) => fact.kind === "identity_signal")
      .map((fact) => fact.valueText);

    expect(new Set(einValues).size).toBeGreaterThan(1);
    expect(snapshot.extractedFactCount).toBeGreaterThan(0);
  });

  it("extracts prior-filing and election-timing continuity facts from drifted entity papers", () => {
    const snapshot = buildTinaDocumentIntelligence(
      TINA_SKILL_REVIEW_DRAFTS["prior-return-drift"]
    );

    expect(
      snapshot.items.some((item) =>
        item.extractedFacts.some((fact) => fact.kind === "prior_filing_signal")
      )
    ).toBe(true);
    expect(
      snapshot.items.some((item) =>
        item.extractedFacts.some((fact) => fact.kind === "election_timeline_signal")
      )
    ).toBe(true);
    expect(snapshot.continuityConflictCount).toBeGreaterThan(0);
    expect(snapshot.continuityQuestions.length).toBeGreaterThan(0);
  });

  it("tracks entity-name and state-registration pressure when structured papers tell multiple stories", () => {
    const draft = clone(TINA_SKILL_REVIEW_DRAFTS["prior-return-drift"]);

    draft.documents.push(
      {
        id: "doc-formation-state",
        name: "Signal Ridge Works LLC formation certificate.pdf",
        size: 100,
        mimeType: "application/pdf",
        storagePath: "tina/test/signal-ridge-formation.pdf",
        category: "supporting_document",
        requestId: "formation-papers",
        requestLabel: "Formation papers",
        uploadedAt: "2026-04-04T02:00:00.000Z",
      },
      {
        id: "doc-state-registration",
        name: "Signal Ridge Operating LLC certificate of authority.pdf",
        size: 100,
        mimeType: "application/pdf",
        storagePath: "tina/test/signal-ridge-registration.pdf",
        category: "supporting_document",
        requestId: null,
        requestLabel: "State registration",
        uploadedAt: "2026-04-04T02:01:00.000Z",
      }
    );
    draft.documentReadings.push(
      {
        documentId: "doc-formation-state",
        status: "complete",
        kind: "pdf",
        summary: "Read",
        nextStep: "Keep going",
        facts: [],
        detailLines: [
          "Signal Ridge Works LLC was formed in Washington.",
        ],
        rowCount: null,
        headers: [],
        sheetNames: [],
        lastReadAt: "2026-04-04T02:02:00.000Z",
      },
      {
        documentId: "doc-state-registration",
        status: "complete",
        kind: "pdf",
        summary: "Read",
        nextStep: "Keep going",
        facts: [],
        detailLines: [
          "Signal Ridge Operating LLC is qualified in Idaho and operating in Idaho.",
        ],
        rowCount: null,
        headers: [],
        sheetNames: [],
        lastReadAt: "2026-04-04T02:03:00.000Z",
      }
    );

    const snapshot = buildTinaDocumentIntelligence(draft);

    expect(snapshot.entityNameCount).toBeGreaterThan(1);
    expect(snapshot.stateRegistrationSignalCount).toBeGreaterThan(0);
    expect(snapshot.identityConflictCount).toBeGreaterThan(0);
    expect(snapshot.continuityQuestions.some((question) => /entity name|state/i.test(question))).toBe(
      true
    );
  });
});
