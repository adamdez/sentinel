import { describe, expect, it } from "vitest";
import { selectTinaVisibleChecklist } from "@/tina/lib/next-asks";
import type { TinaChecklistItem } from "@/tina/types";

function item(overrides: Partial<TinaChecklistItem> & Pick<TinaChecklistItem, "id" | "label">): TinaChecklistItem {
  return {
    id: overrides.id,
    label: overrides.label,
    reason: overrides.reason ?? "reason",
    priority: overrides.priority ?? "required",
    action: overrides.action ?? "upload",
    kind: overrides.kind ?? "follow_up",
    source: overrides.source ?? "document_clue",
    actionLabel: overrides.actionLabel,
    focusLabel: overrides.focusLabel,
    status: overrides.status ?? "needed",
  };
}

describe("selectTinaVisibleChecklist", () => {
  it("keeps the original list when only a few asks are needed", () => {
    const result = selectTinaVisibleChecklist([
      item({ id: "prior-return", label: "Last year's return", kind: "baseline", source: "organizer" }),
      item({ id: "quickbooks", label: "QuickBooks", kind: "baseline", source: "organizer" }),
    ]);

    expect(result.map((entry) => entry.id)).toEqual(["prior-return", "quickbooks"]);
  });

  it("balances follow-up asks with a structural books fix", () => {
    const result = selectTinaVisibleChecklist([
      item({ id: "contractors", label: "Contractors" }),
      item({ id: "payroll", label: "Payroll" }),
      item({ id: "sales-tax", label: "Sales tax" }),
      item({
        id: "quickbooks",
        label: "Full-year QuickBooks export",
        kind: "replacement",
        source: "coverage_gap",
      }),
      item({
        id: "idaho-activity",
        label: "Whether you did any work in Idaho",
        action: "answer",
        priority: "recommended",
      }),
    ]);

    expect(result.map((entry) => entry.id)).toEqual([
      "contractors",
      "payroll",
      "quickbooks",
    ]);
  });

  it("can still surface an answer ask when there is room", () => {
    const result = selectTinaVisibleChecklist([
      item({ id: "contractors", label: "Contractors" }),
      item({
        id: "idaho-activity",
        label: "Whether you did any work in Idaho",
        action: "answer",
        priority: "recommended",
      }),
      item({
        id: "quickbooks",
        label: "Full-year QuickBooks export",
        kind: "replacement",
        source: "coverage_gap",
      }),
    ]);

    expect(result.map((entry) => entry.id)).toEqual([
      "contractors",
      "quickbooks",
      "idaho-activity",
    ]);
  });
});
