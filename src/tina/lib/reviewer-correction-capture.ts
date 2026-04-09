import {
  createTinaReviewerOutcomeRecord,
  createTinaReviewerOverrideRecord,
} from "@/tina/lib/reviewer-outcomes";
import type {
  TinaReviewerOutcomeCaseTag,
  TinaReviewerOutcomePhase,
  TinaReviewerOutcomeRecord,
  TinaReviewerOutcomeVerdict,
  TinaReviewerOverrideRecord,
  TinaReviewerOverrideSeverity,
  TinaReviewerOverrideTargetType,
  TinaWorkspaceDraft,
} from "@/tina/types";

export interface TinaReviewerCorrectionTargetOption {
  value: string;
  targetType: TinaReviewerOverrideTargetType;
  targetId: string;
  label: string;
  sourceDocumentIds: string[];
}

export interface TinaReviewerCorrectionCaptureInput {
  targetType: TinaReviewerOverrideTargetType;
  targetId: string;
  targetLabel: string;
  phase: TinaReviewerOutcomePhase;
  verdict: TinaReviewerOutcomeVerdict;
  summary: string;
  lessons: string[];
  caseTags: TinaReviewerOutcomeCaseTag[];
  decidedBy: string | null;
  decidedAt?: string | null;
  sourceDocumentIds?: string[];
  beforeState?: string;
  afterState?: string;
  reason?: string;
  overrideSeverity?: TinaReviewerOverrideSeverity;
}

export interface TinaReviewerCorrectionCaptureResult {
  override: TinaReviewerOverrideRecord | null;
  outcome: TinaReviewerOutcomeRecord;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function trimOrEmpty(value: string | undefined): string {
  return value?.trim() ?? "";
}

function buildTargetOption(
  targetType: TinaReviewerOverrideTargetType,
  targetId: string,
  label: string,
  sourceDocumentIds: string[]
): TinaReviewerCorrectionTargetOption {
  return {
    value: `${targetType}:${targetId}`,
    targetType,
    targetId,
    label,
    sourceDocumentIds: dedupe(sourceDocumentIds),
  };
}

export function buildTinaReviewerCorrectionTargets(
  draft: TinaWorkspaceDraft
): TinaReviewerCorrectionTargetOption[] {
  return [
    ...draft.packageReadiness.items.map((item) =>
      buildTargetOption(
        "package_readiness_item",
        item.id,
        `Package readiness: ${item.title}`,
        item.sourceDocumentIds
      )
    ),
    ...draft.cpaHandoff.artifacts.map((artifact) =>
      buildTargetOption(
        "cpa_handoff_artifact",
        artifact.id,
        `CPA packet: ${artifact.title}`,
        artifact.sourceDocumentIds
      )
    ),
    ...draft.taxAdjustments.adjustments.map((adjustment) =>
      buildTargetOption(
        "tax_adjustment",
        adjustment.id,
        `Tax adjustment: ${adjustment.title}`,
        adjustment.sourceDocumentIds
      )
    ),
    ...draft.reviewerFinal.lines.map((line) =>
      buildTargetOption(
        "reviewer_final_line",
        line.id,
        `Reviewer-final line: ${line.label}`,
        line.sourceDocumentIds
      )
    ),
    ...draft.scheduleCDraft.fields.map((field) =>
      buildTargetOption(
        "schedule_c_field",
        field.id,
        `Schedule C field: ${field.lineNumber} ${field.label}`,
        field.sourceDocumentIds
      )
    ),
    ...draft.issueQueue.items.map((item) =>
      buildTargetOption(
        "review_item",
        item.id,
        `Issue queue: ${item.title}`,
        item.documentId ? [item.documentId] : []
      )
    ),
    ...draft.bootstrapReview.items.map((item) =>
      buildTargetOption(
        "review_item",
        item.id,
        `Bootstrap review: ${item.title}`,
        item.documentId ? [item.documentId] : []
      )
    ),
  ];
}

export function buildTinaReviewerCorrectionCapture(
  input: TinaReviewerCorrectionCaptureInput
): TinaReviewerCorrectionCaptureResult {
  const summary = trimOrEmpty(input.summary);
  const lessons = dedupe(input.lessons.map((lesson) => lesson.trim()));
  const beforeState = trimOrEmpty(input.beforeState);
  const afterState = trimOrEmpty(input.afterState);
  const reason = trimOrEmpty(input.reason);
  const decidedAt = input.decidedAt?.trim() || new Date().toISOString();
  const sourceDocumentIds = dedupe(input.sourceDocumentIds ?? []);

  const shouldCreateOverride =
    input.verdict !== "accepted" ||
    beforeState.length > 0 ||
    afterState.length > 0 ||
    reason.length > 0;

  const override =
    shouldCreateOverride
      ? createTinaReviewerOverrideRecord({
          targetType: input.targetType,
          targetId: input.targetId,
          severity: input.overrideSeverity ?? (input.verdict === "rejected" ? "blocking" : "material"),
          reason: reason || summary || `Reviewer ${input.verdict} this target.`,
          beforeState,
          afterState,
          lesson:
            lessons[0] ??
            (summary.length > 0 ? summary : `Keep ${input.targetLabel.toLowerCase()} under reviewer control.`),
          sourceDocumentIds,
          decidedAt,
          decidedBy: input.decidedBy,
        })
      : null;

  const outcome = createTinaReviewerOutcomeRecord({
    title: `${input.targetLabel} reviewer result`,
    phase: input.phase,
    verdict: input.verdict,
    targetType: input.targetType,
    targetId: input.targetId,
    summary:
      summary.length > 0
        ? summary
        : `Reviewer ${input.verdict} ${input.targetLabel.toLowerCase()}.`,
    lessons,
    caseTags: input.caseTags,
    overrideIds: override ? [override.id] : [],
    decidedAt,
    decidedBy: input.decidedBy,
  });

  return {
    override,
    outcome,
  };
}
