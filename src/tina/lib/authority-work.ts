import { buildTinaAuthorityTrails } from "@/tina/lib/authority-trails";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import type {
  TinaAuthorityCitation,
  TinaAuthorityDisclosureDecision,
  TinaAuthorityReviewerDecision,
  TinaAuthorityWorkItem,
  TinaAuthorityWorkStatus,
  TinaWorkspaceDraft,
} from "@/tina/types";

export interface TinaAuthorityWorkItemView extends TinaAuthorityWorkItem {
  title: string;
  summary: string;
  nextStep: string;
  memoFocus: string;
  reviewerQuestion: string;
  authorityTargets: string[];
  documentIds: string[];
  factIds: string[];
}

export interface TinaAuthorityResearchRunResult {
  memo: string;
  citations: TinaAuthorityCitation[];
  missingAuthority: string[];
  status: TinaAuthorityWorkStatus;
  reviewerDecision: TinaAuthorityReviewerDecision;
  disclosureDecision: TinaAuthorityDisclosureDecision;
  lastAiRunAt: string;
}

function createRandomId(prefix: string): string {
  const generated =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${generated}`;
}

function defaultStatusFromTrail(
  reviewerState: "not_ready" | "review_needed" | "can_consider" | "do_not_use"
): TinaAuthorityWorkStatus {
  switch (reviewerState) {
    case "can_consider":
    case "review_needed":
      return "ready_for_reviewer";
    case "do_not_use":
      return "rejected";
    default:
      return "not_started";
  }
}

function defaultDisclosureDecisionFromTrail(
  disclosureFlag: "not_needed_yet" | "review_if_supported" | "likely_needed" | "not_applicable"
): TinaAuthorityDisclosureDecision {
  switch (disclosureFlag) {
    case "review_if_supported":
    case "likely_needed":
      return "needs_review";
    case "not_applicable":
      return "not_needed";
    default:
      return "unknown";
  }
}

function defaultReviewerDecisionFromStatus(
  status: TinaAuthorityWorkStatus
): TinaAuthorityReviewerDecision {
  if (status === "rejected") return "do_not_use";
  return "pending";
}

export function createDefaultTinaAuthorityCitation(): TinaAuthorityCitation {
  return {
    id: createRandomId("authority-citation"),
    title: "",
    url: "",
    sourceClass: "primary_authority",
    effect: "supports",
    note: "",
  };
}

export function createDefaultTinaAuthorityWorkItem(
  ideaId: string,
  options?: {
    status?: TinaAuthorityWorkStatus;
    disclosureDecision?: TinaAuthorityDisclosureDecision;
    reviewerDecision?: TinaAuthorityReviewerDecision;
  }
): TinaAuthorityWorkItem {
  const status = options?.status ?? "not_started";
  return {
    ideaId,
    status,
    reviewerDecision: options?.reviewerDecision ?? defaultReviewerDecisionFromStatus(status),
    disclosureDecision: options?.disclosureDecision ?? "unknown",
    memo: "",
    reviewerNotes: "",
    missingAuthority: [],
    citations: [],
    lastAiRunAt: null,
    updatedAt: null,
  };
}

function citationKey(citation: TinaAuthorityCitation): string {
  const urlKey = citation.url.trim().toLowerCase();
  return urlKey || citation.title.trim().toLowerCase();
}

function mergeCitations(
  existing: TinaAuthorityCitation[],
  incoming: TinaAuthorityCitation[]
): TinaAuthorityCitation[] {
  const merged = new Map<string, TinaAuthorityCitation>();

  existing.forEach((citation) => {
    merged.set(citationKey(citation), citation);
  });

  incoming.forEach((citation) => {
    const key = citationKey(citation);
    const current = merged.get(key);

    if (!current) {
      merged.set(key, citation);
      return;
    }

    merged.set(key, {
      ...current,
      title: current.title || citation.title,
      url: current.url || citation.url,
      sourceClass: current.sourceClass || citation.sourceClass,
      effect: current.effect || citation.effect,
      note: current.note || citation.note,
    });
  });

  return Array.from(merged.values());
}

function stampWorkItem(workItem: TinaAuthorityWorkItem): TinaAuthorityWorkItem {
  return {
    ...workItem,
    updatedAt: new Date().toISOString(),
  };
}

export function upsertTinaAuthorityWorkItem(
  authorityWork: TinaAuthorityWorkItem[],
  workItem: TinaAuthorityWorkItem
): TinaAuthorityWorkItem[] {
  const withoutExisting = authorityWork.filter((item) => item.ideaId !== workItem.ideaId);
  return [stampWorkItem(workItem), ...withoutExisting];
}

export function mergeTinaAuthorityResearchRun(
  current: TinaAuthorityWorkItem,
  result: TinaAuthorityResearchRunResult
): TinaAuthorityWorkItem {
  return stampWorkItem({
    ...current,
    status: result.status,
    reviewerDecision:
      current.reviewerDecision === "use_it" || current.reviewerDecision === "do_not_use"
        ? current.reviewerDecision
        : result.reviewerDecision,
    disclosureDecision: result.disclosureDecision,
    memo: result.memo,
    missingAuthority: result.missingAuthority,
    citations: mergeCitations(current.citations, result.citations),
    lastAiRunAt: result.lastAiRunAt,
  });
}

export function buildTinaAuthorityWorkItems(
  draft: TinaWorkspaceDraft
): TinaAuthorityWorkItemView[] {
  const dossiers = buildTinaResearchDossiers(draft);
  const trails = buildTinaAuthorityTrails(draft);
  const trailMap = new Map(trails.map((trail) => [trail.id, trail]));
  const existingMap = new Map(draft.authorityWork.map((item) => [item.ideaId, item]));

  return dossiers.map((dossier) => {
    const trail = trailMap.get(dossier.id);
    const existing = existingMap.get(dossier.id);
    const defaultStatus = defaultStatusFromTrail(trail?.reviewerState ?? "not_ready");
    const defaultDisclosureDecision = defaultDisclosureDecisionFromTrail(
      trail?.disclosureFlag ?? "not_needed_yet"
    );
    const base = existing
      ? existing
      : createDefaultTinaAuthorityWorkItem(dossier.id, {
          status: defaultStatus,
          disclosureDecision: defaultDisclosureDecision,
          reviewerDecision: defaultReviewerDecisionFromStatus(defaultStatus),
        });

    const normalizedStatus =
      base.status === "not_started" &&
      (
        base.memo.trim().length > 0 ||
        base.citations.length > 0 ||
        base.reviewerNotes.trim().length > 0 ||
        base.missingAuthority.length > 0
      )
        ? "researching"
        : base.status;

    return {
      ...base,
      status: normalizedStatus,
      title: dossier.title,
      summary: dossier.summary,
      nextStep: dossier.nextStep,
      memoFocus: trail?.memoFocus ?? dossier.summary,
      reviewerQuestion: trail?.reviewerQuestion ?? "What still needs proof here?",
      authorityTargets: trail?.authorityTargets ?? [],
      documentIds: dossier.documentIds,
      factIds: dossier.factIds,
    };
  });
}
