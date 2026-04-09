import { describe, expect, it } from "vitest";
import type { NormalizedImportRecord } from "@/lib/import-normalization";
import { extractImportedPhoneCandidates, updateExistingRecordFromImport } from "@/lib/imports-server";

function makeRecord(overrides: Partial<NormalizedImportRecord> = {}): NormalizedImportRecord {
  return {
    rowNumber: 2,
    sentinelLeadId: null,
    ownerName: "Linda Example",
    ownerSuffix: null,
    coOwnerName: null,
    propertyAddress: "2302 S Davis Ct",
    propertyCity: "Spokane Valley",
    propertyState: "WA",
    propertyZip: "99216",
    mailingAddress: null,
    mailingCity: null,
    mailingState: null,
    mailingZip: null,
    apn: "MANUAL-123",
    county: "spokane",
    phone: null,
    phone2: null,
    phone3: null,
    phone4: null,
    phone5: null,
    phone6: null,
    phone7: null,
    phone8: null,
    phone9: null,
    phone10: null,
    email: null,
    email2: null,
    email3: null,
    notes: null,
    estimatedValue: null,
    propertyType: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    yearBuilt: null,
    lienAmount: null,
    equityAmount: null,
    annualTaxes: null,
    estimatedTaxRate: null,
    purchaseAmount: null,
    purchaseDate: null,
    ownerOccupied: null,
    mailVacant: null,
    preProbate: null,
    sourceVendor: "Skip Genie",
    sourceListName: "Probate Leads",
    distressTags: ["probate"],
    reviewStatus: "ready_to_call",
    warnings: [],
    rawRowPayload: {},
    unmappedColumns: {},
    mappingWarnings: [],
    duplicate: { level: "high", reasons: ["Matched existing APN + county"], propertyId: "property-1", leadId: "lead-1" },
    documentType: null,
    caseNumber: null,
    fileDate: null,
    dateOfDeath: null,
    deceasedFirstName: null,
    deceasedLastName: null,
    deceasedMiddleName: null,
    survivorFirstName: null,
    survivorLastName: null,
    survivorMiddleName: null,
    survivorAddress: null,
    survivorCity: null,
    survivorState: null,
    survivorZip: null,
    survivorPhone: null,
    survivorEmail: null,
    petitionerFirstName: null,
    petitionerLastName: null,
    petitionerMiddleName: null,
    petitionerAddress: null,
    petitionerCity: null,
    petitionerState: null,
    petitionerZip: null,
    petitionerPhone: null,
    petitionerEmail: null,
    attorneyFirstName: null,
    attorneyLastName: null,
    attorneyMiddleName: null,
    attorneyAddress: null,
    attorneyCity: null,
    attorneyState: null,
    attorneyZip: null,
    attorneyPhone: null,
    attorneyEmail: null,
    attorneyBarNumber: null,
    ...overrides,
  };
}

