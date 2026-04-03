import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaScheduleCDraft } from "@/tina/lib/schedule-c-draft";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaFormValidationIssue,
  TinaScheduleCDraftField,
  TinaScheduleCReturnSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaScheduleCReturnSnapshot {
  return {
    lastBuiltAt: null,
    status: "idle",
    summary: "Tina has not built a printable Schedule C return snapshot yet.",
    nextStep: "Build the Schedule C draft first, then let Tina map it into form fields.",
    header: {
      businessName: "",
      taxYear: "",
      principalBusinessActivity: "",
      naicsCode: "",
      accountingMethod: "cash",
      entityType: "unsure",
    },
    businessName: "",
    taxYear: "",
    laneId: "unknown",
    fields: [],
    validationIssues: [],
  };
}

function createValidationIssue(args: {
  id: string;
  title: string;
  summary: string;
  severity: TinaFormValidationIssue["severity"];
  relatedLineNumbers?: string[];
}): TinaFormValidationIssue {
  return {
    id: args.id,
    title: args.title,
    summary: args.summary,
    severity: args.severity,
    relatedLineNumbers: args.relatedLineNumbers ?? [],
  };
}

function findField(fields: TinaScheduleCDraftField[], id: string): TinaScheduleCDraftField | null {
  return fields.find((field) => field.id === id) ?? null;
}

function cloneField(
  field: TinaScheduleCDraftField | null,
  fallback: { id: string; lineNumber: string; formKey: string; label: string }
) {
  return {
    id: fallback.id,
    lineNumber: fallback.lineNumber,
    formKey: fallback.formKey,
    label: fallback.label,
    amount: field?.amount ?? null,
    status: field?.status ?? "waiting",
    sourceFieldIds: field ? [field.id] : [],
  };
}

function createFallbackField(args: {
  id: string;
  lineNumber: string;
  formKey: string;
  label: string;
  amount: number | null;
  status: TinaScheduleCReturnSnapshot["fields"][number]["status"];
  sourceFieldIds?: string[];
}) {
  return {
    id: args.id,
    lineNumber: args.lineNumber,
    formKey: args.formKey,
    label: args.label,
    amount: args.amount,
    status: args.status,
    sourceFieldIds: args.sourceFieldIds ?? [],
  };
}

function addDerivedField(args: {
  id: string;
  lineNumber: string;
  formKey: string;
  label: string;
  amount: number | null;
  status: TinaScheduleCReturnSnapshot["fields"][number]["status"];
  sourceFieldIds: string[];
}) {
  return {
    id: args.id,
    lineNumber: args.lineNumber,
    formKey: args.formKey,
    label: args.label,
    amount: args.amount,
    status: args.status,
    sourceFieldIds: args.sourceFieldIds,
  };
}

function strongestStatus(
  statuses: TinaScheduleCReturnSnapshot["fields"][number]["status"][]
): TinaScheduleCReturnSnapshot["fields"][number]["status"] {
  if (statuses.includes("needs_attention")) return "needs_attention";
  if (statuses.includes("waiting")) return "waiting";
  return "ready";
}

function computeAmount(field: TinaScheduleCDraftField | null): number | null {
  return typeof field?.amount === "number" ? field.amount : null;
}

