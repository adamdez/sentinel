import { describe, expect, it } from "vitest";
import { getTinaOfficialFormTemplate } from "@/tina/lib/official-form-templates";

describe("getTinaOfficialFormTemplate", () => {
  it("returns the 2025 Schedule C template for the supported form", () => {
    const template = getTinaOfficialFormTemplate({
      formNumber: "Schedule C (Form 1040)",
      taxYear: "2025",
      revisionYear: "2025",
    });

    expect(template?.id).toBe("schedule-c-2025-template");
    expect(template?.fields.some((field) => field.fieldKey === "schedule_c.line_31.net_profit")).toBe(
      true
    );
    expect(template?.fields.find((field) => field.lineNumber === "Line 1")?.reference).toContain(
      "2025 Schedule C"
    );
  });
});
