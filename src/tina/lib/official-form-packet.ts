import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { getTinaIrsAuthorityRegistryStatus } from "@/tina/lib/irs-authority-registry";
import { buildTinaOfficialFormCoverageGaps } from "@/tina/lib/official-form-coverage";
import type {
  TinaIrsAuthorityWatchStatus,
  TinaOfficialFormDraft,
  TinaOfficialFormLine,
  TinaOfficialFormLineState,
  TinaOfficialFormPacketSnapshot,
  TinaOfficialFormSupportRow,
  TinaOfficialFormSupportSchedule,
  TinaOfficialFormStatus,
  TinaScheduleCDraftField,
  TinaScheduleCDraftNote,
  TinaTaxAdjustment,
  TinaWorkpaperLine,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaOfficialFormPacketSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the official-form packet yet.",
    nextStep:
      "Build the Schedule C draft and package check first, then let Tina lay the numbers into a year-specific form packet.",
    forms: [],
  };
}

export function createDefaultTinaOfficialFormPacket(): TinaOfficialFormPacketSnapshot {
  return createEmptySnapshot();
}

export function markTinaOfficialFormPacketStale(
  snapshot: TinaOfficialFormPacketSnapshot
): TinaOfficialFormPacketSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Your draft boxes or filing-package state changed, so Tina should rebuild the official-form packet.",
    nextStep:
      "Build the official-form packet again so Tina does not lean on old paperwork lines.",
  };
}

