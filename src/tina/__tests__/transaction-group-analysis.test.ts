import { describe, expect, it } from "vitest";
import {
  analyzeTinaTransactionGroupValue,
  measureTinaTransactionGroupAlignment,
} from "@/tina/lib/transaction-group-analysis";

describe("analyzeTinaTransactionGroupValue", () => {
  it("parses direction, classification, totals, and dates from transaction group clues", () => {
    const parsed = analyzeTinaTransactionGroupValue(
      "Payroll register (outflow): 3 rows, total ($3,000.00), dates Jan 1, 2025 to Jan 31, 2025"
    );

    expect(parsed.label).toBe("Payroll register (outflow)");
    expect(parsed.direction).toBe("outflow");
    expect(parsed.classification).toBe("payroll");
    expect(parsed.rowCount).toBe(3);
    expect(parsed.total).toBe(-3000);
    expect(parsed.startDate).toBe("2025-01-01");
    expect(parsed.endDate).toBe("2025-01-31");
  });
});

describe("measureTinaTransactionGroupAlignment", () => {
  it("returns mismatch when relevant transaction groups do not align with the field amount", () => {
    const alignment = measureTinaTransactionGroupAlignment({
      groups: [
        {
          factId: "fact-1",
          sourceDocumentId: "doc-1",
          rawValue:
            "Client deposit (inflow): 2 rows, total $12,000, dates Jan 1, 2025 to Jan 30, 2025",
          label: "Client deposit (inflow)",
          direction: "inflow",
          classification: "gross_receipts",
          rowCount: 2,
          total: 12000,
          startDate: "2025-01-01",
          endDate: "2025-01-30",
        },
      ],
      amount: 18000,
      fieldLabel: "Gross receipts or sales",
    });

    expect(alignment).toBe("mismatch");
  });
});
