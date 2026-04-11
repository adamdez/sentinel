import { describe, expect, it, vi } from "vitest";
import type { AgentFinding, DeepSkipPerson } from "@/lib/openclaw-client";

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(),
}));

const {
  buildFallbackPeopleIntel,
  classifyResearchQuality,
  extractNextOfKinCandidates,
  mergeResearchLegalMetadata,
  mergeDeepSearchRelatedContacts,
  summarizeResearchSignals,
} = await import("@/lib/lead-research");

function person(overrides: Partial<DeepSkipPerson>): DeepSkipPerson {
  return {
    name: "Unknown Person",
    role: "owner",
    phones: [],
    emails: [],
    notes: "",
    source: "openclaw",
    confidence: 0.5,
    ...overrides,
  };
}

function finding(overrides: Partial<AgentFinding>): AgentFinding {
  return {
    agentId: "agent-1",
    category: "social_media",
    source: "Open Source",
    finding: "Generic finding",
    confidence: 0.5,
    ...overrides,
  };
}

describe("extractNextOfKinCandidates", () => {
  it("keeps estate-relevant people and sorts them by confidence", () => {
    const result = extractNextOfKinCandidates([
      person({ name: "Owner Person", role: "owner", confidence: 0.99 }),
      person({ name: "Jane Executor", role: "executor", confidence: 0.82, notes: "Named as executor in probate filing." }),
      person({ name: "Tim Heir", role: "heir", confidence: 0.74, phones: ["5095551111"] }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Jane Executor");
    expect(result[0].role).toBe("executor");
    expect(result[1].name).toBe("Tim Heir");
    expect(result[1].phones).toContain("5095551111");
  });

  it("includes spouse and attorney contacts but excludes unrelated categories", () => {
    const result = extractNextOfKinCandidates([
      person({ name: "Mia Spouse", role: "spouse", confidence: 0.61 }),
      person({ name: "Alex Attorney", role: "attorney", confidence: 0.58 }),
      person({ name: "Beth Contact", role: "owner", confidence: 0.8 }),
    ]);

    expect(result.map((item) => item.name)).toEqual(["Mia Spouse", "Alex Attorney"]);
  });
});

describe("summarizeResearchSignals", () => {
  it("counts corroborating hard-record findings even when normalized legal documents are missing", () => {
    const result = summarizeResearchSignals({
      legalDocumentsFound: 0,
      agentFindings: [
        finding({ category: "financial", finding: "Civil judgment lien filed against owner" }),
        finding({ category: "court_record", finding: "Probate case filed in superior court" }),
        finding({ category: "social_media", finding: "Facebook profile found" }),
      ],
    });

    expect(result.confirmedLegalRecords).toBe(0);
    expect(result.corroboratingHardRecordFindings).toBe(2);
  });
});

describe("buildFallbackPeopleIntel", () => {
  it("pulls estate contacts from imported owner flags and related contacts", () => {
    const result = buildFallbackPeopleIntel({
      ownerFlags: {
        petitioner_contact: {
          first_name: "Janet",
          last_name: "Bates",
          phone: "509-555-0101",
          email: "janet@example.com",
        },
        attorney_contact: {
          first_name: "Mark",
          last_name: "Counsel",
          bar_number: "12345",
          phone: "509-555-0303",
        },
        related_contacts: [
          {
            id: "rel-1",
            name: "Nancy Bates Jr",
            relation: "daughter",
            phone: "509-555-0202",
            email: "nancyjr@example.com",
            note: "Lives in Idaho now.",
          },
        ],
      },
      legalDocuments: [],
      ownerName: "Guy Bates",
    });

    expect(result.people.map((person) => person.name)).toEqual([
      "Mark Counsel",
      "Janet Bates",
      "Nancy Bates Jr",
    ]);
    expect(result.people[0].role).toBe("attorney");
    expect(result.people[1].role).toBe("executor");
    expect(result.people[2].role).toBe("family");
    expect(result.findings).toHaveLength(3);
  });

  it("derives probate decision-makers from legal documents when no people-intel agent ran", () => {
    const result = buildFallbackPeopleIntel({
      ownerFlags: {},
      legalDocuments: [
        {
          documentType: "probate_petition",
          instrumentNumber: null,
          recordingDate: "2026-04-10",
          documentDate: null,
          grantor: "Estate of Guy Bates",
          grantee: "Janet Bates",
          amount: null,
          lenderName: null,
          status: "pending",
          caseNumber: "25-4-00938-32",
          courtName: "Spokane County Superior Court",
          caseType: "Probate",
          attorneyName: "Laura Smith",
          contactPerson: "Janet Bates",
          nextHearingDate: null,
          eventDescription: "Janet Bates appointed personal representative for the estate.",
          source: "wa_courts",
          sourceUrl: "https://example.com/probate-case",
          rawExcerpt: "Janet Bates personal representative. Attorney Laura Smith appeared for petitioner.",
        },
      ],
      ownerName: "Guy Bates",
    });

    const kin = extractNextOfKinCandidates(result.people);
    expect(kin.map((person) => `${person.name}:${person.role}`)).toContain("Janet Bates:executor");
    expect(kin.map((person) => `${person.name}:${person.role}`)).toContain("Laura Smith:attorney");
    expect(result.findings.some((finding) => finding.url === "https://example.com/probate-case")).toBe(true);
  });
});

describe("mergeDeepSearchRelatedContacts", () => {
  it("adds deep-search people into related contacts without duplicating imported probate contacts", () => {
    const result = mergeDeepSearchRelatedContacts({
      ownerFlags: {
        attorney_contact: {
          first_name: "Laura",
          last_name: "Smith",
          phone: "509-555-1000",
        },
        related_contacts: [
          {
            id: "manual-1",
            name: "Nancy Bates Jr",
            relation: "daughter",
            phone: "509-555-0202",
            email: "nancyjr@example.com",
            note: "Manual note",
            source: "manual",
            attachments: [],
            created_at: "2026-04-10T00:00:00.000Z",
            updated_at: "2026-04-10T00:00:00.000Z",
          },
        ],
      },
      people: [
        person({
          name: "Laura Smith",
          role: "attorney",
          phones: ["509-555-1000"],
          confidence: 0.9,
          notes: "Attorney of record in probate filing.",
          source: "wa_courts",
        }),
        person({
          name: "Janet Bates",
          role: "executor",
          phones: ["509-555-0101"],
          emails: ["janet@example.com"],
          confidence: 0.86,
          notes: "Listed as personal representative.",
          source: "wa_courts",
        }),
      ],
      findings: [
        finding({
          category: "court_record",
          finding: "Janet Bates appointed personal representative.",
          url: "https://court.example/janet",
          structuredData: { personName: "Janet Bates" },
        }),
      ],
      ownerName: "Guy Bates",
      now: "2026-04-10T12:00:00.000Z",
    });

    expect(result.map((contact) => `${contact.name}:${contact.source}`)).toEqual([
      "Nancy Bates Jr:manual",
      "Janet Bates:deep_search",
    ]);
    expect(result[1]?.note).toContain("Links: https://court.example/janet");
  });

  it("updates the existing deep-search contact instead of duplicating it on rerun", () => {
    const result = mergeDeepSearchRelatedContacts({
      ownerFlags: {
        related_contacts: [
          {
            id: "deep-search-executor-janet-bates",
            name: "Janet Bates",
            relation: "executor",
            phone: "509-555-0000",
            email: null,
            note: "Old note",
            source: "deep_search",
            attachments: [],
            created_at: "2026-04-09T12:00:00.000Z",
            updated_at: "2026-04-09T12:00:00.000Z",
          },
        ],
      },
      people: [
        person({
          name: "Janet Bates",
          role: "executor",
          phones: ["509-555-0101"],
          emails: ["janet@example.com"],
          confidence: 0.88,
          notes: "Listed as personal representative in Spokane probate filing.",
          source: "wa_courts",
        }),
      ],
      findings: [],
      ownerName: "Guy Bates",
      now: "2026-04-10T12:00:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("deep-search-executor-janet-bates");
    expect(result[0]?.phone).toBe("509-555-0101");
    expect(result[0]?.email).toBe("janet@example.com");
    expect(result[0]?.created_at).toBe("2026-04-09T12:00:00.000Z");
    expect(result[0]?.updated_at).toBe("2026-04-10T12:00:00.000Z");
    expect(result[0]?.note).toContain("Auto-added from Deep Search.");
  });
});

describe("mergeResearchLegalMetadata", () => {
  it("fills legal metadata from official probate documents without overwriting existing higher-trust fields", () => {
    const result = mergeResearchLegalMetadata({
      existing: {
        date_of_death: "2025-01-10",
      },
      legalDocuments: [
        {
          documentType: "petition_for_letters_of_administration",
          instrumentNumber: null,
          recordingDate: "2025-04-28",
          documentDate: null,
          grantor: "Estate of Guy Bates",
          grantee: "Janet Bates",
          amount: null,
          lenderName: null,
          status: "active",
          caseNumber: "25-4-00938-32",
          courtName: "Spokane County Superior Court",
          caseType: "Probate",
          attorneyName: "Laura Smith",
          contactPerson: "Janet Bates",
          nextHearingDate: "2025-05-20",
          eventDescription: "Janet Bates appointed personal representative.",
          source: "wa_courts",
          sourceUrl: "https://court.example/case",
          rawExcerpt: null,
        },
      ],
      stagedAt: "2026-04-10T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      document_type: "petition for letters of administration",
      case_number: "25-4-00938-32",
      file_date: "2025-04-28",
      date_of_death: "2025-01-10",
      court_name: "Spokane County Superior Court",
      case_type: "Probate",
      next_hearing_date: "2025-05-20",
      status: "active",
      source_url: "https://court.example/case",
      source: "wa_courts",
      updated_at: "2026-04-10T12:00:00.000Z",
    });
  });
});

describe("classifyResearchQuality", () => {
  it("marks a run full when official docs, people intel, and a decision-maker are all present", () => {
    const result = classifyResearchQuality({
      legal: {
        supported: true,
        status: "completed",
        county: "Spokane",
        documents: [],
        documentsFound: 3,
        documentsInserted: 3,
        courtCasesFound: 1,
        errors: [],
        nextUpcomingEvent: null,
      },
      agentFindings: [
        finding({ category: "heir", finding: "Janet Bates listed as personal representative", confidence: 0.88 }),
      ],
      nextOfKin: [
        {
          name: "Janet Bates",
          role: "executor",
          summary: "Listed as personal representative.",
          source: "wa_courts",
          confidence: 0.88,
          phones: [],
          emails: [],
        },
      ],
      usedOpenClaw: true,
      aiProvider: "openai",
    });

    expect(result.quality).toBe("full");
    expect(result.gaps).toEqual([]);
  });

  it("marks a run fallback when it found useful legal/decision-maker data without advanced people-intel agents", () => {
    const result = classifyResearchQuality({
      legal: {
        supported: true,
        status: "partial",
        county: "Spokane",
        documents: [],
        documentsFound: 2,
        documentsInserted: 2,
        courtCasesFound: 1,
        errors: [],
        nextUpcomingEvent: null,
      },
      agentFindings: [],
      nextOfKin: [
        {
          name: "Janet Bates",
          role: "executor",
          summary: "Listed as personal representative.",
          source: "wa_courts",
          confidence: 0.78,
          phones: [],
          emails: [],
        },
      ],
      usedOpenClaw: false,
      aiProvider: "fallback",
    });

    expect(result.quality).toBe("fallback");
    expect(result.gaps.some((gap) => gap.includes("Advanced people-intel agents were unavailable"))).toBe(true);
  });
});
