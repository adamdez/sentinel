import type {
  TinaDocumentIntelligenceSnapshot,
  TinaEntityEconomicsProof,
  TinaEntityLaneExecutionSnapshot,
  TinaReturnFamilyAssembly,
} from "@/tina/lib/acceleration-contracts";
import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceExtractedFacts,
} from "@/tina/lib/document-intelligence";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEntityReturnRunbook } from "@/tina/lib/entity-return-runbook";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaOfficialFederalFormTemplateSnapshot } from "@/tina/lib/official-form-templates";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import type { TinaOfficialFederalFormId, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildEconomicsProof(
  proof: TinaEntityEconomicsProof
): TinaEntityEconomicsProof {
  return {
    ...proof,
    relatedCheckIds: unique(proof.relatedCheckIds),
    relatedRecordIds: unique(proof.relatedRecordIds),
    relatedDocumentIds: unique(proof.relatedDocumentIds),
  };
}

function attachmentIdsForLane(laneId: string): TinaOfficialFederalFormId[] {
  if (laneId === "schedule_c_single_member_llc") {
    return ["f1040sse", "f4562", "f8829"];
  }
  return [];
}

function relevantEventIdsForCheck(checkId: string): string[] {
  if (/roster|ownership|owner|shareholder/i.test(checkId)) {
    return ["opening-ownership", "ownership-change", "closing-ownership"];
  }

  if (/transfer|buyout|redemption/i.test(checkId)) {
    return ["ownership-change", "buyout-redemption", "former-owner-payments", "closing-ownership"];
  }

  if (/capital|equity/i.test(checkId)) {
    return ["capital-economics", "buyout-redemption", "closing-ownership"];
  }

  if (/payment|distribution|compensation|loan/i.test(checkId)) {
    return ["former-owner-payments", "capital-economics", "buyout-redemption"];
  }

  return [];
}

function relevantDocumentRoleCount(
  checkId: string,
  documentIntelligence: TinaDocumentIntelligenceSnapshot
): number {
  const relevantRoles =
    /roster|ownership|owner|shareholder/i.test(checkId)
      ? ["operating_agreement", "cap_table", "ownership_schedule"]
      : /transfer|buyout|redemption|capital|equity/i.test(checkId)
        ? ["operating_agreement", "cap_table", "ownership_schedule", "related_party_agreement"]
        : /payment|distribution|compensation|loan/i.test(checkId)
          ? ["payroll_report", "related_party_agreement", "books_ledger"]
          : [];

  return documentIntelligence.items.filter(
    (item) =>
      item.status !== "signal_only" &&
      item.roles.some((role) => relevantRoles.includes(role))
  ).length;
}

function relevantExtractCount(
  checkId: string,
  documentIntelligence: TinaDocumentIntelligenceSnapshot
): number {
  const relevantKinds =
    /roster|ownership|owner|shareholder/i.test(checkId)
      ? ["ownership_signal", "identity_signal"]
      : /transfer|buyout|redemption|capital|equity/i.test(checkId)
        ? ["ownership_signal", "related_party_signal", "identity_signal"]
        : /payment|distribution|compensation|loan/i.test(checkId)
          ? ["payroll_signal", "related_party_signal", "identity_signal"]
          : [];

  return listTinaDocumentIntelligenceExtractedFacts(documentIntelligence).filter((fact) =>
    relevantKinds.includes(fact.kind)
  ).length;
}

function buildProofStatus(args: {
  checkId: string;
  checkStatus:
    | TinaEntityEconomicsProof["status"]
    | "clear"
    | "needs_review"
    | "blocked"
    | "not_applicable";
  relatedRecordIds: string[];
  relatedDocumentIds: string[];
  recordMatrix: ReturnType<typeof buildTinaEntityRecordMatrix>;
  ownershipCapitalEvents: ReturnType<typeof buildTinaOwnershipCapitalEvents>;
  documentIntelligence: TinaDocumentIntelligenceSnapshot;
}): TinaEntityEconomicsProof["status"] {
  if (args.checkStatus === "clear") {
    return "proved";
  }

  if (args.checkStatus === "not_applicable") {
    return "proved";
  }

  if (args.checkStatus === "needs_review") {
    return "partial";
  }

  const relatedRecords = args.recordMatrix.items.filter((item) =>
    args.relatedRecordIds.includes(item.id)
  );
  const relevantEvents = args.ownershipCapitalEvents.events.filter((event) =>
    relevantEventIdsForCheck(args.checkId).includes(event.id)
  );
  const coveredRecordCount = relatedRecords.filter((record) => record.status === "covered").length;
  const partialRecordCount = relatedRecords.filter((record) => record.status === "partial").length;
  const supportingDocumentCount = unique([
    ...args.relatedDocumentIds,
    ...relatedRecords.flatMap((record) => record.matchedDocumentIds),
    ...relevantEvents.flatMap((event) => event.relatedDocumentIds),
  ]).length;
  const structuredRoleCount = relevantDocumentRoleCount(
    args.checkId,
    args.documentIntelligence
  );
  const extractedFactCount = relevantExtractCount(args.checkId, args.documentIntelligence);
  const eventSignalCount = relevantEvents.length;

  if (
    coveredRecordCount > 0 ||
    partialRecordCount > 0 ||
    supportingDocumentCount > 0 ||
    structuredRoleCount > 0 ||
    extractedFactCount > 0 ||
    eventSignalCount > 0
  ) {
    if (
      args.checkStatus === "blocked" &&
      coveredRecordCount === 0 &&
      partialRecordCount === 0 &&
      supportingDocumentCount === 0 &&
      structuredRoleCount >= 2 &&
      extractedFactCount === 0
    ) {
      return "partial";
    }

    return "partial";
  }

  return "missing";
}

export function buildTinaEntityLaneExecution(
  draft: TinaWorkspaceDraft
): TinaEntityLaneExecutionSnapshot {
  const runbook = buildTinaEntityReturnRunbook(draft);
  const requirements = buildTinaFederalReturnRequirements(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const recordMatrix = buildTinaEntityRecordMatrix(draft);
  const economicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const ownershipCapitalEvents = buildTinaOwnershipCapitalEvents(draft);
  const templateSnapshot = buildTinaOfficialFederalFormTemplateSnapshot(draft);
  const primaryTemplate =
    templateSnapshot.templates.find((template) => template.role === "primary_return") ?? null;
  const companionFormIds = templateSnapshot.templates
    .filter((template) => template.role === "companion_schedule")
    .map((template) => template.id) as TinaOfficialFederalFormId[];
  const attachmentFormIds = unique([
    ...templateSnapshot.templates
      .filter((template) => template.role === "attachment")
      .map((template) => template.id),
    ...attachmentIdsForLane(requirements.laneId),
  ]) as TinaOfficialFederalFormId[];
  const assemblyStatus =
    runbook.executionMode === "blocked"
      ? "blocked"
      : runbook.overallStatus === "ready"
        ? "ready"
        : "review_required";
  const assembly: TinaReturnFamilyAssembly = {
    laneId: requirements.laneId,
    returnFamily: requirements.returnFamily,
    status: assemblyStatus,
    primaryFormId: primaryTemplate?.id ?? null,
    companionFormIds,
    attachmentFormIds,
    requiredRecordIds: recordMatrix.items.map((item) => item.id),
    blockedReasonIds: economicsReadiness.checks
      .filter((check) => check.status === "blocked")
      .map((check) => check.id),
    summary:
      assemblyStatus === "ready"
        ? `${requirements.returnFamily} has a coherent form-family assembly for the current lane.`
        : assemblyStatus === "review_required"
          ? `${requirements.returnFamily} has a coherent form family, but reviewer-owned gaps still remain.`
          : `${requirements.returnFamily} is still blocked by lane, record, or economics gaps.`,
  };
  const economicsProofs = economicsReadiness.checks.map((check) =>
    buildEconomicsProof({
      id: check.id,
      title: check.title,
      status: buildProofStatus({
        checkId: check.id,
        checkStatus: check.status,
        relatedRecordIds: check.relatedRecordIds,
        relatedDocumentIds: check.relatedDocumentIds,
        recordMatrix,
        ownershipCapitalEvents,
        documentIntelligence,
      }),
      summary:
        check.status === "clear"
          ? check.summary
          : check.status === "needs_review"
            ? check.summary
            : relevantDocumentRoleCount(check.id, documentIntelligence) > 0 ||
                relevantExtractCount(check.id, documentIntelligence) > 0
              ? "Tina still blocks this economics area for execution, but deeper structured papers and extracted document facts already preserve partial proof for reviewer control."
              : "Tina still blocks this economics area for execution, but she has partial proof to preserve for reviewer control.",
      relatedCheckIds: [check.id],
      relatedRecordIds: check.relatedRecordIds,
      relatedDocumentIds: check.relatedDocumentIds,
    })
  );

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: requirements.laneId,
    executionMode: runbook.executionMode,
    overallStatus:
      assembly.status === "blocked"
        ? "blocked"
        : economicsProofs.some((proof) => proof.status === "missing")
          ? "review_required"
          : runbook.overallStatus,
    summary:
      assembly.status === "ready"
        ? "Tina has a lane execution package that names the full return family and the economics proof burden."
        : assembly.status === "review_required"
          ? "Tina has a lane execution package, but the reviewer still owns some economics or record completion."
          : "Tina still cannot treat this lane as execution-ready because records or economics are blocking.",
    nextStep:
      assembly.status === "ready"
        ? "Use the lane execution package to drive return-family packaging and reviewer handoff."
        : "Clear the missing economics proofs or critical records before treating the lane as coherent.",
    assembly,
    economicsProofs,
  };
}
