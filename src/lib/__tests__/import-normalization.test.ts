import { describe, expect, it } from "vitest";
import {
  buildProspectPayload,
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

  it("recognizes workbook-style phone and financial headers", () => {
    const headers = [
      "Primary Mobile Phone1",
      "Secondary Phone1",
      "Tax Delinquent $",
      "Purchase Amt",
      "Purchase Date",
      "Owner Occ?",
      "Pre-Probate?",
      "Mail Vacant?",
    ];
    const rows = [
      {
        "Primary Mobile Phone1": "(509) 555-1212",
        "Secondary Phone1": "(509) 555-3434",
        "Tax Delinquent $": "2500",
        "Purchase Amt": "180000",
        "Purchase Date": "2021-05-01",
        "Owner Occ?": "0",
        "Pre-Probate?": "1",
        "Mail Vacant?": "1",
      },
    ];

    const result = inferFieldMappings(headers, rows);
    const amountDueSuggestion = result.suggestions.find((s) => s.field === "amount_due");

    expect(result.mapped.phone).toBe("Primary Mobile Phone1");
    expect(result.mapped.phone2).toBe("Secondary Phone1");
    expect([
      result.mapped.amount_due,
      result.mapped.tax_delinquent_flag,
      amountDueSuggestion?.header,
    ]).toContain("Tax Delinquent $");
    expect(result.mapped.purchase_amount).toBe("Purchase Amt");
    expect(result.mapped.purchase_date).toBe("Purchase Date");
    expect(result.mapped.owner_occupied_flag).toBe("Owner Occ?");
    expect(result.mapped.pre_probate_flag).toBe("Pre-Probate?");
    expect(result.mapped.mail_vacant_flag).toBe("Mail Vacant?");
  });

  it("auto-maps Skip Genie export headers for re-import", () => {
    const headers = [
      "LastName",
      "FirstName",
      "MiddleName",
      "Address",
      "City",
      "State",
      "ZipCode",
      "Campaign",
      "Sentinel Lead ID",
      "APN",
      "County",
    ];
    const rows = [
      {
        LastName: "Seller",
        FirstName: "Jane",
        MiddleName: "M",
        Address: "123 Main St",
        City: "Spokane",
        State: "WA",
        ZipCode: "99201",
        Campaign: "Probate Skip Trace",
        "Sentinel Lead ID": "lead-123",
        APN: "123456789",
        County: "Spokane",
      },
    ];

    const result = inferFieldMappings(headers, rows);

    expect(result.mapped.owner_last_name).toBe("LastName");
    expect(result.mapped.owner_first_name).toBe("FirstName");
    expect(result.mapped.owner_middle_name).toBe("MiddleName");
    expect(result.mapped.property_address).toBe("Address");
    expect(result.mapped.property_city).toBe("City");
    expect(result.mapped.property_state).toBe("State");
    expect(result.mapped.property_zip).toBe("ZipCode");
    expect(result.mapped.source_list_name).toBe("Campaign");
    expect(result.mapped.sentinel_lead_id).toBe("Sentinel Lead ID");
    expect(result.mapped.apn).toBe("APN");
    expect(result.mapped.county).toBe("County");
  });

  it("recognizes Skip Genie return headers for address, name, campaign, and phones", () => {
    const headers = [
      "CAMPAIGN",
      "INPUT_NAME",
      "INPUT_ADDRESS",
      "INPUT_CITY",
      "INPUT_STATE",
      "INPUT_ZIPCODE",
      "FIRST",
      "MIDDLE",
      "LAST",
      "MOBILE1",
      "MOBILE2",
      "PHONE1",
      "PHONE_TYPE1",
      "PHONE2",
      "PHONE_TYPE2",
    ];
    const rows = [
      {
        CAMPAIGN: "spokane delinquentpreprobate",
        INPUT_NAME: "DONNA R HARDER",
        INPUT_ADDRESS: "5406 W NORTHWEST BLVD",
        INPUT_CITY: "SPOKANE",
        INPUT_STATE: "WA",
        INPUT_ZIPCODE: "99205",
        FIRST: "DONNA",
        MIDDLE: "R",
        LAST: "HARDER",
        MOBILE1: "2066187017",
        MOBILE2: "",
        PHONE1: "2066187017",
        PHONE_TYPE1: "Wireless",
        PHONE2: "5093256857",
        PHONE_TYPE2: "Landline",
      },
    ];

    const result = inferFieldMappings(headers, rows);

    expect(result.mapped.source_list_name).toBe("CAMPAIGN");
    expect(result.mapped.owner_name).toBe("INPUT_NAME");
    expect(result.mapped.property_address).toBe("INPUT_ADDRESS");
    expect(result.mapped.property_city).toBe("INPUT_CITY");
    expect(result.mapped.property_state).toBe("INPUT_STATE");
    expect(result.mapped.property_zip).toBe("INPUT_ZIPCODE");
    expect(result.mapped.owner_first_name).toBe("FIRST");
    expect(result.mapped.owner_middle_name).toBe("MIDDLE");
    expect(result.mapped.owner_last_name).toBe("LAST");
    expect(result.mapped.phone).toBe("MOBILE1");
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

  it("derives absentee and inherited context from owner-occupied and pre-probate flags", () => {
    const mapping = {
      owner_name: "Owner",
      property_address: "Address",
      county: "County",
      phone: "Phone",
      owner_occupied_flag: "Owner Occ?",
      pre_probate_flag: "Pre-Probate?",
    } as const;

    const result = normalizeImportedRow({
      row: {
        Owner: "John Seller",
        Address: "456 Oak Ave",
        County: "Spokane",
        Phone: "(509) 555-1212",
        "Owner Occ?": "0",
        "Pre-Probate?": "1",
      },
      rowNumber: 2,
      mapping,
      defaults: DEFAULTS,
    });

    expect(result.distressTags).toContain("absentee_owner");
    expect(result.distressTags).toContain("inherited");
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

  it("marks bulk imports to skip synchronous enrichment", () => {
    const mapping = {
      owner_name: "Owner",
      property_address: "Address",
      county: "County",
      phone: "Phone",
    } as const;

    const record = normalizeImportedRow({
      row: {
        Owner: "John Seller",
        Address: "456 Oak Ave",
        County: "Spokane",
        Phone: "(509) 555-1212",
      },
      rowNumber: 2,
      mapping,
      defaults: DEFAULTS,
    });

    const payload = buildProspectPayload(record, DEFAULTS);

    expect(payload.skip_auto_bricked).toBe(true);
    expect(payload.skip_auto_gis).toBe(true);
  });

  it("carries mapped import financials into source metadata", () => {
    const mapping = {
      owner_name: "Owner",
      property_address: "Address",
      county: "County",
      phone: "Phone",
      purchase_amount: "Purchase Amt",
      purchase_date: "Purchase Date",
      amount_due: "Tax Delinquent $",
      annual_taxes: "Taxes / Yr",
      estimated_tax_rate: "Est Tax %",
      equity_amount: "Est Equity $",
      owner_occupied_flag: "Owner Occ?",
      mail_vacant_flag: "Mail Vacant?",
      pre_probate_flag: "Pre-Probate?",
    } as const;

    const record = normalizeImportedRow({
      row: {
        Owner: "John Seller",
        Address: "456 Oak Ave",
        County: "Spokane",
        Phone: "(509) 555-1212",
        "Purchase Amt": "180000",
        "Purchase Date": "2021-05-01",
        "Tax Delinquent $": "2500",
        "Taxes / Yr": "3200",
        "Est Tax %": "1.1",
        "Est Equity $": "140000",
        "Owner Occ?": "0",
        "Mail Vacant?": "1",
        "Pre-Probate?": "1",
      },
      rowNumber: 2,
      mapping,
      defaults: DEFAULTS,
    });

    const payload = buildProspectPayload(record, DEFAULTS);

    expect(payload.source_metadata.mapped_import_data).toEqual({
      purchase_amount: "180000",
      purchase_date: "2021-05-01",
      annual_taxes: "3200",
      estimated_tax_rate: "1.1",
      estimated_equity_amount: "140000",
      owner_occupied_flag: "0",
      mail_vacant_flag: "1",
      pre_probate_flag: "1",
    });
  });
});
