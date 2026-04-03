import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaScheduleCFormCoverageItem,
  TinaScheduleCFormCoverageSnapshot,
  TinaSourceFact,
  TinaWorkspaceDraft,
} from "@/tina/types";

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findFactsByLabel(sourceFacts: TinaSourceFact[], label: string): TinaSourceFact[] {
  return sourceFacts.filter(
    (fact) => normalizeForComparison(fact.label) === normalizeForComparison(label)
  );
}

function hasKeyword(value: string, keywords: string[]): boolean {
  const normalized = normalizeForComparison(value);
  return keywords.some((keyword) => normalized.includes(normalizeForComparison(keyword)));
}

function buildItem(args: {
  id: string;
  title: string;
  status: TinaScheduleCFormCoverageItem["status"];
  summary: string;
  relatedLineNumbers?: string[];
}): TinaScheduleCFormCoverageItem {
  return {
    id: args.id,
    title: args.title,
    status: args.status,
    summary: args.summary,
    relatedLineNumbers: args.relatedLineNumbers ?? [],
  };
}

export function buildTinaScheduleCFormCoverage(
  draft: TinaWorkspaceDraft
): TinaScheduleCFormCoverageSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const inventoryFacts = findFactsByLabel(draft.sourceFacts, "Inventory clue");
  const depreciationFacts = findFactsByLabel(draft.sourceFacts, "Depreciation clue");
  const vehicleFacts = findFactsByLabel(draft.sourceFacts, "Vehicle clue");
  const homeOfficeFacts = findFactsByLabel(draft.sourceFacts, "Home office clue");
  const totalExpensesField =
    scheduleCReturn.fields.find((field) => field.formKey === "totalExpenses") ?? null;
  const otherExpensesField =
    scheduleCReturn.fields.find((field) => field.formKey === "otherExpenses") ?? null;
  const hasVehicleSignals =
    vehicleFacts.length > 0 || hasKeyword(draft.profile.notes, ["vehicle", "auto", "mileage"]);
  const hasHomeOfficeSignals =
    homeOfficeFacts.length > 0 || hasKeyword(draft.profile.notes, ["home office", "office in home"]);
  const supportedExpenseFieldKeys = [
    "advertising",
    "contractLabor",
    "depreciation",
    "officeExpense",
    "rentOrLease",
    "supplies",
    "taxesAndLicenses",
    "travel",
    "deductibleMeals",
    "wages",
  ];
  const supportedExpenseFields = scheduleCReturn.fields.filter((field) =>
    supportedExpenseFieldKeys.includes(field.formKey)
  );
  const supportedExpenseFieldsWithAmounts = supportedExpenseFields.filter(
    (field) => typeof field.amount === "number" && field.amount > 0
  );

  if (
    startPath.route !== "supported" ||
    startPath.recommendation.laneId !== "schedule_c_single_member_llc"
  ) {
    const blockedSummary =
      "Schedule C coverage is not applicable while Tina is routed away from the supported Schedule C lane.";
    return {
      lastBuiltAt: new Date().toISOString(),
      summary:
        "Tina is routed away from the supported Schedule C lane, so Schedule C coverage should be treated as blocked context only, not as real form support.",
      nextStep:
        startPath.route === "blocked"
          ? "Resolve the blocked filing path before using Schedule C coverage language."
          : "Keep the file in reviewer control until the supported Schedule C lane is truly confirmed.",
      items: [
        buildItem({
          id: "header-identity",
          title: "Header and business identity",
          status: "unsupported",
          summary: blockedSummary,
        }),
        buildItem({
          id: "part-i-income",
          title: "Part I income lines",
          status: "unsupported",
          summary: blockedSummary,
          relatedLineNumbers: ["Line 1", "Line 4", "Line 7"],
        }),
        buildItem({
          id: "part-ii-expenses-core",
          title: "Part II core expense lines",
          status: "unsupported",
          summary: blockedSummary,
          relatedLineNumbers: [
            "Line 8",
            "Line 11",
            "Line 13",
            "Line 18",
            "Line 20",
            "Line 22",
            "Line 23",
            "Line 24a",
            "Line 24b",
            "Line 26",
            "Line 27a",
            "Line 28",
            "Line 31",
          ],
        }),
        buildItem({
          id: "other-expenses-statement",
          title: "Other expenses statement support",
          status: "unsupported",
          summary: blockedSummary,
          relatedLineNumbers: ["Line 27a"],
        }),
        buildItem({
          id: "inventory-cogs-support",
          title: "Inventory and Part III COGS support",
          status: "unsupported",
          summary: blockedSummary,
          relatedLineNumbers: ["Line 4"],
        }),
        buildItem({
          id: "depreciation-and-4562",
          title: "Depreciation and Form 4562 support",
          status: "unsupported",
          summary: blockedSummary,
        }),
        buildItem({
          id: "vehicle-information",
          title: "Vehicle information support",
          status: "unsupported",
          summary: blockedSummary,
        }),
        buildItem({
          id: "home-office-support",
          title: "Home office support",
          status: "unsupported",
          summary: blockedSummary,
        }),
      ],
    };
  }

  const items: TinaScheduleCFormCoverageItem[] = [
    buildItem({
      id: "header-identity",
      title: "Header and business identity",
      status:
        scheduleCReturn.header.businessName &&
        scheduleCReturn.header.taxYear &&
        scheduleCReturn.header.principalBusinessActivity &&
        scheduleCReturn.header.naicsCode
          ? "covered"
          : "unsupported",
      summary:
        scheduleCReturn.header.businessName &&
        scheduleCReturn.header.taxYear &&
        scheduleCReturn.header.principalBusinessActivity &&
        scheduleCReturn.header.naicsCode
          ? "Tina has the core header identity fields needed for the current Schedule C output."
          : "Tina is still missing one or more core Schedule C header identity fields.",
    }),
    buildItem({
      id: "part-i-income",
      title: "Part I income lines",
      status: scheduleCReturn.validationIssues.some((issue) =>
        ["gross-income-cross-check", "missing-business-name", "missing-tax-year"].includes(issue.id)
      )
        ? "needs_review"
        : "covered",
      summary:
        "Tina covers the core supported income math for lines 1, 4, and 7 in the current Schedule C lane.",
      relatedLineNumbers: ["Line 1", "Line 4", "Line 7"],
    }),
    buildItem({
      id: "part-ii-expenses-core",
      title: "Part II core expense lines",
      status:
        typeof otherExpensesField?.amount === "number" && otherExpensesField.amount > 0
          ? "partial"
          : "covered",
      summary:
        typeof otherExpensesField?.amount === "number" && otherExpensesField.amount > 0
          ? "Tina covers a larger supported expense subset now, but uncategorized other expenses still keep Part II only partially covered."
          : supportedExpenseFieldsWithAmounts.length > 0
            ? "Tina covers the currently used supported Part II expense lines category by category for this Schedule C output."
            : "Tina covers the currently relevant core expense lines for this zero-expense supported Schedule C output.",
      relatedLineNumbers: [
        "Line 8",
        "Line 11",
        "Line 13",
        "Line 18",
        "Line 20",
        "Line 22",
        "Line 23",
        "Line 24a",
        "Line 24b",
        "Line 26",
        "Line 27a",
        "Line 28",
        "Line 31",
      ],
    }),
    buildItem({
      id: "other-expenses-statement",
      title: "Other expenses statement support",
      status:
        typeof otherExpensesField?.amount === "number" && otherExpensesField.amount > 0
          ? "needs_review"
          : "covered",
      summary:
        typeof otherExpensesField?.amount === "number" && otherExpensesField.amount > 0
          ? "Tina is carrying other expenses on line 27a, but detailed statement support still belongs in reviewer attention."
          : "Tina does not currently need a separate other-expenses statement for this output.",
      relatedLineNumbers: ["Line 27a"],
    }),
    buildItem({
      id: "inventory-cogs-support",
      title: "Inventory and Part III COGS support",
      status:
        draft.profile.hasInventory || inventoryFacts.length > 0 ? "unsupported" : "covered",
      summary:
        draft.profile.hasInventory || inventoryFacts.length > 0
          ? "Inventory or COGS signals exist, so Tina should not imply full Part III support yet."
          : "Tina does not currently see inventory facts that require Part III support.",
      relatedLineNumbers: ["Line 4"],
    }),
    buildItem({
      id: "depreciation-and-4562",
      title: "Depreciation and Form 4562 support",
      status:
        draft.profile.hasFixedAssets || depreciationFacts.length > 0 ? "unsupported" : "covered",
      summary:
        draft.profile.hasFixedAssets || depreciationFacts.length > 0
          ? "Fixed-asset or depreciation facts exist, so Tina should not imply full depreciation attachment support yet."
          : "Tina does not currently see depreciation facts that require Form 4562 support.",
    }),
    buildItem({
      id: "vehicle-information",
      title: "Vehicle information support",
      status: hasVehicleSignals ? "unsupported" : "covered",
      summary: hasVehicleSignals
        ? "Vehicle-use facts appear in the file, so Tina should not imply full vehicle-question support yet."
        : "Tina does not currently see vehicle-use facts that require Schedule C vehicle support.",
    }),
    buildItem({
      id: "home-office-support",
      title: "Home office support",
      status: hasHomeOfficeSignals ? "unsupported" : "covered",
      summary: hasHomeOfficeSignals
        ? "Home-office facts appear in the file, so Tina should not imply full home-office support yet."
        : "Tina does not currently see home-office facts that require a home-office calculation path.",
    }),
  ];

  const unsupportedCount = items.filter((item) => item.status === "unsupported").length;
  const reviewCount = items.filter(
    (item) => item.status === "needs_review" || item.status === "partial"
  ).length;

  return {
    lastBuiltAt: new Date().toISOString(),
    summary:
      unsupportedCount > 0
        ? `Tina sees ${unsupportedCount} unsupported Schedule C section${
            unsupportedCount === 1 ? "" : "s"
          } and ${reviewCount} section${reviewCount === 1 ? "" : "s"} that still need reviewer attention.`
        : reviewCount > 0
          ? `Tina covers the core supported Schedule C path, but ${reviewCount} section${
              reviewCount === 1 ? "" : "s"
            } still need reviewer attention.`
          : "Tina covers the currently relevant sections of the supported Schedule C path.",
    nextStep:
      unsupportedCount > 0
        ? "Do not market this output as full official-form support until the unsupported sections are explicitly handled or ruled out."
        : "Use the reviewer attention sections to decide whether this supported Schedule C output is final enough for signoff.",
    items,
  };
}
