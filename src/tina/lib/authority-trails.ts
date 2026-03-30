import { buildTinaResearchDossiers, type TinaResearchDossier } from "@/tina/lib/research-dossiers";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaAuthorityReviewerState =
  | "not_ready"
  | "review_needed"
  | "can_consider"
  | "do_not_use";

export type TinaAuthorityDisclosureFlag =
  | "not_needed_yet"
  | "review_if_supported"
  | "likely_needed"
  | "not_applicable";

export interface TinaAuthorityTrail {
  id: string;
  title: string;
  reviewerState: TinaAuthorityReviewerState;
  disclosureFlag: TinaAuthorityDisclosureFlag;
  authorityTargets: string[];
  summary: string;
  memoFocus: string;
  reviewerQuestion: string;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function pickAuthorityTargets(dossier: TinaResearchDossier): string[] {
  const targets = ["IRS instructions"];

  if (
    dossier.id === "wa-state-review" ||
    dossier.id === "multistate-review"
  ) {
    targets.push("Washington DOR guidance", "state statutes or rules");
  }

  if (
    dossier.id === "fixed-assets-review" ||
    dossier.id === "inventory-review" ||
    dossier.id === "qbi-review"
  ) {
    targets.push("Treasury regulations");
  }

  if (
    dossier.id === "prior-year-carryovers" ||
    dossier.id === "fixed-assets-review"
  ) {
    targets.push("prior-year return support");
  }

  if (
    dossier.id === "contractor-review" ||
    dossier.id === "payroll-review"
  ) {
    targets.push("official filing instructions");
  }

  targets.push("official court opinions if needed");
  return uniqueStrings(targets);
}

function pickReviewerState(dossier: TinaResearchDossier): TinaAuthorityReviewerState {
  switch (dossier.status) {
    case "review_ready":
      return "can_consider";
    case "needs_disclosure_review":
      return "review_needed";
    case "rejected":
      return "do_not_use";
    default:
      return "not_ready";
  }
}

function pickDisclosureFlag(dossier: TinaResearchDossier): TinaAuthorityDisclosureFlag {
  switch (dossier.status) {
    case "needs_disclosure_review":
      return "likely_needed";
    case "review_ready":
      return "review_if_supported";
    case "rejected":
      return "not_applicable";
    default:
      return "not_needed_yet";
  }
}

function buildMemoFocus(dossier: TinaResearchDossier): string {
  switch (dossier.id) {
    case "qbi-review":
      return "Confirm whether this business qualifies for QBI and whether any limits or special business rules apply.";
    case "fixed-assets-review":
      return "Confirm the right timing and method for deducting or depreciating major purchases.";
    case "inventory-review":
      return "Confirm how inventory and cost of goods should be handled for this business.";
    case "contractor-review":
      return "Confirm whether contractor costs are fully supported and whether related compliance issues affect the return.";
    case "payroll-review":
      return "Confirm whether payroll records support the deduction and whether payroll changes the filing story.";
    case "wa-state-review":
      return "Confirm whether Washington tax classification or sales-tax handling changes the federal package or needs a separate reviewer note.";
    case "multistate-review":
      return "Confirm whether another state's filing rights change the federal package or should stay as a separate reviewer note.";
    case "prior-year-carryovers":
      return "Confirm what must carry forward from last year and what still needs human review before it is reused.";
    default:
      return dossier.summary;
  }
}

function buildReviewerQuestion(dossier: TinaResearchDossier): string {
  switch (dossier.status) {
    case "review_ready":
      return "Would a reviewer feel comfortable letting this idea affect the federal return as drafted?";
    case "needs_disclosure_review":
      return "If this idea is used, what disclosure or extra reviewer caution is required?";
    case "rejected":
      return "Should this idea stay out of the federal return unless new facts change the answer?";
    default:
      return "What authority would make this idea safe enough to consider for the federal return?";
  }
}

function buildSummary(dossier: TinaResearchDossier): string {
  switch (dossier.status) {
    case "review_ready":
      return "Tina has enough legal direction for a reviewer to decide whether this idea belongs in the return.";
    case "needs_disclosure_review":
      return "Tina may have a usable edge here, but only if a reviewer is comfortable with the disclosure path.";
    case "rejected":
      return "Tina should keep this out unless stronger authority or new facts change the picture.";
    default:
      return "Tina is still gathering law and guidance before this idea is safe enough to consider.";
  }
}

export function buildTinaAuthorityTrailFromDossier(
  dossier: TinaResearchDossier
): TinaAuthorityTrail {
  return {
    id: dossier.id,
    title: dossier.title,
    reviewerState: pickReviewerState(dossier),
    disclosureFlag: pickDisclosureFlag(dossier),
    authorityTargets: pickAuthorityTargets(dossier),
    summary: buildSummary(dossier),
    memoFocus: buildMemoFocus(dossier),
    reviewerQuestion: buildReviewerQuestion(dossier),
  };
}

export function buildTinaAuthorityTrails(draft: TinaWorkspaceDraft): TinaAuthorityTrail[] {
  return buildTinaResearchDossiers(draft).map((dossier) =>
    buildTinaAuthorityTrailFromDossier(dossier)
  );
}