function formatMoney(value: number | null): string {
  if (value === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function collectSourceDocumentIds(
  fields: TinaScheduleCDraftField[],
  notes: TinaScheduleCDraftNote[] = []
): string[] {
  return Array.from(
    new Set([
      ...fields.flatMap((field) => field.sourceDocumentIds),
      ...notes.flatMap((note) => note.sourceDocumentIds),
    ])
  );
}

function fieldState(field: TinaScheduleCDraftField | null): TinaOfficialFormLineState {
  if (!field || field.amount === null || field.status === "waiting") return "blank";
  if (field.status === "needs_attention") return "review";
  return "filled";
}

function derivedState(
  fields: TinaScheduleCDraftField[],
  notes: TinaScheduleCDraftNote[] = []
): TinaOfficialFormLineState {
  if (fields.some((field) => field.status === "needs_attention") || notes.length > 0) {
    return "review";
  }
  if (fields.some((field) => field.amount === null || field.status === "waiting")) {
    return "blank";
  }
  if (fields.length === 0) return "blank";
  return "filled";
}

function buildLine(args: {
  id: string;
  lineNumber: string;
  label: string;
  value: string;
  state: TinaOfficialFormLineState;
  summary: string;
  fields?: TinaScheduleCDraftField[];
  notes?: TinaScheduleCDraftNote[];
}): TinaOfficialFormLine {
  const fields = args.fields ?? [];
  const notes = args.notes ?? [];

  return {
    id: args.id,
    lineNumber: args.lineNumber,
    label: args.label,
    value: args.value,
    state: args.state,
    summary: args.summary,
    scheduleCDraftFieldIds: fields.map((field) => field.id),
    scheduleCDraftNoteIds: notes.map((note) => note.id),
    sourceDocumentIds: collectSourceDocumentIds(fields, notes),
  };
}

function findField(
  fields: TinaScheduleCDraftField[],
  id: string
): TinaScheduleCDraftField | null {
  return fields.find((field) => field.id === id) ?? null;
}

function findNotes(
  notes: TinaScheduleCDraftNote[],
  matcher: (note: TinaScheduleCDraftNote) => boolean
): TinaScheduleCDraftNote[] {
  return notes.filter(matcher);
}

function collectUniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatSupportRowLabel(label: string): string {
  return label
    .replace(/^carry\s+/i, "")
    .replace(/\s+into\s+tax\s+review$/i, "")
    .replace(/^check the timing for\s+/i, "Timing review: ")
    .replace(/^review\s+/i, "")
    .replace(/^keep\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function buildSupportRowLabel(
  line: TinaWorkpaperLine,
  adjustment: TinaTaxAdjustment | null
): string {
  const candidate = adjustment?.title || line.label;
  return formatSupportRowLabel(candidate || "Approved expense item");
}

function buildSupportRowSummary(
  line: TinaWorkpaperLine,
  adjustment: TinaTaxAdjustment | null
): string {
  if (adjustment?.suggestedTreatment) {
    return adjustment.suggestedTreatment;
  }

  return line.summary;
}

function buildOtherExpensesSupportSchedule(
  draft: TinaWorkspaceDraft,
  otherExpensesField: TinaScheduleCDraftField | null
): TinaOfficialFormSupportSchedule | null {
  if (!otherExpensesField || otherExpensesField.amount === null) return null;

  const reviewerLines = otherExpensesField.reviewerFinalLineIds
    .map((lineId) => draft.reviewerFinal.lines.find((line) => line.id === lineId))
    .filter((line): line is TinaWorkpaperLine => Boolean(line));

  const rows: TinaOfficialFormSupportRow[] =
    reviewerLines.length > 0
      ? reviewerLines.map((line, index) => {
          const adjustmentId = line.taxAdjustmentIds?.[0] ?? null;
          const adjustment =
            adjustmentId
              ? draft.taxAdjustments.adjustments.find(
                  (candidate) => candidate.id === adjustmentId
                ) ?? null
              : null;

          return {
            id: `schedule-c-part-v-row-${index + 1}`,
            label: buildSupportRowLabel(line, adjustment),
            amount: line.amount,
            summary: buildSupportRowSummary(line, adjustment),
            reviewerFinalLineIds: [line.id],
            taxAdjustmentIds: line.taxAdjustmentIds ?? [],
            sourceDocumentIds: line.sourceDocumentIds,
          };
        })
      : [
          {
            id: "schedule-c-part-v-row-aggregate",
            label: "Approved other expense total",
            amount: otherExpensesField.amount,
            summary:
              "Tina can show the approved other-expenses total here, but she does not have a cleaner line-by-line breakout yet.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: otherExpensesField.taxAdjustmentIds,
            sourceDocumentIds: otherExpensesField.sourceDocumentIds,
          },
        ];

  return {
    id: "schedule-c-part-v-other-expenses",
    title: "Part V support schedule for line 27a",
    summary:
      "This support schedule travels with line 27a so a reviewer can see the approved other-expense breakout Tina is using.",
    rows,
    sourceDocumentIds: collectUniqueIds(rows.flatMap((row) => row.sourceDocumentIds)),
  };
}

function buildScheduleCForm(draft: TinaWorkspaceDraft): TinaOfficialFormDraft {
  const fields = draft.scheduleCDraft.fields;
  const notes = draft.scheduleCDraft.notes;
  const taxYear = /^\d{4}$/.test(draft.profile.taxYear) ? draft.profile.taxYear : "unknown-year";

  const grossReceipts = findField(fields, "line-1-gross-receipts");
  const cogs = findField(fields, "line-4-cogs");
  const contractLabor = findField(fields, "line-11-contract-labor");
  const wages = findField(fields, "line-26-wages");
  const otherExpenses = findField(fields, "line-27a-other-expenses");
  const totalExpenses = findField(fields, "line-28-total-expenses");
  const tentativeProfit = findField(fields, "line-29-tentative-profit");
  const tentativeNet = findField(fields, "line-31-tentative-net");

  const salesTaxNotes = findNotes(notes, (note) => note.id.includes("sales-tax"));
  const inventoryNotes = findNotes(notes, (note) => note.id.includes("inventory"));
  const timingNotes = findNotes(notes, (note) => note.id.includes("timing"));
  const stateScopeNotes = findNotes(notes, (note) => note.id.includes("state-scope"));

  const grossProfitAmount =
    grossReceipts?.amount !== null && cogs?.amount !== null
      ? (grossReceipts?.amount ?? 0) - (cogs?.amount ?? 0)
      : null;
  const grossIncomeAmount = grossProfitAmount;
  const grossProfitState = derivedState(
    [grossReceipts, cogs].filter((field): field is TinaScheduleCDraftField => field !== null),
    salesTaxNotes.concat(inventoryNotes)
  );

  const lines: TinaOfficialFormLine[] = [
    buildLine({
      id: "schedule-c-line-1",
      lineNumber: "Line 1",
      label: "Gross receipts or sales",
      value: formatMoney(grossReceipts?.amount ?? null),
      state: fieldState(grossReceipts),
      summary:
        grossReceipts?.status === "ready"
          ? "Tina carried the approved gross receipts box into the official-form packet."
          : grossReceipts?.status === "needs_attention"
            ? "Tina filled this line, but a review note still touches the amount."
            : "Tina does not trust this line enough to call it ready.",
      fields: grossReceipts ? [grossReceipts] : [],
      notes: salesTaxNotes,
    }),
    buildLine({
      id: "schedule-c-line-2",
      lineNumber: "Line 2",
      label: "Returns and allowances",
      value: "",
      state: "blank",
      summary: "Tina does not build this line automatically yet.",
    }),
    buildLine({
      id: "schedule-c-line-4",
      lineNumber: "Line 4",
      label: "Cost of goods sold",
      value: formatMoney(cogs?.amount ?? null),
      state: fieldState(cogs),
      summary:
        cogs?.status === "ready"
          ? "Tina carried the current COGS box into the official-form packet."
          : cogs?.status === "needs_attention"
            ? "Inventory still needs careful review before this line is trusted."
            : "Tina is leaving this line soft until the inventory path is settled.",
      fields: cogs ? [cogs] : [],
      notes: inventoryNotes,
    }),
    buildLine({
      id: "schedule-c-line-5",
      lineNumber: "Line 5",
      label: "Gross profit",
      value: formatMoney(grossProfitAmount),
      state: grossProfitState,
      summary:
        grossProfitState === "filled"
          ? "Tina computed this from line 1 minus line 4."
          : grossProfitState === "review"
            ? "Tina can compute this line, but upstream review notes still matter."
            : "Tina is not filling this line yet because an upstream box is still blank.",
      fields: [grossReceipts, cogs].filter((field): field is TinaScheduleCDraftField => field !== null),
      notes: salesTaxNotes.concat(inventoryNotes),
    }),
    buildLine({
      id: "schedule-c-line-7",
      lineNumber: "Line 7",
      label: "Gross income",
      value: formatMoney(grossIncomeAmount),
      state: grossProfitState,
      summary:
        grossProfitState === "filled"
          ? "Tina is carrying gross profit into gross income because later other-income lines are not built yet."
          : grossProfitState === "review"
            ? "This line still needs review because the gross-profit path is not fully clean yet."
            : "Tina is leaving this line blank until earlier boxes are more settled.",
      fields: [grossReceipts, cogs].filter((field): field is TinaScheduleCDraftField => field !== null),
      notes: salesTaxNotes.concat(inventoryNotes),
    }),
    buildLine({
      id: "schedule-c-line-11",
      lineNumber: "Line 11",
      label: "Contract labor",
      value: formatMoney(contractLabor?.amount ?? null),
      state: fieldState(contractLabor),
      summary:
        contractLabor?.status === "ready"
          ? "Tina carried approved contractor costs into this line."
          : "Tina still needs a cleaner contractor answer before she trusts this line.",
      fields: contractLabor ? [contractLabor] : [],
    }),
    buildLine({
      id: "schedule-c-line-26",
      lineNumber: "Line 26",
      label: "Wages",
      value: formatMoney(wages?.amount ?? null),
      state: fieldState(wages),
      summary:
        wages?.status === "ready"
          ? "Tina carried approved payroll costs into this line."
          : "Tina still needs a cleaner payroll answer before she trusts this line.",
      fields: wages ? [wages] : [],
    }),
    buildLine({
      id: "schedule-c-line-27a",
      lineNumber: "Line 27a",
      label: "Other expenses",
      value: formatMoney(otherExpenses?.amount ?? null),
      state: fieldState(otherExpenses),
      summary:
        otherExpenses?.status === "ready"
          ? "Tina carried approved business expenses into this line."
          : "Tina is only showing the approved-so-far expense amount here.",
      fields: otherExpenses ? [otherExpenses] : [],
    }),
    buildLine({
      id: "schedule-c-line-28",
      lineNumber: "Line 28",
      label: "Total expenses",
      value: formatMoney(totalExpenses?.amount ?? null),
      state: fieldState(totalExpenses),
      summary:
        totalExpenses?.status === "ready"
          ? "Tina totaled the expense lines she can support so far."
          : "This total still depends on one or more expense boxes that need more care.",
      fields: totalExpenses ? [totalExpenses] : [],
    }),
    buildLine({
      id: "schedule-c-line-29",
      lineNumber: "Line 29",
      label: "Tentative profit or loss",
      value: formatMoney(tentativeProfit?.amount ?? null),
      state: fieldState(tentativeProfit),
      summary:
        tentativeProfit?.status === "ready"
          ? "Tina carried the approved-so-far profit math into this line."
          : "This line is still only a draft because earlier boxes need more care.",
      fields: tentativeProfit ? [tentativeProfit] : [],
      notes: timingNotes,
    }),
    buildLine({
      id: "schedule-c-line-31",
      lineNumber: "Line 31",
      label: "Net profit or loss",
      value: formatMoney(tentativeNet?.amount ?? null),
      state: derivedState(
        [tentativeNet].filter((field): field is TinaScheduleCDraftField => field !== null),
        timingNotes.concat(stateScopeNotes)
      ),
      summary:
        tentativeNet?.status === "ready" && timingNotes.length === 0
          ? "Tina carried the approved net result into the final Schedule C line she supports today."
          : "Tina filled this line as a draft only. Timing or wider scope review can still change it.",
      fields: tentativeNet ? [tentativeNet] : [],
      notes: timingNotes.concat(stateScopeNotes),
    }),
  ];

  const supportSchedules = [
    buildOtherExpensesSupportSchedule(draft, otherExpenses),
  ].filter((schedule): schedule is TinaOfficialFormSupportSchedule => schedule !== null);

  const relatedNoteIds = notes.map((note) => note.id);
  const sourceDocumentIds = Array.from(
    new Set([
      ...lines.flatMap((line) => line.sourceDocumentIds),
      ...supportSchedules.flatMap((schedule) => schedule.sourceDocumentIds),
    ])
  );
  const criticalBlankIds = new Set(["schedule-c-line-1", "schedule-c-line-28", "schedule-c-line-31"]);
  const blockedByBlank = lines.some((line) => criticalBlankIds.has(line.id) && line.state === "blank");
  const reviewCount = lines.filter((line) => line.state === "review").length + notes.length;
  const coverageGaps = buildTinaOfficialFormCoverageGaps(draft);
  const coverageGapLabels = coverageGaps.map((gap) => gap.formNumber);
  const coverageGapSummary = coverageGapLabels.join(", ");

  let status: TinaOfficialFormStatus = "ready";
  if (draft.packageReadiness.level === "blocked" || blockedByBlank) status = "blocked";
  else if (draft.packageReadiness.level === "needs_review" || reviewCount > 0) status = "needs_review";
  if (coverageGaps.length > 0) status = "blocked";

  const filledCount = lines.filter((line) => line.state === "filled").length;

  let summary = `Tina mapped ${filledCount} line${filledCount === 1 ? "" : "s"} into the year-specific Schedule C packet.`;
  if (status === "blocked") {
    summary =
      "Tina can lay out the form packet, but it still has blockers and should not be treated like finished paperwork yet.";
  } else if (status === "needs_review") {
    summary =
      "Tina mapped the form packet, but a human still needs to look at one or more lines or notes before trusting it.";
  }

  let nextStep =
    "Tina can carry this packet into reviewer handoff next, then later into a truer final paperwork renderer.";
  if (status === "blocked") {
    nextStep =
      "Clear the blocking items first. Tina should not treat this form packet like submission-ready paperwork yet.";
  } else if (status === "needs_review") {
    nextStep =
      "Review the flagged lines and notes next so Tina can tighten this packet before final paperwork export.";
  }

  if (coverageGaps.length > 0) {
    summary =
      coverageGaps.length === 1
        ? `Tina laid out Schedule C, but the federal business packet is still missing ${coverageGapSummary}.`
        : `Tina laid out Schedule C, but the federal business packet is still missing ${coverageGapSummary}.`;
    nextStep = `Keep this as a review preview only. ${coverageGaps
      .map((gap) => `${gap.formNumber}: ${gap.title}`)
      .join("; ")} still need separate handling before Tina can call the IRS-facing business packet complete.`;
  }

  return {
    id: `schedule-c-${taxYear}`,
    formNumber: "Schedule C (Form 1040)",
    title: "Profit or Loss From Business",
    taxYear,
    revisionYear: taxYear,
    status,
    summary,
    nextStep,
    lines,
    supportSchedules,
    relatedNoteIds,
    sourceDocumentIds,
  };
}

export function buildTinaOfficialFormPacket(
  draft: TinaWorkspaceDraft,
  options?: {
    irsAuthorityWatchStatus?: TinaIrsAuthorityWatchStatus | null;
  }
): TinaOfficialFormPacketSnapshot {
  const now = new Date().toISOString();
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const irsAuthorityWatchStatus = options?.irsAuthorityWatchStatus ?? null;

  if (lane.laneId !== "schedule_c_single_member_llc" || lane.support !== "supported") {
    return {
      ...createDefaultTinaOfficialFormPacket(),
      lastRunAt: now,
      summary:
        "Tina only builds this first official-form packet for the supported Schedule C lane.",
      nextStep: "Finish intake first or wait for Tina's future filing lanes.",
    };
  }

  if (draft.scheduleCDraft.status !== "complete") {
    return {
      ...createDefaultTinaOfficialFormPacket(),
      lastRunAt: now,
      status: draft.scheduleCDraft.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the Schedule C draft before she can build the year-specific form packet.",
      nextStep: "Build the Schedule C draft first.",
    };
  }

  if (draft.packageReadiness.status !== "complete") {
    return {
      ...createDefaultTinaOfficialFormPacket(),
      lastRunAt: now,
      status: draft.packageReadiness.status === "stale" ? "stale" : "idle",
      summary:
        "Tina wants the filing-package check first so she can label the form packet honestly.",
      nextStep: "Run the package check first.",
    };
  }

  const irsAuthorityStatus = getTinaIrsAuthorityRegistryStatus(
    lane.laneId,
    draft.profile.taxYear
  );

  if (irsAuthorityStatus.level === "blocked") {
    return {
      ...createDefaultTinaOfficialFormPacket(),
      lastRunAt: now,
      status: "complete",
      summary: irsAuthorityStatus.summary,
      nextStep: irsAuthorityStatus.nextStep,
    };
  }

  if (irsAuthorityWatchStatus?.level === "needs_review") {
    return {
      ...createDefaultTinaOfficialFormPacket(),
      lastRunAt: now,
      status: "complete",
      summary: irsAuthorityWatchStatus.summary,
      nextStep: irsAuthorityWatchStatus.nextStep,
    };
  }

  const form = buildScheduleCForm(draft);
  const coverageGaps = buildTinaOfficialFormCoverageGaps(draft);
  const blockedCount = form.lines.filter((line) => line.state === "blank").length;
  const reviewCount =
    form.lines.filter((line) => line.state === "review").length + form.relatedNoteIds.length;

  let summary = `Tina built ${form.formNumber} for ${form.taxYear} with ${form.lines.length} mapped lines.`;
  if (form.status === "blocked") {
    summary = `Tina built the form packet, but ${blockedCount} line${blockedCount === 1 ? "" : "s"} or package blockers still keep it from feeling finished.`;
  } else if (form.status === "needs_review") {
    summary = `Tina built the form packet, but ${reviewCount} line${reviewCount === 1 ? "" : "s"} or note${reviewCount === 1 ? "" : "s"} still need a human look.`;
  }

  let nextStep =
    "This packet can travel with the review bundle now, then later into a truer final document renderer.";
  if (form.status === "blocked") {
    nextStep =
      "Clear the blocking items first so Tina can move this closer to real final paperwork.";
  } else if (form.status === "needs_review") {
    nextStep =
      "Clear the flagged review items next so Tina can tighten the paperwork layer.";
  }

  if (coverageGaps.length > 0) {
    const coverageGapLabels = coverageGaps.map((gap) => gap.formNumber).join(", ");
    summary =
      coverageGaps.length === 1
        ? `Tina built the Schedule C portion of the federal business packet, but ${coverageGapLabels} still keeps the IRS-facing packet from being exact.`
        : `Tina built the Schedule C portion of the federal business packet, but ${coverageGapLabels} still keep the IRS-facing packet from being exact.`;
    nextStep =
      "A CPA can still review this Schedule C preview, but Tina should not let the owner export it as the finished federal business packet until those companion forms are covered.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    forms: [form],
  };
}
