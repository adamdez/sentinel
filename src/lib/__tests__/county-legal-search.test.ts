import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessLegalDocumentMatch,
  parseOwnerName,
  runLegalSearch,
  type LegalSearchInput,
  type NormalizedDocument,
} from "@/lib/county-legal-search";

const baseInput: LegalSearchInput = {
  ownerName: "Bruce A. Housam",
  address: "12318 N Ritchey Ln, Spokane, WA 99224",
  apn: "36191.1305",
  county: "Spokane County",
  city: "Spokane",
};

function buildDoc(overrides: Partial<NormalizedDocument>): NormalizedDocument {
  return {
    documentType: "lien",
    instrumentNumber: null,
    recordingDate: "2025-02-01",
    documentDate: null,
    grantor: null,
    grantee: null,
    amount: null,
    lenderName: null,
    status: "active",
    caseNumber: null,
    courtName: null,
    caseType: null,
    attorneyName: null,
    contactPerson: null,
    nextHearingDate: null,
    eventDescription: null,
    source: "spokane_recorder",
    sourceUrl: null,
    rawExcerpt: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseOwnerName", () => {
  it("treats natural-order person names as first-middle-last", () => {
    const parsed = parseOwnerName("Bruce A. Housam");
    expect(parsed.first).toBe("BRUCE");
    expect(parsed.last).toBe("HOUSAM");
    expect(parsed.surnameCandidates).toContain("HOUSAM");
  });

  it("supports county-style last-first with comma", () => {
    const parsed = parseOwnerName("Housam, Bruce A.");
    expect(parsed.first).toBe("BRUCE");
    expect(parsed.last).toBe("HOUSAM");
    expect(parsed.fullNameVariants).toContain("BRUCE A HOUSAM");
  });
});

describe("assessLegalDocumentMatch", () => {
  it("accepts recorder docs that match the owner and address", () => {
    const assessment = assessLegalDocumentMatch(buildDoc({
      grantor: "Bruce A Housam",
      eventDescription: "Trustee Sale filed against 12318 N Ritchey Ln Spokane WA",
      rawExcerpt: "Bruce A Housam 12318 N Ritchey Ln Spokane WA 99224",
    }), baseInput);

    expect(assessment.accepted).toBe(true);
    expect(assessment.ownerStrong).toBe(true);
    expect(assessment.addressStrong).toBe(true);
  });

  it("rejects unrelated same-county docs that only share the region", () => {
    const assessment = assessLegalDocumentMatch(buildDoc({
      grantor: "Timothy David Frazier",
      grantee: "Lakeview Loan Servicing, LLC",
      eventDescription: "Trustee Sale in Spokane County",
      rawExcerpt: "Spokane County trustee sale notice for another property",
    }), baseInput);

    expect(assessment.accepted).toBe(false);
    expect(assessment.ownerStrong).toBe(false);
    expect(assessment.addressStrong).toBe(false);
  });

  it("accepts APN matches even when names are sparse", () => {
    const assessment = assessLegalDocumentMatch(buildDoc({
      rawExcerpt: "Parcel 36191.1305 delinquent tax notice recorded in Spokane County",
      source: "spokane_liens",
    }), baseInput);

    expect(assessment.accepted).toBe(true);
    expect(assessment.apnMatch).toBe(true);
  });

  it("requires owner evidence for court matches", () => {
    const assessment = assessLegalDocumentMatch(buildDoc({
      source: "wa_courts",
      caseNumber: "25-2-12345-32",
      eventDescription: "Civil matter filed in Spokane County",
      rawExcerpt: "Case filed in Spokane County Superior Court",
    }), baseInput);

    expect(assessment.accepted).toBe(false);
  });
});

describe("runLegalSearch", () => {
  it("surfaces upstream Firecrawl failures instead of silently looking empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 402, statusText: "Payment Required" }),
    );

    const result = await runLegalSearch(baseInput, "test-firecrawl-key");

    expect(result.documents).toEqual([]);
    expect(result.errors.some((error) => error.includes("402"))).toBe(true);
    expect(result.errors.some((error) => error.includes("Payment Required"))).toBe(true);
  });
});
