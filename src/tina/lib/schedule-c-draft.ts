import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaScheduleCDraftField,
  TinaScheduleCDraftNote,
  TinaScheduleCDraftSnapshot,
  TinaWorkpaperLine,
  TinaWorkpaperLineStatus,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaScheduleCDraftSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the first Schedule C draft yet.",
    nextStep: "Build the return-facing review layer first, then let Tina map the safe parts into a small Schedule C draft.",
    fields: [],
    notes: [],
  };
}

export function createDefaultTinaScheduleCDraft(): TinaScheduleCDraftSnapshot {
  return createEmptySnapshot();
}

export function markTinaScheduleCDraftStale(
  snapshot: TinaScheduleCDraftSnapshot
): TinaScheduleCDraftSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Your reviewer-final lines or business setup changed, so Tina should rebuild the Schedule C draft.",
    nextStep:
      "Build the Schedule C draft again so Tina does not lean on old return numbers.",
  };
}

function sumAmounts(lines: TinaWorkpaperLine[]): number {
  return lines.reduce((total, line) => total + (line.amount ?? 0), 0);
}

function collectTaxAdjustmentIds(lines: TinaWorkpaperLine[]): string[] {
  return Array.from(
    new Set(lines.flatMap((line) => line.taxAdjustmentIds ?? []).filter(Boolean))
  );
}

function collectSourceDocumentIds(lines: TinaWorkpaperLine[]): string[] {
  return Array.from(new Set(lines.flatMap((line) => line.sourceDocumentIds)));
}

function buildField(args: {
  id: string;
  lineNumber: string;
  label: string;
  amount: number | null;
  status: TinaWorkpaperLineStatus;
  summary: string;
  lines: TinaWorkpaperLine[];
}): TinaScheduleCDraftField {
  return {
    id: args.id,
    lineNumber: args.lineNumber,
    label: args.label,
    amount: args.amount,
    status: args.status,
    summary: args.summary,
    reviewerFinalLineIds: args.lines.map((line) => line.id),
    taxAdjustmentIds: collectTaxAdjustmentIds(args.lines),
    sourceDocumentIds: collectSourceDocumentIds(args.lines),
  };
}

function buildNote(args: {
  id: string;
  title: string;
  summary: string;
  severity: "needs_attention" | "watch";
  lines: TinaWorkpaperLine[];
}): TinaScheduleCDraftNote {
  return {
    id: args.id,
    title: args.title,
    summary: args.summary,
    severity: args.severity,
    reviewerFinalLineIds: args.lines.map((line) => line.id),
    taxAdjustmentIds: collectTaxAdjustmentIds(args.lines),
    sourceDocumentIds: collectSourceDocumentIds(args.lines),
  };
}

