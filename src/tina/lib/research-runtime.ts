import type { TinaResearchDossier } from "@/tina/lib/research-dossiers";
import type { TinaWorkspaceDraft } from "@/tina/types";
import { sanitizeTinaAiText } from "@/tina/lib/ai-text-normalization";

export interface TinaResearchExecutionProfile {
  searchContextSize: "medium" | "high";
  researchReasoningEffort: "medium" | "high";
  challengeReasoningEffort: "medium" | "high";
  researchTimeoutMs: number;
  challengeTimeoutMs: number;
  scopeNote: string | null;
}

export const TINA_RESEARCH_STORED_MEMO_MAX_LENGTH = 4800;

function clipGroundingText(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const firstQuotedExample = normalized.match(/"([^"]+)"/)?.[1]?.trim();
  const exampleLead = normalized.split(/\bExamples?:\b/i)[0]?.trim();
  if (firstQuotedExample && exampleLead) {
    const compactExampleText = `${exampleLead} Example: "${firstQuotedExample}".`;
    if (compactExampleText.length <= maxLength) return compactExampleText;
  }

  const clipped = normalized.slice(0, Math.max(maxLength - 3, 1)).trimEnd();
  return `${clipped}...`;
}

function getTinaResearchScopeNote(dossierId: string): string | null {
  switch (dossierId) {
    case "fixed-assets-review":
      return "Keep this first pass narrow. Focus only on current-year purchases clearly suggested by the saved papers. Answer only whether the facts point to current deduction vs depreciation, placed-in-service timing, Section 179, and bonus depreciation. Ignore dispositions, recapture, listed property, leasing, and state conformity unless a saved fact clearly raises them.";
    case "repair-safe-harbor-review":
      return "Keep this pass narrow. Focus only on repair vs capitalization, de minimis safe harbor, and routine-maintenance-safe-harbor questions suggested by the saved papers. Do not wander into a full capitalization treatise.";
    case "de-minimis-writeoff-review":
      return "Keep this pass narrow. Focus only on de minimis safe harbor, materials-and-supplies treatment, and smaller-tool or accessory write-off treatment suggested by the saved papers.";
    case "wa-state-review":
      return "Keep the main focus on whether Washington changes the federal package or only creates a reviewer note. Do not drift into building a standalone Washington return or a full Washington tax computation unless a saved fact clearly changes the federal package.";
    case "multistate-review":
      return "Keep the main focus on whether another state changes the federal package or only creates a reviewer note. If no primary authority ties the issue back to the federal package, say that plainly. Do not drift into building full separate state returns.";
    default:
      return null;
  }
}

function createResearchExecutionProfile(args: TinaResearchExecutionProfile): TinaResearchExecutionProfile {
  return args;
}

export function getTinaResearchExecutionProfile(dossierId: string): TinaResearchExecutionProfile {
  if (
    dossierId === "fixed-assets-review" ||
    dossierId === "repair-safe-harbor-review" ||
    dossierId === "de-minimis-writeoff-review"
  ) {
    return createResearchExecutionProfile({
      searchContextSize: "medium",
      researchReasoningEffort: "medium",
      challengeReasoningEffort: "medium",
      researchTimeoutMs: 6 * 60_000,
      challengeTimeoutMs: 6 * 60_000,
      scopeNote: getTinaResearchScopeNote(dossierId),
    });
  }

  if (dossierId === "wa-state-review" || dossierId === "multistate-review") {
    return createResearchExecutionProfile({
      searchContextSize: "medium",
      researchReasoningEffort: "medium",
      challengeReasoningEffort: "medium",
      researchTimeoutMs: 5 * 60_000,
      challengeTimeoutMs: 6 * 60_000,
      scopeNote: getTinaResearchScopeNote(dossierId),
    });
  }

  return createResearchExecutionProfile({
    searchContextSize: "high",
    researchReasoningEffort: "high",
    challengeReasoningEffort: "high",
    researchTimeoutMs: 8 * 60_000,
    challengeTimeoutMs: 10 * 60_000,
    scopeNote: getTinaResearchScopeNote(dossierId),
  });
}

function normalizeTinaResearchParagraphText(value: string): string {
  return sanitizeTinaAiText(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipTinaResearchParagraphText(value: string, maxLength: number): string {
  const normalized = normalizeTinaResearchParagraphText(value);
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, Math.max(maxLength, 0));

  const clipped = normalized.slice(0, Math.max(maxLength - 3, 1)).trimEnd();
  return `${clipped}...`;
}

export function normalizeTinaStoredResearchMemo(args: {
  summary: string;
  memo: string;
  maxLength?: number;
}): string {
  const maxLength = args.maxLength ?? TINA_RESEARCH_STORED_MEMO_MAX_LENGTH;
  const summary = normalizeTinaResearchParagraphText(args.summary);
  const memo = normalizeTinaResearchParagraphText(args.memo);

  if (!summary) {
    return clipTinaResearchParagraphText(memo, maxLength);
  }

  if (!memo) {
    return clipTinaResearchParagraphText(summary, maxLength);
  }

  const combined = `${summary}\n\n${memo}`;
  if (combined.length <= maxLength) return combined;

  const reservedForSummary = Math.min(summary.length, Math.max(maxLength - 5, 1));
  const safeSummary = clipTinaResearchParagraphText(summary, reservedForSummary);
  const remainingMemoLength = maxLength - safeSummary.length - 2;
  if (remainingMemoLength <= 0) {
    return clipTinaResearchParagraphText(safeSummary, maxLength);
  }

  return `${safeSummary}\n\n${clipTinaResearchParagraphText(memo, remainingMemoLength)}`.trim();
}

export function buildTinaResearchGroundingLines(
  draft: TinaWorkspaceDraft,
  dossier: TinaResearchDossier
): string[] {
  const sourceFactLines = dossier.factIds
    .map((factId) => draft.sourceFacts.find((fact) => fact.id === factId))
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact))
    .map((fact) => {
      const prefix = `- Fact clue: ${fact.label} - `;
      return `${prefix}${clipGroundingText(fact.value, Math.max(180 - prefix.length, 60))}`;
    });

  const documentLines = dossier.documentIds
    .map((documentId) => {
      const document = draft.documents.find((item) => item.id === documentId);
      const reading = draft.documentReadings.find((item) => item.documentId === documentId);
      if (!document && !reading) return null;

      const name = document?.name ?? documentId;
      const summary = reading?.summary?.trim();
      return summary
        ? `- Saved paper: ${name} - ${clipGroundingText(summary, 140)}`
        : `- Saved paper: ${name}`;
    })
    .filter((line): line is string => Boolean(line));

  return Array.from(new Set([...sourceFactLines, ...documentLines])).slice(0, 6);
}