function createSupabaseDouble(options?: {
  property?: Record<string, unknown>;
  lead?: Record<string, unknown> | null;
  existingLeadPhones?: Array<Record<string, unknown>>;
}) {
  const property = {
    owner_flags: {},
    owner_phone: null,
    owner_email: null,
    owner_name: "Unknown Owner",
    city: null,
    state: null,
    zip: null,
    ...options?.property,
  };
  const lead = options?.lead ?? {
    id: "lead-1",
    tags: ["probate"],
    notes: null,
    source: null,
  };
  const existingLeadPhones = options?.existingLeadPhones ?? [];

  const propertyUpdates: Array<Record<string, unknown>> = [];
  const leadUpdates: Array<Record<string, unknown>> = [];
  const insertedLeadPhones: Array<Record<string, unknown>> = [];

  return {
    propertyUpdates,
    leadUpdates,
    insertedLeadPhones,
    sb: {
      from(table: string) {
        if (table === "properties") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            single: async () => ({ data: property, error: null }),
            update(patch: Record<string, unknown>) {
              propertyUpdates.push(patch);
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === "leads") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle: async () => ({ data: lead, error: null }),
            update(patch: Record<string, unknown>) {
              leadUpdates.push(patch);
              return {
                eq: async () => ({ error: null }),
              };
            },
          };
        }

        if (table === "lead_phones") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order: async () => ({ data: existingLeadPhones, error: null }),
            insert(row: Record<string, unknown>) {
              insertedLeadPhones.push(row);
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("imports-server", () => {
  it("matches an existing lead directly from Sentinel Lead ID", async () => {
    const record = makeRecord({
      sentinelLeadId: "lead-123",
      apn: null,
      county: null,
    });

    const sb = {
      from(table: string) {
        if (table === "leads") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({ data: { id: "lead-123", property_id: "property-123" }, error: null }),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    };

    const { findDuplicateCandidate } = await import("@/lib/imports-server");
    const duplicate = await findDuplicateCandidate(sb as never, record, new Map());

    expect(duplicate).toEqual({
      level: "high",
      reasons: ["Matched Sentinel Lead ID"],
      propertyId: "property-123",
      leadId: "lead-123",
    });
  });

  it("extracts unique imported phone candidates in stable order", () => {
    const phones = extractImportedPhoneCandidates(
      makeRecord({
        phone: "(509) 111-2222",
        phone2: "+1 509-111-2222",
        phone3: "509-333-4444",
        phone10: "1 (509) 555-6666",
      }),
    );

    expect(phones).toEqual(["5091112222", "5093334444", "5095556666"]);
  });

  it("promotes imported phones into canonical lead phones for duplicate updates", async () => {
    const record = makeRecord({
      phone: "5091112222",
      phone2: "(509) 333-4444",
      phone3: "5091112222",
    });
    const { sb, propertyUpdates, leadUpdates, insertedLeadPhones } = createSupabaseDouble();

    const didUpdate = await updateExistingRecordFromImport({
      sb: sb as never,
      duplicate: { level: "high", reasons: ["Matched existing APN + county"], propertyId: "property-1", leadId: "lead-1" },
      record,
      defaults: {
        sourceChannel: "csv_import",
        sourceVendor: "Skip Genie",
        sourceListName: "Probate Leads",
        sourcePullDate: "2026-04-09",
        nicheTag: "probate",
        importBatchId: "probate_skipgenie_batch",
        templateId: "",
        skipTraceStatus: "completed",
        outreachType: "cold_call",
      },
    });

    expect(didUpdate).toBe(true);
    expect(propertyUpdates[0]?.owner_phone).toBe("5091112222");
    expect(insertedLeadPhones).toHaveLength(2);
    expect(insertedLeadPhones[0]).toMatchObject({
      lead_id: "lead-1",
      property_id: "property-1",
      phone: "+15091112222",
      source: "import:skip_genie",
      is_primary: true,
      position: 0,
    });
    expect(insertedLeadPhones[1]).toMatchObject({
      phone: "+15093334444",
      is_primary: false,
      position: 1,
    });
    expect(leadUpdates[0]).toMatchObject({
      source: "csv_import",
    });
  });

  it("skips already-known phone numbers when enriching an existing lead", async () => {
    const record = makeRecord({
      phone: "5091112222",
      phone2: "5093334444",
    });
    const { sb, insertedLeadPhones } = createSupabaseDouble({
      property: {
        owner_phone: "5091112222",
      },
      existingLeadPhones: [
        { phone: "+15093334444", position: 0, is_primary: true, status: "active" },
      ],
    });

    await updateExistingRecordFromImport({
      sb: sb as never,
      duplicate: { level: "high", reasons: ["Matched existing APN + county"], propertyId: "property-1", leadId: "lead-1" },
      record,
      defaults: {
        sourceChannel: "csv_import",
        sourceVendor: "Skip Genie",
        sourceListName: "Probate Leads",
        sourcePullDate: "2026-04-09",
        nicheTag: "probate",
        importBatchId: "probate_skipgenie_batch",
        templateId: "",
        skipTraceStatus: "completed",
        outreachType: "cold_call",
      },
    });

    expect(insertedLeadPhones).toHaveLength(0);
  });
});