export function buildTinaScheduleCReturn(
  draft: TinaWorkspaceDraft
): TinaScheduleCReturnSnapshot {
  const now = new Date().toISOString();
  const startPath = buildTinaStartPathAssessment(draft);
  const scheduleCDraft =
    draft.scheduleCDraft.status === "complete"
      ? draft.scheduleCDraft
      : buildTinaScheduleCDraft(draft);
  const packageReadiness =
    draft.packageReadiness.status === "complete"
      ? draft.packageReadiness
      : buildTinaPackageReadiness({
          ...draft,
          scheduleCDraft,
        });

  if (
    startPath.recommendation.laneId !== "schedule_c_single_member_llc" ||
    startPath.route !== "supported"
  ) {
    const routeValidationIssue = createValidationIssue({
      id: startPath.route === "blocked" ? "start-path-blocked" : "start-path-review-only",
      title:
        startPath.route === "blocked"
          ? "Start path blocks Schedule C return output"
          : "Start path still needs reviewer judgment before Schedule C output",
      summary:
        startPath.route === "blocked"
          ? "Tina should not treat this file as a Schedule C return while the filing path is blocked by entity, ownership, or evidence conflicts."
          : "Tina has a possible Schedule C path, but reviewer judgment is still required before she should publish Schedule C return output.",
      severity: startPath.route === "blocked" ? "blocking" : "needs_attention",
    });

    return {
      ...createEmptySnapshot(),
      lastBuiltAt: now,
      header: {
        businessName: draft.profile.businessName,
        taxYear: draft.profile.taxYear,
        principalBusinessActivity: draft.profile.principalBusinessActivity,
        naicsCode: draft.profile.naicsCode,
        accountingMethod: draft.profile.accountingMethod,
        entityType: draft.profile.entityType,
      },
      businessName: draft.profile.businessName,
      taxYear: draft.profile.taxYear,
      laneId: startPath.recommendation.laneId,
      summary:
        "Tina will not build a supported Schedule C return snapshot while the source-fact-aware start path is still routed away from the supported lane.",
      nextStep:
        startPath.route === "blocked"
          ? "Resolve the blocked start path first."
          : "Keep this file in reviewer control until the start path is truly supported.",
      validationIssues: [routeValidationIssue],
    };
  }

  if (scheduleCDraft.status !== "complete") {
    return {
      ...createEmptySnapshot(),
      lastBuiltAt: now,
      header: {
        businessName: draft.profile.businessName,
        taxYear: draft.profile.taxYear,
        principalBusinessActivity: draft.profile.principalBusinessActivity,
        naicsCode: draft.profile.naicsCode,
        accountingMethod: draft.profile.accountingMethod,
        entityType: draft.profile.entityType,
      },
      businessName: draft.profile.businessName,
      taxYear: draft.profile.taxYear,
      laneId: startPath.recommendation.laneId,
      summary: "Tina cannot build a printable Schedule C snapshot until the Schedule C draft exists.",
      nextStep: scheduleCDraft.nextStep,
    };
  }

  const header = {
    businessName: draft.profile.businessName,
    taxYear: draft.profile.taxYear,
    principalBusinessActivity: draft.profile.principalBusinessActivity,
    naicsCode: draft.profile.naicsCode,
    accountingMethod: draft.profile.accountingMethod,
    entityType: draft.profile.entityType,
  };

  const line1 = findField(scheduleCDraft.fields, "line-1-gross-receipts");
  const line4 = findField(scheduleCDraft.fields, "line-4-cogs");
  const line8 = findField(scheduleCDraft.fields, "line-8-advertising");
  const line11 = findField(scheduleCDraft.fields, "line-11-contract-labor");
  const line13 = findField(scheduleCDraft.fields, "line-13-depreciation");
  const line18 = findField(scheduleCDraft.fields, "line-18-office-expense");
  const line20 = findField(scheduleCDraft.fields, "line-20-rent-or-lease");
  const line22 = findField(scheduleCDraft.fields, "line-22-supplies");
  const line23 = findField(scheduleCDraft.fields, "line-23-taxes-and-licenses");
  const line24a = findField(scheduleCDraft.fields, "line-24a-travel");
  const line24b = findField(scheduleCDraft.fields, "line-24b-deductible-meals");
  const line26 = findField(scheduleCDraft.fields, "line-26-wages");
  const line27a = findField(scheduleCDraft.fields, "line-27a-other-expenses");
  const line7Amount =
    computeAmount(line1) !== null && computeAmount(line4) !== null
      ? computeAmount(line1)! - computeAmount(line4)!
      : computeAmount(line1);
  const line7Status = strongestStatus([line1?.status ?? "waiting", line4?.status ?? "ready"]);
  const line28 = findField(scheduleCDraft.fields, "line-28-total-expenses");
  const expectedLine28Amount =
    (computeAmount(line8) ?? 0) +
    (computeAmount(line11) ?? 0) +
    (computeAmount(line13) ?? 0) +
    (computeAmount(line18) ?? 0) +
    (computeAmount(line20) ?? 0) +
    (computeAmount(line22) ?? 0) +
    (computeAmount(line23) ?? 0) +
    (computeAmount(line24a) ?? 0) +
    (computeAmount(line24b) ?? 0) +
    (computeAmount(line26) ?? 0) +
    (computeAmount(line27a) ?? 0);
  const line28Amount = computeAmount(line28) ?? expectedLine28Amount;
  const line28Status = line28?.status ??
    strongestStatus([
      line8?.status ?? "ready",
      line11?.status ?? "ready",
      line13?.status ?? "ready",
      line18?.status ?? "ready",
      line20?.status ?? "ready",
      line22?.status ?? "ready",
      line23?.status ?? "ready",
      line24a?.status ?? "ready",
      line24b?.status ?? "ready",
      line26?.status ?? "ready",
      line27a?.status ?? "ready",
    ]);
  const line29Amount = line7Amount !== null ? line7Amount - line28Amount : null;
  const line29Status = strongestStatus([line7Status, line28Status]);
  const line31 = findField(scheduleCDraft.fields, "line-31-tentative-net");
  const line31Amount = computeAmount(line31) ?? line29Amount;
  const line31Status = line31?.status ?? line29Status;

  const fields = [
    cloneField(line1, {
      id: "schedule-c-line-1",
      lineNumber: "Line 1",
      formKey: "grossReceipts",
      label: "Gross receipts or sales",
    }),
    line4
      ? cloneField(line4, {
          id: "schedule-c-line-4",
          lineNumber: "Line 4",
          formKey: "costOfGoodsSold",
          label: "Cost of goods sold",
        })
      : createFallbackField({
          id: "schedule-c-line-4",
          lineNumber: "Line 4",
          formKey: "costOfGoodsSold",
          label: "Cost of goods sold",
          amount: 0,
          status: "ready",
        }),
    addDerivedField({
      id: "schedule-c-line-7",
      lineNumber: "Line 7",
      formKey: "grossIncome",
      label: "Gross income",
      amount: line7Amount,
      status: line7Status,
      sourceFieldIds: [line1?.id, line4?.id].filter((value): value is string => Boolean(value)),
    }),
    line8
      ? cloneField(line8, {
          id: "schedule-c-line-8",
          lineNumber: "Line 8",
          formKey: "advertising",
          label: "Advertising",
        })
      : createFallbackField({
          id: "schedule-c-line-8",
          lineNumber: "Line 8",
          formKey: "advertising",
          label: "Advertising",
          amount: 0,
          status: "ready",
        }),
    line11
      ? cloneField(line11, {
          id: "schedule-c-line-11",
          lineNumber: "Line 11",
          formKey: "contractLabor",
          label: "Contract labor",
        })
      : createFallbackField({
          id: "schedule-c-line-11",
          lineNumber: "Line 11",
          formKey: "contractLabor",
          label: "Contract labor",
          amount: 0,
          status: "ready",
        }),
    line13
      ? cloneField(line13, {
          id: "schedule-c-line-13",
          lineNumber: "Line 13",
          formKey: "depreciation",
          label: "Depreciation and section 179",
        })
      : createFallbackField({
          id: "schedule-c-line-13",
          lineNumber: "Line 13",
          formKey: "depreciation",
          label: "Depreciation and section 179",
          amount: 0,
          status: "ready",
        }),
    line18
      ? cloneField(line18, {
          id: "schedule-c-line-18",
          lineNumber: "Line 18",
          formKey: "officeExpense",
          label: "Office expense",
        })
      : createFallbackField({
          id: "schedule-c-line-18",
          lineNumber: "Line 18",
          formKey: "officeExpense",
          label: "Office expense",
          amount: 0,
          status: "ready",
        }),
    line20
      ? cloneField(line20, {
          id: "schedule-c-line-20",
          lineNumber: "Line 20",
          formKey: "rentOrLease",
          label: "Rent or lease",
        })
      : createFallbackField({
          id: "schedule-c-line-20",
          lineNumber: "Line 20",
          formKey: "rentOrLease",
          label: "Rent or lease",
          amount: 0,
          status: "ready",
        }),
    line22
      ? cloneField(line22, {
          id: "schedule-c-line-22",
          lineNumber: "Line 22",
          formKey: "supplies",
          label: "Supplies",
        })
      : createFallbackField({
          id: "schedule-c-line-22",
          lineNumber: "Line 22",
          formKey: "supplies",
          label: "Supplies",
          amount: 0,
          status: "ready",
        }),
    line23
      ? cloneField(line23, {
          id: "schedule-c-line-23",
          lineNumber: "Line 23",
          formKey: "taxesAndLicenses",
          label: "Taxes and licenses",
        })
      : createFallbackField({
          id: "schedule-c-line-23",
          lineNumber: "Line 23",
          formKey: "taxesAndLicenses",
          label: "Taxes and licenses",
          amount: 0,
          status: "ready",
        }),
    line24a
      ? cloneField(line24a, {
          id: "schedule-c-line-24a",
          lineNumber: "Line 24a",
          formKey: "travel",
          label: "Travel",
        })
      : createFallbackField({
          id: "schedule-c-line-24a",
          lineNumber: "Line 24a",
          formKey: "travel",
          label: "Travel",
          amount: 0,
          status: "ready",
        }),
    line24b
      ? cloneField(line24b, {
          id: "schedule-c-line-24b",
          lineNumber: "Line 24b",
          formKey: "deductibleMeals",
          label: "Deductible meals",
        })
      : createFallbackField({
          id: "schedule-c-line-24b",
          lineNumber: "Line 24b",
          formKey: "deductibleMeals",
          label: "Deductible meals",
          amount: 0,
          status: "ready",
        }),
    line26
      ? cloneField(line26, {
          id: "schedule-c-line-26",
          lineNumber: "Line 26",
          formKey: "wages",
          label: "Wages",
        })
      : createFallbackField({
          id: "schedule-c-line-26",
          lineNumber: "Line 26",
          formKey: "wages",
          label: "Wages",
          amount: 0,
          status: "ready",
        }),
    line27a
      ? cloneField(line27a, {
          id: "schedule-c-line-27a",
          lineNumber: "Line 27a",
          formKey: "otherExpenses",
          label: "Other expenses",
        })
      : createFallbackField({
          id: "schedule-c-line-27a",
          lineNumber: "Line 27a",
          formKey: "otherExpenses",
          label: "Other expenses",
          amount: 0,
          status: "ready",
        }),
    line28
      ? cloneField(line28, {
          id: "schedule-c-line-28",
          lineNumber: "Line 28",
          formKey: "totalExpenses",
          label: "Total expenses",
        })
      : createFallbackField({
          id: "schedule-c-line-28",
          lineNumber: "Line 28",
          formKey: "totalExpenses",
          label: "Total expenses",
          amount: expectedLine28Amount,
          status: line28Status,
          sourceFieldIds: [
            line8?.id,
            line11?.id,
            line13?.id,
            line18?.id,
            line20?.id,
            line22?.id,
            line23?.id,
            line24a?.id,
            line24b?.id,
            line26?.id,
            line27a?.id,
          ].filter((value): value is string => Boolean(value)),
        }),
    addDerivedField({
      id: "schedule-c-line-29",
      lineNumber: "Line 29",
      formKey: "tentativeProfit",
      label: "Tentative profit or loss",
      amount: line29Amount,
      status: line29Status,
      sourceFieldIds: [line1?.id, line4?.id, line28?.id].filter(
        (value): value is string => Boolean(value)
      ),
    }),
    line31
      ? cloneField(line31, {
          id: "schedule-c-line-31",
          lineNumber: "Line 31",
          formKey: "netProfitOrLoss",
          label: "Net profit or loss",
        })
      : createFallbackField({
          id: "schedule-c-line-31",
          lineNumber: "Line 31",
          formKey: "netProfitOrLoss",
          label: "Net profit or loss",
          amount: line31Amount,
          status: line31Status,
          sourceFieldIds: [line1?.id, line4?.id, line28?.id].filter(
            (value): value is string => Boolean(value)
          ),
        }),
  ];

  const validationIssues: TinaFormValidationIssue[] = [];

  if (!draft.profile.businessName.trim()) {
    validationIssues.push(
      createValidationIssue({
        id: "missing-business-name",
        title: "Business name is missing",
        summary: "Tina should not print a form-ready Schedule C until the business name is confirmed.",
        severity: "blocking",
      })
    );
  }

  if (!draft.profile.taxYear.trim()) {
    validationIssues.push(
      createValidationIssue({
        id: "missing-tax-year",
        title: "Tax year is missing",
        summary: "Tina should not print a form-ready Schedule C until the tax year is confirmed.",
        severity: "blocking",
      })
    );
  }

  if (!draft.profile.principalBusinessActivity.trim()) {
    validationIssues.push(
      createValidationIssue({
        id: "missing-principal-business-activity",
        title: "Principal business activity is missing",
        summary:
          "Tina should not call this Schedule C form-ready until the principal business activity is clearly described.",
        severity: "blocking",
      })
    );
  }

  if (!draft.profile.naicsCode.trim()) {
    validationIssues.push(
      createValidationIssue({
        id: "missing-naics-code",
        title: "Business code is missing",
        summary:
          "Tina should not call this Schedule C form-ready until the principal business code is filled in.",
        severity: "blocking",
      })
    );
  }

  fields.forEach((field) => {
    if (field.status === "waiting") {
      validationIssues.push(
        createValidationIssue({
          id: `waiting-${field.id}`,
          title: `${field.lineNumber} is still waiting`,
          summary: `Tina does not have a stable value for ${field.label} yet, so the form should not be treated as final.`,
          severity: "blocking",
          relatedLineNumbers: [field.lineNumber],
        })
      );
    } else if (field.status === "needs_attention") {
      validationIssues.push(
        createValidationIssue({
          id: `review-${field.id}`,
          title: `${field.lineNumber} still needs attention`,
          summary: `Tina has a value for ${field.label}, but a reviewer should resolve the open note before trusting the form.`,
          severity: "needs_attention",
          relatedLineNumbers: [field.lineNumber],
        })
      );
    }
  });

  packageReadiness.items.forEach((item) => {
    if (item.severity === "blocking") {
      validationIssues.push(
        createValidationIssue({
          id: `readiness-${item.id}`,
          title: item.title,
          summary: item.summary,
          severity: "blocking",
        })
      );
    }
  });

  if (
    computeAmount(line1) !== null &&
    computeAmount(line4) !== null &&
    line7Amount !== computeAmount(line1)! - computeAmount(line4)!
  ) {
    validationIssues.push(
      createValidationIssue({
        id: "gross-income-cross-check",
        title: "Line 7 does not reconcile to lines 1 and 4",
        summary:
          "Tina's gross income line should equal line 1 minus line 4. She should stop and fix this before presenting a printable form.",
        severity: "blocking",
        relatedLineNumbers: ["Line 1", "Line 4", "Line 7"],
      })
    );
  }

  if (line28 && computeAmount(line28) !== null && computeAmount(line28)! !== expectedLine28Amount) {
    validationIssues.push(
      createValidationIssue({
        id: "total-expenses-cross-check",
        title: "Line 28 does not reconcile to component expense lines",
        summary:
          "Tina's total expenses line should equal the supported expense component lines she mapped into the form. She should stop and fix this before printing.",
        severity: "blocking",
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
        ],
      })
    );
  }

  if (
    line31 &&
    line29Amount !== null &&
    computeAmount(line31) !== null &&
    computeAmount(line31)! !== line29Amount
  ) {
    validationIssues.push(
      createValidationIssue({
        id: "net-profit-cross-check",
        title: "Line 31 does not reconcile to line 29",
        summary:
          "Tina's current net profit line should match the tentative profit calculation for this supported lane. She should stop and fix this before printing.",
        severity: "blocking",
        relatedLineNumbers: ["Line 29", "Line 31"],
      })
    );
  }

  scheduleCDraft.notes.forEach((note) => {
    validationIssues.push(
      createValidationIssue({
        id: `draft-note-${note.id}`,
        title: note.title,
        summary: note.summary,
        severity: note.severity === "needs_attention" ? "blocking" : "needs_attention",
      })
    );
  });

  const blockingCount = validationIssues.filter((item) => item.severity === "blocking").length;
  const needsAttentionCount = validationIssues.filter(
    (item) => item.severity === "needs_attention"
  ).length;

  let summary = "Tina built a structured Schedule C return snapshot for the supported lane.";
  let nextStep = "Render the return and let a reviewer inspect the mapped lines before filing.";
  if (blockingCount > 0) {
    summary = `Tina built a Schedule C return snapshot, but ${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"} still prevent form-ready output.`;
    nextStep = "Clear the blocking form issues before treating this Schedule C as printable or review-ready.";
  } else if (needsAttentionCount > 0) {
    summary = `Tina built a Schedule C return snapshot, but ${needsAttentionCount} line${needsAttentionCount === 1 ? "" : "s"} still need reviewer attention.`;
    nextStep = "Resolve the attention items before treating this Schedule C as final.";
  }

  return {
    lastBuiltAt: now,
    status: "complete",
    summary,
    nextStep,
    header,
    businessName: draft.profile.businessName,
    taxYear: draft.profile.taxYear,
    laneId: startPath.recommendation.laneId,
    fields,
    validationIssues,
  };
}
