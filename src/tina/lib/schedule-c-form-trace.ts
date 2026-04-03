import { buildTinaScheduleCDraft } from "@/tina/lib/schedule-c-draft";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import type {
  TinaScheduleCFormTraceLine,
  TinaScheduleCFormTraceSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaScheduleCFormTraceSnapshot {
  return {
    lastBuiltAt: null,
    status: "idle",
    summary: "Tina has not built a source-to-form trace yet.",
    nextStep: "Build the Schedule C return snapshot first, then trace each form line back to evidence.",
    lines: [],
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildEvidenceSupport(args: {
  amount: number | null;
  sourceFieldCount: number;
  reviewerFinalCount: number;
  sourceDocumentCount: number;
  sourceFactCount: number;
}): Pick<TinaScheduleCFormTraceLine, "evidenceSupportLevel" | "evidenceSupportSummary"> {
  const {
    amount,
    sourceFieldCount,
    reviewerFinalCount,
    sourceDocumentCount,
    sourceFactCount,
  } = args;
  const hasAmount = typeof amount === "number" && amount !== 0;
  const directSupportCount = sourceFieldCount + reviewerFinalCount;
  const evidenceCount = sourceDocumentCount + sourceFactCount;

  if (!hasAmount && directSupportCount === 0 && evidenceCount === 0) {
    return {
      evidenceSupportLevel: "moderate",
      evidenceSupportSummary:
        "This line currently carries no amount, so Tina does not need deeper evidence support yet.",
    };
  }

  if (directSupportCount > 0 && sourceDocumentCount >= 2 && sourceFactCount > 0) {
    return {
      evidenceSupportLevel: "strong",
      evidenceSupportSummary:
        "Tina can trace this line through draft mapping, reviewer-final support, more than one supporting document, and source facts.",
    };
  }

  if (
    directSupportCount > 0 &&
    ((sourceDocumentCount > 0 && sourceFactCount > 0) ||
      sourceDocumentCount + sourceFactCount >= 2)
  ) {
    return {
      evidenceSupportLevel: "moderate",
      evidenceSupportSummary:
        "Tina can trace this line to mapped support and more than one piece of underlying evidence, but the support is still thinner than reviewer-grade ideal.",
    };
  }

  if (directSupportCount > 0 || evidenceCount > 0) {
    return {
      evidenceSupportLevel: "weak",
      evidenceSupportSummary:
        "Tina has only thin support for this line, so a skeptical reviewer may still ask for tighter evidence, cleaner mapping, or stronger fact support.",
    };
  }

  return {
    evidenceSupportLevel: "missing",
    evidenceSupportSummary:
      "Tina does not yet have enough evidence linked to defend this non-zero line cleanly under review.",
  };
}

export function buildTinaScheduleCFormTrace(
  draft: TinaWorkspaceDraft
): TinaScheduleCFormTraceSnapshot {
  const scheduleCDraft =
    draft.scheduleCDraft.status === "complete"
      ? draft.scheduleCDraft
      : buildTinaScheduleCDraft(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  if (scheduleCReturn.status !== "complete") {
    return {
      ...createEmptySnapshot(),
      lastBuiltAt: new Date().toISOString(),
      summary: "Tina cannot trace form lines until the Schedule C return snapshot exists.",
      nextStep: scheduleCReturn.nextStep,
    };
  }

  const lines: TinaScheduleCFormTraceLine[] = scheduleCReturn.fields.map((field) => {
    const sourceDraftFields = scheduleCDraft.fields.filter((draftField) =>
      field.sourceFieldIds.includes(draftField.id)
    );
    const reviewerFinalLineIds = unique(
      sourceDraftFields.flatMap((draftField) => draftField.reviewerFinalLineIds)
    );
    const reviewerFinalLines = draft.reviewerFinal.lines.filter((line) =>
      reviewerFinalLineIds.includes(line.id)
    );
    const sourceDocumentIds = unique(
      reviewerFinalLines.flatMap((line) => line.sourceDocumentIds).concat(
        sourceDraftFields.flatMap((draftField) => draftField.sourceDocumentIds)
      )
    );
    const sourceFactIds = unique(reviewerFinalLines.flatMap((line) => line.sourceFactIds));
    const evidenceSupport = buildEvidenceSupport({
      amount: field.amount,
      sourceFieldCount: field.sourceFieldIds.length,
      reviewerFinalCount: reviewerFinalLineIds.length,
      sourceDocumentCount: sourceDocumentIds.length,
      sourceFactCount: sourceFactIds.length,
    });

    return {
      id: `trace-${field.id}`,
      lineNumber: field.lineNumber,
      formKey: field.formKey,
      label: field.label,
      amount: field.amount,
      status: field.status,
      sourceFieldIds: field.sourceFieldIds,
      reviewerFinalLineIds,
      taxAdjustmentIds: unique(
        sourceDraftFields.flatMap((draftField) => draftField.taxAdjustmentIds)
      ),
      sourceDocumentIds,
      sourceFactIds,
      evidenceSupportLevel: evidenceSupport.evidenceSupportLevel,
      evidenceSupportSummary: evidenceSupport.evidenceSupportSummary,
    };
  });

  const tracedLines = lines.filter(
    (line) =>
      line.sourceFieldIds.length > 0 ||
      line.reviewerFinalLineIds.length > 0 ||
      line.sourceDocumentIds.length > 0
  ).length;

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    summary: `Tina traced ${tracedLines} of ${lines.length} Schedule C form line${
      lines.length === 1 ? "" : "s"
    } back to draft fields and evidence.`,
    nextStep:
      tracedLines === lines.length
        ? "Reviewer can inspect line-by-line traceability before signoff."
        : "Fill the remaining source-to-form gaps before treating the package as reviewer-grade.",
    lines,
  };
}