function strongestStatus(statuses: TinaWorkpaperLineStatus[]): TinaWorkpaperLineStatus {
  if (statuses.includes("needs_attention")) return "needs_attention";
  if (statuses.includes("waiting")) return "waiting";
  return "ready";
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function lineIncludes(line: TinaWorkpaperLine, needles: string[]): boolean {
  const normalized = normalizeLabel(`${line.label} ${line.summary}`);
  return needles.some((needle) => normalized.includes(normalizeLabel(needle)));
}

function partitionExpenseLines(lines: TinaWorkpaperLine[]) {
  const advertisingLines = lines.filter((line) => lineIncludes(line, ["advertising"]));
  const depreciationLines = lines.filter((line) =>
    lineIncludes(line, ["depreciation", "section 179", "bonus depreciation"])
  );
  const officeExpenseLines = lines.filter((line) =>
    lineIncludes(line, ["office expense", "postage"])
  );
  const rentLeaseLines = lines.filter((line) => lineIncludes(line, ["rent", "lease"]));
  const suppliesLines = lines.filter((line) => lineIncludes(line, ["supplies"]));
  const taxesAndLicensesLines = lines.filter((line) =>
    lineIncludes(line, ["taxes and licenses", "licenses", "license fee", "business taxes"])
  );
  const travelLines = lines.filter(
    (line) => lineIncludes(line, ["travel"]) && !lineIncludes(line, ["meal"])
  );
  const mealsLines = lines.filter((line) => lineIncludes(line, ["meal", "meals"]));

  const consumedIds = new Set(
    [
      ...advertisingLines,
      ...depreciationLines,
      ...officeExpenseLines,
      ...rentLeaseLines,
      ...suppliesLines,
      ...taxesAndLicensesLines,
      ...travelLines,
      ...mealsLines,
    ].map((line) => line.id)
  );

  return {
    advertisingLines,
    depreciationLines,
    officeExpenseLines,
    rentLeaseLines,
    suppliesLines,
    taxesAndLicensesLines,
    travelLines,
    mealsLines,
    uncategorizedOtherExpenseLines: lines.filter((line) => !consumedIds.has(line.id)),
  };
}

function buildLineSummary(args: {
  hasLines: boolean;
  fallbackIfMissing: string;
  readyText: string;
  needsAttentionText?: string;
  status: TinaWorkpaperLineStatus;
}): string {
  if (!args.hasLines) return args.fallbackIfMissing;
  if (args.status === "needs_attention" && args.needsAttentionText) return args.needsAttentionText;
  if (args.status === "waiting") return args.fallbackIfMissing;
  return args.readyText;
}

export function buildTinaScheduleCDraft(
  draft: TinaWorkspaceDraft
): TinaScheduleCDraftSnapshot {
  const now = new Date().toISOString();
  const startPath = buildTinaStartPathAssessment(draft);

  if (
    startPath.recommendation.laneId !== "schedule_c_single_member_llc" ||
    startPath.route !== "supported"
  ) {
    return {
      ...createDefaultTinaScheduleCDraft(),
      lastRunAt: now,
      summary:
        startPath.recommendation.laneId === "schedule_c_single_member_llc"
          ? "Tina sees a possible Schedule C path, but she is not building the return draft until the start path is truly supported."
          : "Tina only builds this first return draft for the supported Schedule C lane.",
      nextStep:
        startPath.route === "blocked"
          ? "Resolve the blocked start path before Tina tries to build any supported Schedule C draft."
          : "Finish intake first or wait for Tina's future filing lanes.",
    };
  }

  if (draft.reviewerFinal.status !== "complete") {
    return {
      ...createDefaultTinaScheduleCDraft(),
      lastRunAt: now,
      status: draft.reviewerFinal.status === "stale" ? "stale" : "idle",
      summary: "Tina needs the return-facing review layer before she can build a Schedule C draft.",
      nextStep: "Build the return-facing review layer first.",
    };
  }

  if (draft.reviewerFinal.lines.length === 0) {
    return {
      ...createDefaultTinaScheduleCDraft(),
      lastRunAt: now,
      summary: "Tina does not have any return-facing lines to map into Schedule C yet.",
      nextStep: "Approve tax adjustments and carry them into the return-facing review layer first.",
    };
  }

  const grossReceiptsLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Gross receipts candidate"
  );
  const payrollLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Payroll expense candidate"
  );
  const contractorLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Contract labor candidate"
  );
  const genericExpenseLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Business expense candidate"
  );
  const inventoryLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Inventory or COGS review"
  );
  const salesTaxLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Sales tax should stay out of income"
  );
  const timingLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Timing check before return"
  );
  const multistateLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "State scope review"
  );
  const netCrossCheckLines = draft.reviewerFinal.lines.filter(
    (line) => line.label === "Net business result candidate"
  );
  const {
    advertisingLines,
    depreciationLines,
    officeExpenseLines,
    rentLeaseLines,
    suppliesLines,
    taxesAndLicensesLines,
    travelLines,
    mealsLines,
    uncategorizedOtherExpenseLines,
  } = partitionExpenseLines(genericExpenseLines);

  const grossReceiptsStatus: TinaWorkpaperLineStatus =
    salesTaxLines.length > 0
      ? "needs_attention"
      : grossReceiptsLines.length > 0
        ? strongestStatus(grossReceiptsLines.map((line) => line.status))
        : "waiting";

  const cogsStatus: TinaWorkpaperLineStatus =
    inventoryLines.length > 0 ? "needs_attention" : draft.profile.hasInventory ? "waiting" : "ready";

  const wagesStatus: TinaWorkpaperLineStatus =
    payrollLines.length > 0
      ? strongestStatus(payrollLines.map((line) => line.status))
      : draft.profile.hasPayroll
        ? "waiting"
        : "ready";

  const contractLaborStatus: TinaWorkpaperLineStatus =
    contractorLines.length > 0
      ? strongestStatus(contractorLines.map((line) => line.status))
      : draft.profile.paysContractors
        ? "waiting"
        : "ready";

  const advertisingStatus: TinaWorkpaperLineStatus =
    advertisingLines.length > 0 ? strongestStatus(advertisingLines.map((line) => line.status)) : "ready";
  const depreciationStatus: TinaWorkpaperLineStatus =
    depreciationLines.length > 0 ? strongestStatus(depreciationLines.map((line) => line.status)) : "ready";
  const officeExpenseStatus: TinaWorkpaperLineStatus =
    officeExpenseLines.length > 0 ? strongestStatus(officeExpenseLines.map((line) => line.status)) : "ready";
  const rentLeaseStatus: TinaWorkpaperLineStatus =
    rentLeaseLines.length > 0 ? strongestStatus(rentLeaseLines.map((line) => line.status)) : "ready";
  const suppliesStatus: TinaWorkpaperLineStatus =
    suppliesLines.length > 0 ? strongestStatus(suppliesLines.map((line) => line.status)) : "ready";
  const taxesAndLicensesStatus: TinaWorkpaperLineStatus =
    taxesAndLicensesLines.length > 0
      ? strongestStatus(taxesAndLicensesLines.map((line) => line.status))
      : "ready";
  const travelStatus: TinaWorkpaperLineStatus =
    travelLines.length > 0 ? strongestStatus(travelLines.map((line) => line.status)) : "ready";
  const mealsStatus: TinaWorkpaperLineStatus =
    mealsLines.length > 0 ? strongestStatus(mealsLines.map((line) => line.status)) : "ready";
  const otherExpensesStatus: TinaWorkpaperLineStatus =
    uncategorizedOtherExpenseLines.length > 0
      ? strongestStatus(uncategorizedOtherExpenseLines.map((line) => line.status))
      : "ready";

  const grossReceiptsAmount = sumAmounts(grossReceiptsLines);
  const cogsAmount = inventoryLines.length > 0 ? null : 0;
  const wagesAmount = payrollLines.length > 0 ? sumAmounts(payrollLines) : 0;
  const contractLaborAmount = contractorLines.length > 0 ? sumAmounts(contractorLines) : 0;
  const advertisingAmount = advertisingLines.length > 0 ? sumAmounts(advertisingLines) : 0;
  const depreciationAmount = depreciationLines.length > 0 ? sumAmounts(depreciationLines) : 0;
  const officeExpenseAmount = officeExpenseLines.length > 0 ? sumAmounts(officeExpenseLines) : 0;
  const rentLeaseAmount = rentLeaseLines.length > 0 ? sumAmounts(rentLeaseLines) : 0;
  const suppliesAmount = suppliesLines.length > 0 ? sumAmounts(suppliesLines) : 0;
  const taxesAndLicensesAmount =
    taxesAndLicensesLines.length > 0 ? sumAmounts(taxesAndLicensesLines) : 0;
  const travelAmount = travelLines.length > 0 ? sumAmounts(travelLines) : 0;
  const mealsAmount = mealsLines.length > 0 ? sumAmounts(mealsLines) : 0;
  const otherExpensesAmount =
    uncategorizedOtherExpenseLines.length > 0 ? sumAmounts(uncategorizedOtherExpenseLines) : 0;

  const totalExpensesStatuses = [
    advertisingStatus,
    contractLaborStatus,
    depreciationStatus,
    officeExpenseStatus,
    rentLeaseStatus,
    suppliesStatus,
    taxesAndLicensesStatus,
    travelStatus,
    mealsStatus,
    wagesStatus,
    otherExpensesStatus,
  ];
  const totalExpensesStatus = strongestStatus(totalExpensesStatuses);
  const totalExpensesAmount =
    advertisingAmount +
    contractLaborAmount +
    depreciationAmount +
    officeExpenseAmount +
    rentLeaseAmount +
    suppliesAmount +
    taxesAndLicensesAmount +
    travelAmount +
    mealsAmount +
    wagesAmount +
    otherExpensesAmount;

  const grossIncomeAmount =
    cogsAmount === null ? grossReceiptsAmount : grossReceiptsAmount - cogsAmount;
  const grossIncomeStatus = strongestStatus([grossReceiptsStatus, cogsStatus]);
  const tentativeNetStatus = strongestStatus([grossIncomeStatus, totalExpensesStatus]);
  const tentativeNetAmount =
    grossIncomeAmount !== null ? grossIncomeAmount - totalExpensesAmount : null;

  const fields: TinaScheduleCDraftField[] = [
    buildField({
      id: "line-1-gross-receipts",
      lineNumber: "Line 1",
      label: "Gross receipts or sales",
      amount: grossReceiptsAmount,
      status: grossReceiptsStatus,
      summary: buildLineSummary({
        hasLines: grossReceiptsLines.length > 0,
        fallbackIfMissing: "Tina does not have approved gross receipts lines here yet.",
        readyText: "Tina mapped approved income lines into the first gross receipts box.",
        needsAttentionText:
          "Tina mapped income here, but a sales-tax review note still needs a human before line 1 is trusted.",
        status: grossReceiptsStatus,
      }),
      lines: [...grossReceiptsLines, ...salesTaxLines],
    }),
    buildField({
      id: "line-4-cogs",
      lineNumber: "Line 4",
      label: "Cost of goods sold",
      amount: cogsAmount,
      status: cogsStatus,
      summary:
        inventoryLines.length > 0
          ? "Inventory still needs careful review, so Tina is not forcing a COGS number yet."
          : draft.profile.hasInventory
            ? "Inventory is turned on, but Tina does not have an approved COGS line yet."
            : "Tina is carrying 0 here for now because inventory is not turned on in the organizer.",
      lines: inventoryLines,
    }),
    buildField({
      id: "line-8-advertising",
      lineNumber: "Line 8",
      label: "Advertising",
      amount: advertisingAmount,
      status: advertisingStatus,
      summary:
        advertisingLines.length > 0
          ? "Tina mapped approved advertising lines into the advertising box."
          : "Tina is carrying 0 here because she does not currently see approved advertising lines.",
      lines: advertisingLines,
    }),
    buildField({
      id: "line-11-contract-labor",
      lineNumber: "Line 11",
      label: "Contract labor",
      amount: contractLaborAmount,
      status: contractLaborStatus,
      summary:
        contractorLines.length > 0
          ? "Tina mapped approved contractor lines into the contract labor box."
          : draft.profile.paysContractors
            ? "Contractors are turned on, but Tina does not have an approved contract labor line here yet."
            : "Tina is carrying 0 here because contractors are not turned on in the organizer.",
      lines: contractorLines,
    }),
    buildField({
      id: "line-13-depreciation",
      lineNumber: "Line 13",
      label: "Depreciation and section 179",
      amount: depreciationAmount,
      status: depreciationStatus,
      summary:
        depreciationLines.length > 0
          ? "Tina mapped approved depreciation lines into the depreciation box."
          : "Tina is carrying 0 here because she does not currently see approved depreciation lines.",
      lines: depreciationLines,
    }),
    buildField({
      id: "line-18-office-expense",
      lineNumber: "Line 18",
      label: "Office expense",
      amount: officeExpenseAmount,
      status: officeExpenseStatus,
      summary:
        officeExpenseLines.length > 0
          ? "Tina mapped approved office-expense lines into the office-expense box."
          : "Tina is carrying 0 here because she does not currently see approved office-expense lines.",
      lines: officeExpenseLines,
    }),
    buildField({
      id: "line-20-rent-or-lease",
      lineNumber: "Line 20",
      label: "Rent or lease",
      amount: rentLeaseAmount,
      status: rentLeaseStatus,
      summary:
        rentLeaseLines.length > 0
          ? "Tina mapped approved rent or lease lines into the rent-or-lease box."
          : "Tina is carrying 0 here because she does not currently see approved rent or lease lines.",
      lines: rentLeaseLines,
    }),
    buildField({
      id: "line-22-supplies",
      lineNumber: "Line 22",
      label: "Supplies",
      amount: suppliesAmount,
      status: suppliesStatus,
      summary:
        suppliesLines.length > 0
          ? "Tina mapped approved supplies lines into the supplies box."
          : "Tina is carrying 0 here because she does not currently see approved supplies lines.",
      lines: suppliesLines,
    }),
    buildField({
      id: "line-23-taxes-and-licenses",
      lineNumber: "Line 23",
      label: "Taxes and licenses",
      amount: taxesAndLicensesAmount,
      status: taxesAndLicensesStatus,
      summary:
        taxesAndLicensesLines.length > 0
          ? "Tina mapped approved taxes-and-licenses lines into that expense box."
          : "Tina is carrying 0 here because she does not currently see approved taxes-and-licenses lines.",
      lines: taxesAndLicensesLines,
    }),
    buildField({
      id: "line-24a-travel",
      lineNumber: "Line 24a",
      label: "Travel",
      amount: travelAmount,
      status: travelStatus,
      summary:
        travelLines.length > 0
          ? "Tina mapped approved travel lines into the travel box."
          : "Tina is carrying 0 here because she does not currently see approved travel lines.",
      lines: travelLines,
    }),
    buildField({
      id: "line-24b-deductible-meals",
      lineNumber: "Line 24b",
      label: "Deductible meals",
      amount: mealsAmount,
      status: mealsStatus,
      summary:
        mealsLines.length > 0
          ? "Tina mapped approved meals lines into the deductible-meals box."
          : "Tina is carrying 0 here because she does not currently see approved meals lines.",
      lines: mealsLines,
    }),
    buildField({
      id: "line-26-wages",
      lineNumber: "Line 26",
      label: "Wages",
      amount: wagesAmount,
      status: wagesStatus,
      summary:
        payrollLines.length > 0
          ? "Tina mapped approved payroll lines into the wages box."
          : draft.profile.hasPayroll
            ? "Payroll is turned on, but Tina does not have an approved wages line here yet."
            : "Tina is carrying 0 here because payroll is not turned on in the organizer.",
      lines: payrollLines,
    }),
    buildField({
      id: "line-27a-other-expenses",
      lineNumber: "Line 27a",
      label: "Other expenses",
      amount: otherExpensesAmount,
      status: otherExpensesStatus,
      summary:
        uncategorizedOtherExpenseLines.length > 0
          ? "Tina mapped approved generic business expenses into the other-expenses box."
          : "Tina does not have approved other-expense lines here yet, so this is only the approved-so-far total.",
      lines: uncategorizedOtherExpenseLines,
    }),
    buildField({
      id: "line-28-total-expenses",
      lineNumber: "Line 28",
      label: "Total expenses",
      amount: totalExpensesAmount,
      status: totalExpensesStatus,
      summary:
        totalExpensesStatus === "ready"
          ? "Tina totaled the approved supported expense boxes she can map so far."
          : "This total only reflects the supported expense boxes Tina can map so far.",
      lines: [
        ...advertisingLines,
        ...contractorLines,
        ...depreciationLines,
        ...officeExpenseLines,
        ...rentLeaseLines,
        ...suppliesLines,
        ...taxesAndLicensesLines,
        ...travelLines,
        ...mealsLines,
        ...payrollLines,
        ...uncategorizedOtherExpenseLines,
      ],
    }),
    buildField({
      id: "line-29-tentative-profit",
      lineNumber: "Line 29",
      label: "Tentative profit or loss",
      amount: tentativeNetAmount,
      status: tentativeNetStatus,
      summary:
        tentativeNetStatus === "ready"
          ? "Tina computed this from the approved gross receipts and expense boxes above."
          : "This profit number is still only a draft because one or more upstream boxes need more care.",
      lines: [
        ...grossReceiptsLines,
        ...salesTaxLines,
        ...inventoryLines,
        ...advertisingLines,
        ...payrollLines,
        ...contractorLines,
        ...depreciationLines,
        ...officeExpenseLines,
        ...rentLeaseLines,
        ...suppliesLines,
        ...taxesAndLicensesLines,
        ...travelLines,
        ...mealsLines,
        ...uncategorizedOtherExpenseLines,
      ],
    }),
    buildField({
      id: "line-31-tentative-net",
      lineNumber: "Line 31",
      label: "Tentative net profit or loss",
      amount: tentativeNetAmount,
      status: tentativeNetStatus,
      summary:
        "Tina is carrying the same tentative amount here for now because later Schedule C adjustments are not built yet.",
      lines: [
        ...grossReceiptsLines,
        ...salesTaxLines,
        ...inventoryLines,
        ...advertisingLines,
        ...payrollLines,
        ...contractorLines,
        ...depreciationLines,
        ...officeExpenseLines,
        ...rentLeaseLines,
        ...suppliesLines,
        ...taxesAndLicensesLines,
        ...travelLines,
        ...mealsLines,
        ...uncategorizedOtherExpenseLines,
      ],
    }),
  ];

  const notes: TinaScheduleCDraftNote[] = [];

  if (salesTaxLines.length > 0) {
    notes.push(
      buildNote({
        id: "schedule-c-sales-tax-note",
        title: "Sales tax review is still separate",
        summary:
          "Tina is not subtracting approved sales-tax treatment from line 1 automatically yet. A human still needs to confirm that step.",
        severity: "needs_attention",
        lines: salesTaxLines,
      })
    );
  }

  if (inventoryLines.length > 0) {
    notes.push(
      buildNote({
        id: "schedule-c-inventory-note",
        title: "Inventory still needs COGS review",
        summary:
          "Tina kept inventory treatment out of the automatic Schedule C totals so a human can map it carefully first.",
        severity: "needs_attention",
        lines: inventoryLines,
      })
    );
  }

  if (timingLines.length > 0) {
    notes.push(
      buildNote({
        id: "schedule-c-timing-note",
        title: "Timing still needs a human look",
        summary:
          "One approved timing note is still visible here because year placement can change the return even after cleanup is done.",
        severity: "needs_attention",
        lines: timingLines,
      })
    );
  }

  if (multistateLines.length > 0) {
    notes.push(
      buildNote({
        id: "schedule-c-state-scope-note",
        title: "State scope is still under review",
        summary:
          "Tina built this first Schedule C draft, but a state-scope note is still open and could change the wider package.",
        severity: "watch",
        lines: multistateLines,
      })
    );
  }

  if (netCrossCheckLines.length > 0 && tentativeNetAmount !== null) {
    const crossCheckAmount = sumAmounts(netCrossCheckLines);
    if (Math.abs(crossCheckAmount - tentativeNetAmount) >= 1) {
      notes.push(
        buildNote({
          id: "schedule-c-net-cross-check",
          title: "Net cross-check does not match yet",
          summary:
            "Tina sees a net result line that does not match this draft total yet, so a human should compare the approved numbers before trusting the draft.",
          severity: "needs_attention",
          lines: netCrossCheckLines,
        })
      );
    }
  }

  const readyFieldCount = fields.filter((field) => field.status === "ready").length;
  let summary = `Tina built ${fields.length} Schedule C draft boxes and filled ${readyFieldCount} with numbers she can support so far.`;
  if (notes.length > 0) {
    summary += ` ${notes.length} review note${notes.length === 1 ? "" : "s"} still need a human look.`;
  }

  let nextStep =
    "Check the review notes first, then decide whether Tina's approved-so-far Schedule C boxes are ready to carry into the next return step.";
  if (notes.length === 0) {
    nextStep =
      "Tina has a simple Schedule C draft ready for the next build step, but it is still not the filing package.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    fields,
    notes,
  };
}
