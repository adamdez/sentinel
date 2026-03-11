import { describe, expect, it } from "vitest";
import {
  buildTemplateSignature,
  inferFieldMappings,
  normalizeImportedRow,
  scoreTemplateMatch,
  type NormalizationDefaults,
} from "@/lib/import-normalization";

const DEFAULTS: NormalizationDefaults = {
  sourceChannel: "csv_import",
  sourceVendor: "county export",
  sourceListName: "spokane absentee",
  sourcePullDate: "2026-03-11",
  county: "spokane",
  nicheTag: "absentee_owner",
  importBatchId: "batch_spokane_absentee",
  outreachType: "cold_call",
  skipTraceStatus: "not_started",
  templateName: "",
  templateId: "",
};

describe("import normalization", () => {
  it("infers common import fields from vendor-style headers", () => {
    const headers = ["Owner Name", "Property Address", "Phone 1", "APN", "County", "List Name"];
    const rows = [
      {
        "Owner Name": "Jane Seller",
        "Property Address": "123 Main St",
        "Phone 1": "(509) 555-1212",
        APN: "123456",
        County: "Spokane",
        "List Name": "Probate Pull",
      },
    ];

    const result = inferFieldMappings(headers, rows);

    expect(result.mapped.owner_name).toBe("Owner Name");
    expect(result.mapped.property_address).toBe("Property Address");
    expect(result.mapped.phone).toBe("Phone 1");
    expect(result.mapped.apn).toBe("APN");
  });

  it("routes risky rows into review-oriented outbound statuses", () => {
    const mapping = {
      owner_name: "Owner",
      property_address: "Address",
      county: "County",
      distress_text: "List Type",
      do_not_call_flag: "DNC",
    } as const;

    const missingPhone = normalizeImportedRow({
      row: {
        Owner: "John Seller",
        Address: "456 Oak Ave",
        County: "Spokane",
        "List Type": "Vacant absentee",
        DNC: "",
      },
      rowNumber: 2,
      mapping,
      defaults: DEFAULTS,
    });

    expect(missingPhone.reviewStatus).toBe("missing_phone");
    expect(missingPhone.distressTags).toContain("vacant");
    expect(missingPhone.distressTags).toContain("absentee_owner");

    const doNotCall = normalizeImportedRow({
      row: {
        Owner: "John Seller",
        Address: "456 Oak Ave",
        County: "Spokane",
        "List Type": "",
        DNC: "yes",
      },
      rowNumber: 3,
      mapping,
      defaults: DEFAULTS,
    });

    expect(doNotCall.reviewStatus).toBe("do_not_call");
  });

  it("scores template similarity by sheet signature overlap", () => {
    const signature = buildTemplateSignature(["Owner Name", "Property Address", "APN"], "Absentee");
    const score = scoreTemplateMatch(
      ["Owner Name", "Property Address", "APN", "Phone 1"],
      "Absentee",
      { headerSignature: signature, sheetName: "Absentee" },
    );

    expect(score).toBeGreaterThan(0.7);
  });
});
