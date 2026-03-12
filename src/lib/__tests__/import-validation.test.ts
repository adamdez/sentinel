import { describe, it, expect } from "vitest";
import {
  detectHeaderRow,
  inferFieldMappings,
  normalizeImportedRow,
  scoreTemplateMatch,
  buildTemplateSignature,
  type NormalizationDefaults,
} from "@/lib/import-normalization";

// Helper: build minimal defaults for normalizeImportedRow
function makeDefaults(overrides?: Partial<NormalizationDefaults>): NormalizationDefaults {
  return {
    sourceChannel: "csv_import",
    sourceVendor: "test",
    sourceListName: "test_list",
    sourcePullDate: "2026-03-01",
    county: "",
    nicheTag: "",
    importBatchId: "batch_test",
    outreachType: "cold_call",
    skipTraceStatus: "not_started",
    templateName: "",
    templateId: "",
    ...overrides,
  };
}

describe("Import validation", () => {
  // ── detectHeaderRow ──
  describe("detectHeaderRow", () => {
    it("finds the row with field-like headers", () => {
      const rows = [
        ["Some junk title row", "", ""],
        ["", "", ""],
        ["Owner Name", "Property Address", "Phone", "Email", "County"],
        ["John Doe", "123 Main St", "5091234567", "john@test.com", "Spokane"],
      ];
      const idx = detectHeaderRow(rows);
      expect(idx).toBe(2);
    });

    it("returns 0 when all rows look similar", () => {
      const rows = [
        ["A", "B", "C"],
        ["D", "E", "F"],
      ];
      const idx = detectHeaderRow(rows);
      expect(idx).toBeGreaterThanOrEqual(0);
    });
  });

  // ── inferFieldMappings ──
  describe("inferFieldMappings", () => {
    it("maps 'Owner Name' to owner_name with high confidence", () => {
      const headers = ["Owner Name", "Property Address", "Phone"];
      const sampleRows = [
        { "Owner Name": "Jane Smith", "Property Address": "456 Oak Ave", Phone: "5099876543" },
      ];
      const result = inferFieldMappings(headers, sampleRows);
      expect(result.mapped.owner_name).toBe("Owner Name");
    });

    it("maps 'Property Address' to property_address", () => {
      const headers = ["Property Address", "City", "State"];
      const sampleRows = [
        { "Property Address": "789 Elm St", City: "Spokane", State: "WA" },
      ];
      const result = inferFieldMappings(headers, sampleRows);
      expect(result.mapped.property_address).toBe("Property Address");
    });

    it("maps phone-like headers to phone field", () => {
      const headers = ["Owner Name", "Phone", "Email"];
      const sampleRows = [
        { "Owner Name": "Test", Phone: "5091234567", Email: "test@test.com" },
      ];
      const result = inferFieldMappings(headers, sampleRows);
      expect(result.mapped.phone).toBe("Phone");
    });
  });

  // ── normalizeImportedRow ──
  describe("normalizeImportedRow", () => {
    const baseMapping = {
      property_address: "Property Address" as const,
      owner_name: "Owner Name" as const,
      phone: "Phone" as const,
      email: "Email" as const,
      county: "County" as const,
    } as Record<string, string>;

    it("flags missing property address as 'missing_property_address'", () => {
      const result = normalizeImportedRow({
        row: {
          "Owner Name": "John Doe",
          "Property Address": "",
          Phone: "5091234567",
          Email: "john@test.com",
          County: "Spokane",
        },
        rowNumber: 1,
        mapping: baseMapping as any,
        defaults: makeDefaults(),
      });
      expect(result.reviewStatus).toBe("missing_property_address");
    });

    it("marks complete row as 'ready_to_call'", () => {
      const result = normalizeImportedRow({
        row: {
          "Owner Name": "Jane Smith",
          "Property Address": "123 Main St",
          Phone: "5091234567",
          Email: "jane@test.com",
          County: "Spokane",
        },
        rowNumber: 1,
        mapping: baseMapping as any,
        defaults: makeDefaults(),
      });
      expect(result.reviewStatus).toBe("ready_to_call");
    });

    it("flags row with DNC flag as 'do_not_call'", () => {
      const mappingWithDnc = { ...baseMapping, do_not_call_flag: "DNC" };
      const result = normalizeImportedRow({
        row: {
          "Owner Name": "Bob DNC",
          "Property Address": "456 Oak Ave",
          Phone: "5091234567",
          Email: "bob@test.com",
          County: "Spokane",
          DNC: "true",
        },
        rowNumber: 1,
        mapping: mappingWithDnc as any,
        defaults: makeDefaults(),
      });
      expect(result.reviewStatus).toBe("do_not_call");
    });

    it("flags row without phone as 'missing_phone'", () => {
      const result = normalizeImportedRow({
        row: {
          "Owner Name": "No Phone Person",
          "Property Address": "789 Elm St",
          Phone: "",
          Email: "test@test.com",
          County: "Spokane",
        },
        rowNumber: 1,
        mapping: baseMapping as any,
        defaults: makeDefaults(),
      });
      expect(result.reviewStatus).toBe("missing_phone");
    });
  });

  // ── Phone cleaning ──
  describe("Phone cleaning", () => {
    const mapping = { property_address: "Address", phone: "Phone" } as Record<string, string>;

    it("keeps clean 10-digit phone", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Phone: "5091234567" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.phone).toBe("5091234567");
    });

    it("strips formatting: (509) 123-4567 → 5091234567", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Phone: "(509) 123-4567" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.phone).toBe("5091234567");
    });

    it("strips leading 1: 15091234567 → 5091234567", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Phone: "15091234567" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.phone).toBe("5091234567");
    });

    it("returns null for too-short phone", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Phone: "123" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.phone).toBeNull();
    });
  });

  // ── Email cleaning ──
  describe("Email cleaning", () => {
    const mapping = { property_address: "Address", email: "Email" } as Record<string, string>;

    it("lowercases email", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Email: "TEST@EXAMPLE.COM" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.email).toBe("test@example.com");
    });

    it("returns null for invalid email", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Email: "notanemail" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.email).toBeNull();
    });
  });

  // ── Boolean coercion (via DNC flag) ──
  describe("Boolean coercion", () => {
    const mapping = {
      property_address: "Address",
      phone: "Phone",
      do_not_call_flag: "DNC",
    } as Record<string, string>;

    it.each(["yes", "1", "true", "Y", "x", "checked"])("treats '%s' as truthy DNC", (val) => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Phone: "5091234567", DNC: val },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.reviewStatus).toBe("do_not_call");
    });
  });

  // ── Distress text detection ──
  describe("Distress text detection", () => {
    const mapping = {
      property_address: "Address",
      phone: "Phone",
      distress_text: "Notes",
    } as Record<string, string>;

    it("detects probate tag from 'probate estate'", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Phone: "5091234567", Notes: "probate estate" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.distressTags).toContain("probate");
    });

    it("detects tax_delinquent tag", () => {
      const result = normalizeImportedRow({
        row: { Address: "456 Oak Ave", Phone: "5091234567", Notes: "tax delinquent" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.distressTags).toContain("tax_delinquent");
    });

    it("detects vacant tag", () => {
      const result = normalizeImportedRow({
        row: { Address: "789 Elm St", Phone: "5091234567", Notes: "vacant lot" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.distressTags).toContain("vacant");
    });

    it("detects inherited tag", () => {
      const result = normalizeImportedRow({
        row: { Address: "101 Pine St", Phone: "5091234567", Notes: "inherited property" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.distressTags).toContain("inherited");
    });
  });

  // ── County normalization ──
  describe("County normalization", () => {
    const mapping = {
      property_address: "Address",
      phone: "Phone",
      county: "County",
    } as Record<string, string>;

    it("normalizes 'Spokane County' to 'spokane'", () => {
      const result = normalizeImportedRow({
        row: { Address: "123 Main St", Phone: "5091234567", County: "Spokane County" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.county).toBe("spokane");
    });

    it("normalizes 'Kootenai County' to 'kootenai'", () => {
      const result = normalizeImportedRow({
        row: { Address: "456 Oak Ave", Phone: "5091234567", County: "Kootenai County" },
        rowNumber: 1,
        mapping: mapping as any,
        defaults: makeDefaults(),
      });
      expect(result.county).toBe("kootenai");
    });
  });

  // ── Template matching ──
  describe("Template matching", () => {
    it("buildTemplateSignature is deterministic", () => {
      const headers = ["Owner Name", "Property Address", "Phone", "County"];
      const sig1 = buildTemplateSignature(headers, "Sheet1");
      const sig2 = buildTemplateSignature(headers, "Sheet1");
      expect(sig1).toBe(sig2);
    });

    it("scoreTemplateMatch returns high score for exact match", () => {
      const headers = ["Owner Name", "Property Address", "Phone", "County"];
      const signature = buildTemplateSignature(headers, "Sheet1");
      const template = {
        headerSignature: signature,
        sheetName: "Sheet1",
      };
      const score = scoreTemplateMatch(headers, "Sheet1", template);
      expect(score).toBeGreaterThanOrEqual(0.9);
    });

    it("scoreTemplateMatch returns low score for unrelated headers", () => {
      const headers = ["Owner Name", "Property Address", "Phone"];
      const template = {
        headerSignature: buildTemplateSignature(["Foo", "Bar", "Baz"], "Sheet1"),
        sheetName: "Sheet1",
      };
      const score = scoreTemplateMatch(headers, "Sheet1", template);
      expect(score).toBeLessThan(0.5);
    });
  });
});
