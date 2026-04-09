import { describe, expect, it } from "vitest";
import {
  buildTinaScenarioCohortTrustMap,
  buildTinaScheduleCScenarioProfile,
} from "@/tina/lib/schedule-c-scenario-profile";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

describe("buildTinaScheduleCScenarioProfile", () => {
  it("collects specialized scenario families from source facts and transaction groups", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "payroll-1",
          sourceDocumentId: "doc-1",
          label: "Payroll filing period clue",
          value: "Q1 2025",
          confidence: "high",
          capturedAt: "2026-04-08T08:00:00.000Z",
        },
        {
          id: "owner-1",
          sourceDocumentId: "doc-1",
          label: "Owner draw clue",
          value: "Owner distributions posted in ledger.",
          confidence: "high",
          capturedAt: "2026-04-08T08:00:00.000Z",
        },
        {
          id: "group-1",
          sourceDocumentId: "doc-1",
          label: "Transaction group clue",
          value:
            "Sales tax payable (outflow): 2 rows, total ($800.00), dates Jan 1, 2025 to Jan 31, 2025",
          confidence: "medium",
          capturedAt: "2026-04-08T08:00:00.000Z",
        },
      ],
    });

    const profile = buildTinaScheduleCScenarioProfile(draft);

    expect(profile.tags).toEqual(expect.arrayContaining(["payroll", "owner_flow", "sales_tax"]));
    expect(profile.signals.some((signal) => signal.tag === "payroll")).toBe(true);
    expect(profile.signals.some((signal) => signal.tag === "owner_flow")).toBe(true);
    expect(profile.summary).toContain("active Schedule C scenario");
  });
});

describe("buildTinaScenarioCohortTrustMap", () => {
  it("marks fragile scenario cohorts when reviewer outcomes keep getting revised or rejected", () => {
    const draft = buildDraft({
      reviewerOutcomeMemory: {
        ...createDefaultTinaWorkspaceDraft().reviewerOutcomeMemory,
        outcomes: [
          {
            id: "outcome-1",
            title: "Payroll package revised",
            phase: "package",
            verdict: "revised",
            targetType: "schedule_c_field",
            targetId: "line-26-wages",
            summary: "Needed more payroll support.",
            lessons: ["Keep payroll support explicit."],
            caseTags: ["schedule_c", "payroll"],
            overrideIds: [],
            decidedAt: "2026-04-08T08:00:00.000Z",
            decidedBy: "CPA",
          },
          {
            id: "outcome-2",
            title: "Payroll package rejected",
            phase: "package",
            verdict: "rejected",
            targetType: "schedule_c_field",
            targetId: "line-26-wages",
            summary: "Rejected.",
            lessons: ["Do not flatten payroll into other expenses."],
            caseTags: ["schedule_c", "payroll"],
            overrideIds: [],
            decidedAt: "2026-04-08T08:05:00.000Z",
            decidedBy: "CPA",
          },
        ],
      },
    });

    const trustMap = buildTinaScenarioCohortTrustMap(draft);

    expect(trustMap.get("payroll")).toBe("fragile");
    expect(trustMap.get("inventory")).toBe("insufficient_history");
  });
});
