import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
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
  const lane = recommendTinaFilingLane(draft.profile);

  if (lane.laneId !== "schedule_c_single_member_llc" || lane.support !== "supported") {
    return {
      ...createDefaultTinaScheduleCDraft(),
      lastRunAt: now,
      summary: "Tina only builds this first return draft for the supported Schedule C lane.",
      nextStep: "Finish intake first or wait for Tina's future filing lanes.",
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
  const otherExpenseLines = draft.reviewerFinal.lines.filter(
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

  const otherExpensesStatus: TinaWorkpaperLineStatus =
    otherExpenseLines.length > 0
      ? strongestStatus(otherExpenseLines.map((line) => line.status))
      : "waiting";

  const grossReceiptsAmount = sumAmounts(grossReceiptsLines);
  const cogsAmount = inventoryLines.length > 0 ? null : 0;
  const wagesAmount = payrollLines.length > 0 ? sumAmounts(payrollLines) : 0;
  const contractLaborAmount = contractorLines.length > 0 ? sumAmounts(contractorLines) : 0;
  const otherExpensesAmount = otherExpenseLines.length > 0 ? sumAmounts(otherExpenseLines) : 0;

  const totalExpensesStatuses = [wagesStatus, contractLaborStatus, otherExpensesStatus];
  const totalExpensesStatus = strongestStatus(totalExpensesStatuses);
  const totalExpensesAmount = wagesAmount + contractLaborAmount + otherExpensesAmount;

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
        otherExpenseLines.length > 0
          ? "Tina mapped approved generic business expenses into the other-expenses box."
          : "Tina does not have approved other-expense lines here yet, so this is only the approved-so-far total.",
      lines: otherExpenseLines,
    }),
    buildField({
      id: "line-28-total-expenses",
      lineNumber: "Line 28",
      label: "Total expenses",
      amount: totalExpensesAmount,
      status: totalExpensesStatus,
      summary:
        totalExpensesStatus === "ready"
          ? "Tina totaled the approved expense boxes she can support so far."
          : "This total only reflects the approved expense boxes Tina can support so far.",
      lines: [...payrollLines, ...contractorLines, ...otherExpenseLines],
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
        ...payrollLines,
        ...contractorLines,
        ...otherExpenseLines,
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
        ...payrollLines,
        ...contractorLines,
        ...otherExpenseLines,
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
