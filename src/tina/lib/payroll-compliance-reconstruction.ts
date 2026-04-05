import type {
  TinaDocumentIntelligenceExtractKind,
  TinaPayrollComplianceChannel,
  TinaPayrollComplianceIssue,
  TinaPayrollComplianceSnapshot,
  TinaPayrollSupportStatus,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import {
  buildTinaPayrollComplianceSignalProfileFromText,
  type TinaPayrollComplianceSignalProfile,
} from "@/tina/lib/payroll-compliance-signals";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
import type { TinaStoredDocument, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function documentText(draft: TinaWorkspaceDraft, document: TinaStoredDocument): string {
  const reading = draft.documentReadings.find((item) => item.documentId === document.id);
  const facts = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === document.id);

  return [
    document.name,
    document.requestId ?? "",
    document.requestLabel ?? "",
    reading?.summary ?? "",
    reading?.detailLines.join(" ") ?? "",
    facts.map((fact) => `${fact.label} ${fact.value}`).join(" "),
  ].join(" ");
}

function buildDraftSignalProfile(draft: TinaWorkspaceDraft): TinaPayrollComplianceSignalProfile {
  return buildTinaPayrollComplianceSignalProfileFromText(
    [
      draft.profile.notes,
      ...draft.documents.map((document) => documentText(draft, document)),
      ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
      ...draft.documentReadings.flatMap((reading) => reading.detailLines),
    ].join(" ")
  );
}

function structuredDocumentIdsForKinds(args: {
  draft: TinaWorkspaceDraft;
  snapshot: ReturnType<typeof buildTinaDocumentIntelligence>;
  kinds: TinaDocumentIntelligenceExtractKind[];
}): string[] {
  const kindSet = new Set(args.kinds);
  return unique(
    args.snapshot.items
      .filter((item) => item.extractedFacts.some((fact) => kindSet.has(fact.kind)))
      .map((item) => item.documentId)
  );
}

function relatedFactIdsForKinds(args: {
  draft: TinaWorkspaceDraft;
  snapshot: ReturnType<typeof buildTinaDocumentIntelligence>;
  kinds: TinaDocumentIntelligenceExtractKind[];
}): string[] {
  const kindSet = new Set(args.kinds);
  return unique(
    args.snapshot.items
      .filter((item) => item.extractedFacts.some((fact) => kindSet.has(fact.kind)))
      .flatMap((item) => item.relatedFactIds)
  );
}

function matchedNarrativeFactIds(args: {
  draft: TinaWorkspaceDraft;
  predicate: (profile: TinaPayrollComplianceSignalProfile) => boolean;
}): string[] {
  return unique(
    args.draft.sourceFacts
      .filter((fact) =>
        args.predicate(
          buildTinaPayrollComplianceSignalProfileFromText(`${fact.label} ${fact.value}`)
        )
      )
      .map((fact) => fact.id)
  );
}

function matchedNarrativeDocumentIds(args: {
  draft: TinaWorkspaceDraft;
  predicate: (profile: TinaPayrollComplianceSignalProfile) => boolean;
}): string[] {
  return unique(
    args.draft.documentReadings
      .filter((reading) =>
        args.predicate(
          buildTinaPayrollComplianceSignalProfileFromText(
            [reading.summary, reading.detailLines.join(" ")].join(" ")
          )
        )
      )
      .map((reading) => reading.documentId)
  );
}

function supportStatusFromChannels(args: {
  applicable: boolean;
  structuredCount: number;
  narrativeCount: number;
  backgroundSupport?: boolean;
}): TinaPayrollSupportStatus {
  if (!args.applicable) return "not_applicable";
  if (args.structuredCount > 0) return "supported";
  if (args.narrativeCount > 0 || args.backgroundSupport) return "partial";
  return "missing";
}

function channelStatusFromSupport(
  supportStatus: TinaPayrollSupportStatus,
  hasNarrative: boolean
): TinaPayrollComplianceChannel["status"] {
  if (supportStatus === "supported") return "structured";
  if (supportStatus === "partial" && hasNarrative) return "narrative_only";
  if (supportStatus === "partial") return "structured";
  return "missing";
}

function buildChannel(args: {
  id: string;
  kind: TinaPayrollComplianceChannel["kind"];
  supportStatus: TinaPayrollSupportStatus;
  structuredDocumentIds: string[];
  narrativeDocumentIds?: string[];
  relatedFactIds: string[];
  summary: string;
}): TinaPayrollComplianceChannel {
  const narrativeDocumentIds = unique(args.narrativeDocumentIds ?? []);
  const hasNarrativeOnly = args.structuredDocumentIds.length === 0 && narrativeDocumentIds.length > 0;

  return {
    id: args.id,
    kind: args.kind,
    status: channelStatusFromSupport(args.supportStatus, hasNarrativeOnly),
    summary: args.summary,
    relatedDocumentIds: unique([...args.structuredDocumentIds, ...narrativeDocumentIds]),
    relatedFactIds: unique(args.relatedFactIds),
  };
}

function buildIssue(issue: TinaPayrollComplianceIssue): TinaPayrollComplianceIssue {
  return {
    ...issue,
    relatedDocumentIds: unique(issue.relatedDocumentIds),
    relatedFactIds: unique(issue.relatedFactIds),
  };
}

function amountForKey(
  scheduleCReturn: ReturnType<typeof buildTinaScheduleCReturn>,
  formKey: string
): number | null {
  return scheduleCReturn.fields.find((field) => field.formKey === formKey)?.amount ?? null;
}

function summaryForSupport(label: string, supportStatus: TinaPayrollSupportStatus): string {
  if (supportStatus === "supported") {
    return `${label} are present as structured support.`;
  }
  if (supportStatus === "partial") {
    return `${label} are visible, but the support is still incomplete or too narrative-heavy.`;
  }
  if (supportStatus === "missing") {
    return `${label} are not currently supported strongly enough to trust payroll compliance.`;
  }
  return `${label} do not materially apply to the current file.`;
}

export function buildTinaPayrollComplianceReconstruction(
  draft: TinaWorkspaceDraft
): TinaPayrollComplianceSnapshot {
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const signalProfile = buildDraftSignalProfile(draft);
  const wagesAmount = amountForKey(scheduleCReturn, "wages");
  const contractorAmount = amountForKey(scheduleCReturn, "contractLabor");
  const payrollCoverage =
    accountingArtifactCoverage.items.find((item) => item.id === "payroll-records")?.status ?? "missing";
  const contractorCoverage =
    accountingArtifactCoverage.items.find((item) => item.id === "contractor-records")?.status ?? "missing";
  const generalLedgerCoverage =
    accountingArtifactCoverage.items.find((item) => item.id === "general-ledger")?.status ?? "missing";
  const bankCoverage =
    accountingArtifactCoverage.items.find((item) => item.id === "bank-statements")?.status ?? "missing";
  const workerNormalizationIssue = booksNormalization.issues.find(
    (issue) => issue.id === "worker-classification-normalization"
  );

  const payrollSignalDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_signal"],
  });
  const payrollSignalFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_signal"],
  });
  const quarterlyDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_quarterly_filing_signal"],
  });
  const quarterlyFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_quarterly_filing_signal"],
  });
  const annualDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_annual_wage_form_signal"],
  });
  const annualFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_annual_wage_form_signal"],
  });
  const depositDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_deposit_signal"],
  });
  const depositFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_deposit_signal"],
  });
  const providerDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_provider_signal"],
  });
  const providerFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_provider_signal"],
  });
  const manualPayrollDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["manual_payroll_signal"],
  });
  const manualPayrollFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["manual_payroll_signal"],
  });
  const complianceGapDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_compliance_gap_signal"],
  });
  const complianceGapFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["payroll_compliance_gap_signal"],
  });
  const ownerCompDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["owner_comp_signal"],
  });
  const ownerCompFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["owner_comp_signal"],
  });
  const contractorDocumentIds = structuredDocumentIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["contractor_signal"],
  });
  const contractorFactIds = relatedFactIdsForKinds({
    draft,
    snapshot: documentIntelligence,
    kinds: ["contractor_signal"],
  });

  const payrollDetected =
    draft.profile.hasPayroll ||
    (typeof wagesAmount === "number" && wagesAmount > 0) ||
    payrollSignalDocumentIds.length > 0 ||
    signalProfile.payrollSignal ||
    signalProfile.ownerCompSignal;
  const contractorDetected =
    draft.profile.paysContractors ||
    (typeof contractorAmount === "number" && contractorAmount > 0) ||
    contractorDocumentIds.length > 0 ||
    signalProfile.contractorSignal;
  const ownerCompApplies =
    draft.profile.entityType === "s_corp" ||
    ownerCompDocumentIds.length > 0 ||
    signalProfile.ownerCompSignal;
  const hasExplicitComplianceGap =
    signalProfile.missedComplianceSignal ||
    complianceGapDocumentIds.length > 0 ||
    complianceGapFactIds.length > 0;
  const sCorpNoPayroll =
    singleOwnerCorporateRoute.posture === "s_corp_no_payroll" &&
    singleOwnerCorporateRoute.overallStatus === "blocked";

  const payrollOperationalStatus = supportStatusFromChannels({
    applicable: payrollDetected,
    structuredCount: payrollSignalDocumentIds.length + providerDocumentIds.length + manualPayrollDocumentIds.length,
    narrativeCount:
      matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.payrollSignal || profile.payrollProviderSignal || profile.manualPayrollSignal,
      }).length +
      matchedNarrativeFactIds({
        draft,
        predicate: (profile) => profile.payrollSignal || profile.payrollProviderSignal || profile.manualPayrollSignal,
      }).length,
    backgroundSupport:
      payrollCoverage !== "missing" || (typeof wagesAmount === "number" && wagesAmount > 0),
  });
  let quarterlyFilingStatus = supportStatusFromChannels({
    applicable: payrollDetected,
    structuredCount: quarterlyDocumentIds.length,
    narrativeCount:
      matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.quarterlyFilingSignal,
      }).length +
      matchedNarrativeFactIds({
        draft,
        predicate: (profile) => profile.quarterlyFilingSignal,
      }).length,
    backgroundSupport: payrollOperationalStatus === "supported" || payrollOperationalStatus === "partial",
  });
  let annualWageFormStatus = supportStatusFromChannels({
    applicable: payrollDetected,
    structuredCount: annualDocumentIds.length,
    narrativeCount:
      matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.annualWageFormSignal,
      }).length +
      matchedNarrativeFactIds({
        draft,
        predicate: (profile) => profile.annualWageFormSignal,
      }).length,
    backgroundSupport: payrollOperationalStatus === "supported" || payrollOperationalStatus === "partial",
  });
  let depositTrailStatus = supportStatusFromChannels({
    applicable: payrollDetected,
    structuredCount: depositDocumentIds.length,
    narrativeCount:
      matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.depositSignal,
      }).length +
      matchedNarrativeFactIds({
        draft,
        predicate: (profile) => profile.depositSignal,
      }).length,
    backgroundSupport:
      payrollOperationalStatus === "supported" ||
      payrollOperationalStatus === "partial" ||
      bankCoverage !== "missing" ||
      generalLedgerCoverage !== "missing",
  });
  let ownerCompensationStatus = supportStatusFromChannels({
    applicable: ownerCompApplies,
    structuredCount: ownerCompDocumentIds.length + providerDocumentIds.length,
    narrativeCount:
      matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.ownerCompSignal,
      }).length +
      matchedNarrativeFactIds({
        draft,
        predicate: (profile) => profile.ownerCompSignal,
      }).length,
    backgroundSupport: payrollOperationalStatus !== "missing" && payrollOperationalStatus !== "not_applicable",
  });

  if (hasExplicitComplianceGap && quarterlyFilingStatus === "supported") {
    quarterlyFilingStatus = "partial";
  }
  if (hasExplicitComplianceGap && annualWageFormStatus === "supported") {
    annualWageFormStatus = "partial";
  }
  if (hasExplicitComplianceGap && depositTrailStatus === "supported") {
    depositTrailStatus = "partial";
  }
  if (
    hasExplicitComplianceGap &&
    ownerCompApplies &&
    ownerCompensationStatus === "supported" &&
    ownerCompDocumentIds.length === 0
  ) {
    ownerCompensationStatus = "partial";
  }

  const workerClassification =
    payrollDetected && contractorDetected
      ? "mixed"
      : payrollDetected
        ? "payroll_only"
        : contractorDetected
          ? "contractor_only"
          : draft.profile.hasPayroll || draft.profile.paysContractors || ownerCompApplies
            ? "unclear"
            : "none";

  const channels: TinaPayrollComplianceChannel[] = [
    buildChannel({
      id: "payroll-reports",
      kind: "payroll_reports",
      supportStatus: payrollOperationalStatus,
      structuredDocumentIds: unique([
        ...payrollSignalDocumentIds,
        ...providerDocumentIds,
        ...manualPayrollDocumentIds,
      ]),
      narrativeDocumentIds: matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.payrollSignal || profile.payrollProviderSignal || profile.manualPayrollSignal,
      }),
      relatedFactIds: unique([
        ...payrollSignalFactIds,
        ...providerFactIds,
        ...manualPayrollFactIds,
      ]),
      summary: summaryForSupport("Payroll registers or payroll operations", payrollOperationalStatus),
    }),
    buildChannel({
      id: "quarterly-filings",
      kind: "quarterly_filings",
      supportStatus: quarterlyFilingStatus,
      structuredDocumentIds: quarterlyDocumentIds,
      narrativeDocumentIds: matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.quarterlyFilingSignal,
      }),
      relatedFactIds: quarterlyFactIds,
      summary: summaryForSupport("Quarterly payroll filings", quarterlyFilingStatus),
    }),
    buildChannel({
      id: "annual-wage-forms",
      kind: "annual_wage_forms",
      supportStatus: annualWageFormStatus,
      structuredDocumentIds: annualDocumentIds,
      narrativeDocumentIds: matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.annualWageFormSignal,
      }),
      relatedFactIds: annualFactIds,
      summary: summaryForSupport("Annual wage forms", annualWageFormStatus),
    }),
    buildChannel({
      id: "deposit-trail",
      kind: "deposit_trail",
      supportStatus: depositTrailStatus,
      structuredDocumentIds: depositDocumentIds,
      narrativeDocumentIds: matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.depositSignal,
      }),
      relatedFactIds: depositFactIds,
      summary: summaryForSupport("Payroll tax deposits", depositTrailStatus),
    }),
    buildChannel({
      id: "bank-activity",
      kind: "bank_activity",
      supportStatus: payrollDetected
        ? bankCoverage === "covered"
          ? "supported"
          : bankCoverage === "partial"
            ? "partial"
            : "missing"
        : "not_applicable",
      structuredDocumentIds:
        bankCoverage === "missing"
          ? []
          : accountingArtifactCoverage.items.find((item) => item.id === "bank-statements")?.matchedDocumentIds ?? [],
      relatedFactIds:
        bankCoverage === "missing"
          ? []
          : accountingArtifactCoverage.items.find((item) => item.id === "bank-statements")?.matchedFactIds ?? [],
      summary: summaryForSupport(
        "Bank-side wage or deposit support",
        payrollDetected
          ? bankCoverage === "covered"
            ? "supported"
            : bankCoverage === "partial"
              ? "partial"
              : "missing"
          : "not_applicable"
      ),
    }),
    buildChannel({
      id: "general-ledger",
      kind: "general_ledger",
      supportStatus: payrollDetected || contractorDetected
        ? generalLedgerCoverage === "covered"
          ? "supported"
          : generalLedgerCoverage === "partial"
            ? "partial"
            : "missing"
        : "not_applicable",
      structuredDocumentIds:
        generalLedgerCoverage === "missing"
          ? []
          : accountingArtifactCoverage.items.find((item) => item.id === "general-ledger")?.matchedDocumentIds ?? [],
      relatedFactIds:
        generalLedgerCoverage === "missing"
          ? []
          : accountingArtifactCoverage.items.find((item) => item.id === "general-ledger")?.matchedFactIds ?? [],
      summary: summaryForSupport(
        "Ledger-side payroll support",
        payrollDetected || contractorDetected
          ? generalLedgerCoverage === "covered"
            ? "supported"
            : generalLedgerCoverage === "partial"
              ? "partial"
              : "missing"
          : "not_applicable"
      ),
    }),
    buildChannel({
      id: "contractor-support",
      kind: "contractor_support",
      supportStatus: contractorDetected
        ? contractorCoverage === "covered"
          ? "supported"
          : contractorCoverage === "partial"
            ? "partial"
            : contractorDocumentIds.length > 0
              ? "supported"
              : "missing"
        : "not_applicable",
      structuredDocumentIds: contractorDocumentIds,
      narrativeDocumentIds: matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.contractorSignal,
      }),
      relatedFactIds: contractorFactIds,
      summary: summaryForSupport(
        "Contractor-payment support",
        contractorDetected
          ? contractorCoverage === "covered"
            ? "supported"
            : contractorCoverage === "partial"
              ? "partial"
              : contractorDocumentIds.length > 0
                ? "supported"
                : "missing"
          : "not_applicable"
      ),
    }),
    buildChannel({
      id: "owner-comp-support",
      kind: "owner_comp_support",
      supportStatus: ownerCompensationStatus,
      structuredDocumentIds: unique([...ownerCompDocumentIds, ...providerDocumentIds]),
      narrativeDocumentIds: matchedNarrativeDocumentIds({
        draft,
        predicate: (profile) => profile.ownerCompSignal,
      }),
      relatedFactIds: unique([...ownerCompFactIds, ...providerFactIds]),
      summary: summaryForSupport("Owner or officer compensation support", ownerCompensationStatus),
    }),
  ].filter(
    (channel) =>
      channel.status !== "missing" ||
      [
        "payroll_reports",
        "quarterly_filings",
        "annual_wage_forms",
        "deposit_trail",
      ].includes(channel.kind)
  );

  const likelyMissingFilings: string[] = [];
  if (payrollDetected && quarterlyFilingStatus !== "supported") {
    likelyMissingFilings.push("Form 941", "Form 940");
  }
  if (payrollDetected && annualWageFormStatus !== "supported") {
    likelyMissingFilings.push("Form W-2", "Form W-3");
  }
  if (
    payrollDetected &&
    (quarterlyFilingStatus !== "supported" || depositTrailStatus !== "supported")
  ) {
    likelyMissingFilings.push("State payroll filings");
  }
  if (sCorpNoPayroll) {
    likelyMissingFilings.push("Form 941", "Form 940", "Form W-2", "Form W-3", "State payroll filings");
  }

  const questions: string[] = [];
  if (payrollDetected && quarterlyFilingStatus !== "supported") {
    questions.push("Which quarters were actually run through payroll?");
  }
  if (payrollDetected && depositTrailStatus !== "supported") {
    questions.push("Which payroll tax deposits actually cleared?");
  }
  if (payrollDetected && annualWageFormStatus !== "supported") {
    questions.push("Were year-end wage forms filed and matched to the payroll registers?");
  }
  if (workerClassification === "mixed") {
    questions.push("Which workers were true W-2 employees versus 1099 contractors?");
  }
  if (ownerCompApplies && ownerCompensationStatus !== "supported") {
    questions.push("Was owner or officer compensation run through payroll or booked as draws?");
  }
  if (singleOwnerCorporateRoute.payrollRequirementStatus !== "not_applicable") {
    questions.push(...singleOwnerCorporateRoute.questions);
  }

  const cleanupStepsFirst: string[] = [];
  if (payrollDetected) {
    cleanupStepsFirst.push(
      "Reconcile payroll registers, tax deposits, quarterly filings, and annual wage forms before final return prep."
    );
  }
  if (workerClassification === "mixed") {
    cleanupStepsFirst.push(
      "Separate W-2 payroll labor, officer compensation, and 1099 contractor payments before trusting labor deductions."
    );
  }
  if (workerClassification === "contractor_only") {
    cleanupStepsFirst.push(
      "Keep contractor treatment provisional until facts prove payroll actually existed."
    );
  }
  cleanupStepsFirst.push(...singleOwnerCorporateRoute.cleanupStepsFirst);

  const issues: TinaPayrollComplianceIssue[] = [];
  const payrollGapRelatedDocumentIds = unique([
    ...quarterlyDocumentIds,
    ...annualDocumentIds,
    ...depositDocumentIds,
    ...complianceGapDocumentIds,
  ]);
  const payrollGapRelatedFactIds = unique([
    ...quarterlyFactIds,
    ...annualFactIds,
    ...depositFactIds,
    ...complianceGapFactIds,
  ]);

  if (
    payrollDetected &&
    (
      signalProfile.missedComplianceSignal ||
      complianceGapDocumentIds.length > 0 ||
      quarterlyFilingStatus === "missing" ||
      annualWageFormStatus === "missing"
    )
  ) {
    issues.push(
      buildIssue({
        id: "payroll-compliance-gap",
        title: "Payroll existed, but the compliance trail is broken or missing",
        status: "blocked",
        summary:
          "Tina sees payroll operations without a clean quarterly, annual, or deposit trail, so payroll compliance debt stays open.",
        likelyImpact:
          "Missed payroll filings or deposits can create penalties and change how much trust Tina should place in wage deductions.",
        relatedDocumentIds: payrollGapRelatedDocumentIds,
        relatedFactIds: payrollGapRelatedFactIds,
      })
    );
  } else if (
    payrollDetected &&
    (
      quarterlyFilingStatus === "partial" ||
      annualWageFormStatus === "partial" ||
      depositTrailStatus === "partial"
    )
  ) {
    issues.push(
      buildIssue({
        id: "payroll-compliance-thin",
        title: "Payroll compliance support is present but still incomplete",
        status: "needs_review",
        summary:
          "Tina sees payroll support, but one or more payroll compliance layers still need reviewer-controlled cleanup.",
        likelyImpact:
          "Incomplete payroll filings or deposit support can make wage deductions look cleaner than they really are.",
        relatedDocumentIds: payrollGapRelatedDocumentIds,
        relatedFactIds: payrollGapRelatedFactIds,
      })
    );
  }

  if (sCorpNoPayroll) {
    issues.push(
      buildIssue({
        id: "single-owner-s-corp-no-payroll",
        title: "Single-owner S-corp posture exists without payroll support",
        status: "blocked",
        summary:
          "Tina sees single-owner S-corp pressure with an active owner story, but no payroll trail strong enough to trust wages versus draws or distributions.",
        likelyImpact:
          "Reasonable-comp, payroll-filing exposure, and distribution characterization can all be wrong if Tina lets this file sound clean.",
        relatedDocumentIds: singleOwnerCorporateRoute.relatedDocumentIds,
        relatedFactIds: singleOwnerCorporateRoute.relatedFactIds,
      })
    );
  } else if (
    singleOwnerCorporateRoute.overallStatus === "review_required" &&
    singleOwnerCorporateRoute.payrollRequirementStatus === "review_required"
  ) {
    issues.push(
      buildIssue({
        id: "single-owner-corporate-payroll-pressure",
        title: "Single-owner corporate route still needs payroll proof",
        status: "needs_review",
        summary:
          "Tina sees single-owner corporate pressure, but the payroll account, filings, and owner-pay treatment are still too thin to treat as settled.",
        likelyImpact:
          "Even when wages are booked, a thin payroll trail can hide election, payroll-filing, or reasonable-comp problems.",
        relatedDocumentIds: singleOwnerCorporateRoute.relatedDocumentIds,
        relatedFactIds: singleOwnerCorporateRoute.relatedFactIds,
      })
    );
  }

  if (workerClassification === "mixed") {
    issues.push(
      buildIssue({
        id: "payroll-worker-overlap",
        title: "Payroll and contractor flows overlap",
        status: workerNormalizationIssue?.severity === "blocking" ? "blocked" : "needs_review",
        summary:
          "Tina sees both payroll and contractor labor and should keep worker classification under reviewer control until the boundary is explicit.",
        likelyImpact:
          "Overlapping worker categories can duplicate deductions or hide payroll exposure.",
        relatedDocumentIds: unique([
          ...contractorDocumentIds,
          ...payrollSignalDocumentIds,
          ...(workerNormalizationIssue?.documentIds ?? []),
        ]),
        relatedFactIds: unique([
          ...contractorFactIds,
          ...payrollSignalFactIds,
          ...(workerNormalizationIssue?.factIds ?? []),
        ]),
      })
    );
  }

  if (ownerCompApplies && ownerCompensationStatus !== "supported") {
    issues.push(
      buildIssue({
        id: "owner-comp-unsettled",
        title: "Owner compensation posture is still unsettled",
        status: ownerCompensationStatus === "missing" ? "blocked" : "needs_review",
        summary:
          "Tina sees owner-compensation pressure, but the file still does not prove whether pay was run through payroll or left in draws/distributions.",
        likelyImpact:
          "Owner-comp treatment can change reasonable-comp posture, payroll exposure, and distribution characterization.",
        relatedDocumentIds: ownerCompDocumentIds,
        relatedFactIds: ownerCompFactIds,
      })
    );
  }

  const blockedIssueCount = issues.filter((issue) => issue.status === "blocked").length;
  const reviewIssueCount = issues.filter((issue) => issue.status === "needs_review").length;

  const posture: TinaPayrollComplianceSnapshot["posture"] =
    workerClassification === "contractor_only" && !payrollDetected
      ? "contractor_likely"
      : workerClassification === "mixed"
        ? "mixed_worker_flows"
        : sCorpNoPayroll
          ? "s_corp_no_payroll"
        : blockedIssueCount > 0
          ? "payroll_with_compliance_gaps"
          : reviewIssueCount > 0 || workerClassification === "unclear"
            ? "reviewer_controlled"
            : payrollDetected
              ? "payroll_supported"
              : "no_payroll_detected";

  const overallStatus: TinaPayrollComplianceSnapshot["overallStatus"] =
    posture === "no_payroll_detected" || posture === "contractor_likely"
      ? "not_applicable"
      : blockedIssueCount > 0
        ? "blocked"
        : reviewIssueCount > 0 || workerClassification === "mixed" || workerClassification === "unclear"
          ? "needs_review"
          : "supported";

  const summary =
    overallStatus === "not_applicable"
      ? posture === "contractor_likely"
        ? "Tina sees contractor-only labor more strongly than a real payroll compliance trail."
        : "Tina does not currently see a real payroll compliance story in this file."
      : posture === "s_corp_no_payroll"
        ? "Tina sees single-owner S-corp pressure without payroll support and should fail closed."
      : overallStatus === "supported"
        ? "Tina sees a coherent payroll story with operational, filing, and wage-form support."
        : overallStatus === "needs_review"
          ? "Tina sees payroll pressure, but payroll classification or compliance still needs reviewer control."
          : "Tina sees payroll activity with missing or broken compliance support and should fail closed.";

  const nextStep =
    overallStatus === "supported"
      ? "Carry this payroll truth into books, confidence, and reviewer artifacts without widening the claim."
      : overallStatus === "not_applicable"
        ? "Keep payroll out of scope unless new labor facts prove otherwise."
        : posture === "s_corp_no_payroll"
          ? "Resolve election proof, payroll setup, and owner-pay treatment before Tina trusts this S-corp story."
          : "Settle payroll filings, deposits, and worker classification before Tina treats labor costs as clean.";

  const relatedDocumentIds = unique([
    ...channels.flatMap((channel) => channel.relatedDocumentIds),
    ...issues.flatMap((issue) => issue.relatedDocumentIds),
  ]);
  const relatedFactIds = unique([
    ...channels.flatMap((channel) => channel.relatedFactIds),
    ...issues.flatMap((issue) => issue.relatedFactIds),
  ]);

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    posture,
    summary,
    nextStep,
    workerClassification,
    payrollOperationalStatus,
    quarterlyFilingStatus,
    annualWageFormStatus,
    depositTrailStatus,
    ownerCompensationStatus,
    payrollProviderSignal: signalProfile.payrollProviderSignal || providerDocumentIds.length > 0,
    manualPayrollSignal: signalProfile.manualPayrollSignal || manualPayrollDocumentIds.length > 0,
    blockedIssueCount,
    reviewIssueCount,
    likelyMissingFilings: unique(likelyMissingFilings),
    questions: unique(questions),
    cleanupStepsFirst: unique(cleanupStepsFirst),
    channels,
    issues,
    relatedDocumentIds,
    relatedFactIds,
  };
}
