import type {
  TinaIndustryEvidenceMatrixSnapshot,
  TinaIndustryEvidenceRequirement,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import type {
  TinaIndustryPlaybookItem,
  TinaSourceFact,
  TinaStoredDocument,
  TinaWorkspaceDraft,
} from "@/tina/types";

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "support",
  "records",
  "business",
  "only",
  "still",
  "need",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function materialityForRequirement(requirement: string): TinaIndustryEvidenceRequirement["materiality"] {
  if (/inventory|sales tax|loan|settlement|owner|worker|payroll/i.test(requirement)) {
    return "high";
  }

  if (/travel|equipment|invoice|receivable|payout/i.test(requirement)) {
    return "medium";
  }

  return "low";
}

function matchedDocuments(
  requirement: string,
  documents: TinaStoredDocument[]
): TinaStoredDocument[] {
  const tokens = tokenize(requirement);
  return documents.filter((document) => {
    const haystack = normalize(`${document.name} ${document.requestLabel ?? ""}`);
    return tokens.some((token) => haystack.includes(token));
  });
}

function matchedFacts(
  requirement: string,
  sourceFacts: TinaSourceFact[]
): TinaSourceFact[] {
  const tokens = tokenize(requirement);
  return sourceFacts.filter((fact) => {
    const haystack = normalize(`${fact.label} ${fact.value}`);
    return tokens.some((token) => haystack.includes(token));
  });
}

function buildRequirement(args: {
  playbook: TinaIndustryPlaybookItem;
  requirement: string;
  documents: TinaStoredDocument[];
  sourceFacts: TinaSourceFact[];
  index: number;
}): TinaIndustryEvidenceRequirement {
  const docs = matchedDocuments(args.requirement, args.documents);
  const facts = matchedFacts(args.requirement, args.sourceFacts);
  const status =
    docs.length > 0 && facts.length > 0
      ? "covered"
      : docs.length > 0 || facts.length > 0
        ? "partial"
        : "missing";

  return {
    id: `${args.playbook.id}-requirement-${args.index + 1}`,
    playbookId: args.playbook.id,
    playbookTitle: args.playbook.title,
    requirement: args.requirement,
    status,
    materiality: materialityForRequirement(args.requirement),
    summary:
      status === "covered"
        ? "Tina found both document and fact support for this industry-specific record need."
        : status === "partial"
          ? "Tina found some support for this industry-specific record need, but the file is still thin."
          : "Tina does not yet have visible support for this industry-specific record need.",
    matchedDocumentIds: unique(docs.map((document) => document.id)),
    matchedFactIds: unique(facts.map((fact) => fact.id)),
  };
}

export function buildTinaIndustryEvidenceMatrix(
  draft: TinaWorkspaceDraft
): TinaIndustryEvidenceMatrixSnapshot {
  const playbooks = buildTinaIndustryPlaybooks(draft);
  const scopedPlaybooks = playbooks.items.filter(
    (item) => item.fit === "primary" || item.fit === "secondary"
  );
  const items =
    scopedPlaybooks.length > 0
      ? scopedPlaybooks.flatMap((playbook) =>
          playbook.requiredRecords.map((requirement, index) =>
            buildRequirement({
              playbook,
              requirement,
              documents: draft.documents,
              sourceFacts: draft.sourceFacts,
              index,
            })
          )
        )
      : [];

  const missingCount = items.filter((item) => item.status === "missing").length;
  const partialCount = items.filter((item) => item.status === "partial").length;
  const overallStatus =
    missingCount > 0 ? "missing" : partialCount > 0 ? "partial" : "covered";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    primaryIndustryId: playbooks.primaryIndustryId,
    overallStatus,
    summary:
      items.length === 0
        ? "Tina does not yet have an industry-specific evidence matrix for this file."
        : overallStatus === "covered"
          ? "Tina has document-and-fact coverage for the current primary industry record needs."
          : overallStatus === "partial"
            ? `Tina has partial coverage on ${partialCount} industry-specific record need${
                partialCount === 1 ? "" : "s"
              }.`
            : `Tina is still missing ${missingCount} industry-specific record need${
                missingCount === 1 ? "" : "s"
              }.`,
    nextStep:
      items.length === 0
        ? "Keep gathering business-detail facts until Tina can anchor the file to a sharper industry playbook."
        : overallStatus === "covered"
          ? "Use this matrix to keep industry-specific reviewer asks and planning grounded in real records."
          : "Use the missing and partial industry record needs to drive the next owner document requests.",
    items,
  };
}
