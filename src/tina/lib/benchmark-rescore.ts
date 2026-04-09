import { buildTinaCurrentFileReviewerReality } from "@/tina/lib/current-file-reviewer-reality";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import { buildTinaReviewDeliveryReport } from "@/tina/lib/review-delivery";
import type {
  TinaBenchmarkProposalDecisionStatus,
  TinaReviewerOutcomeCaseTag,
  TinaWorkspaceDraft,
} from "@/tina/types";
import {
  TINA_HARD_SKILL_BENCHMARKS_CURRENT,
  TINA_SOFT_SKILL_BENCHMARKS_CURRENT,
  type TinaSkillBenchmarkEntry,
} from "@/tina/data/skill-benchmarks";

export type TinaBenchmarkRescoreRecommendation = "hold" | "consider_raise" | "do_not_raise";

export interface TinaBenchmarkRescoreProposal {
  skillId: string;
  title: string;
  currentScore: number;
  recommendation: TinaBenchmarkRescoreRecommendation;
  summary: string;
  reasons: string[];
}

export interface TinaBenchmarkCohortRescoreProposal {
  skillId: string;
  cohortTag: TinaReviewerOutcomeCaseTag;
  cohortLabel: string;
  recommendation: TinaBenchmarkRescoreRecommendation;
  summary: string;
  decision: TinaBenchmarkProposalDecisionStatus | null;
}

export interface TinaBenchmarkRescoreReport {
  summary: string;
  nextStep: string;
  proposals: TinaBenchmarkRescoreProposal[];
  cohortProposals: TinaBenchmarkCohortRescoreProposal[];
}

const ALL_BENCHMARKS: TinaSkillBenchmarkEntry[] = [
  ...TINA_HARD_SKILL_BENCHMARKS_CURRENT,
  ...TINA_SOFT_SKILL_BENCHMARKS_CURRENT,
];

const REVIEW_DELIVERY_SKILLS = new Set([
  "documentation_and_defensibility",
  "client_communication",
  "workflow_and_case_management",
  "practice_judgment",
  "true_final_form_execution",
  "confidence_calibration",
  "reviewer_learning_loop",
  "reviewer_override_governance",
  "live_acceptance_testing_against_reality",
  "durable_case_memory",
]);

const TRACEABILITY_SKILLS = new Set([
  "documentation_and_defensibility",
  "record_and_evidence_analysis",
  "form_and_compliance_execution",
  "true_final_form_execution",
]);

const COHORT_SKILL_MAP: Partial<Record<TinaReviewerOutcomeCaseTag, string[]>> = {
  clean_books: [
    "accounting_fluency",
    "documentation_and_defensibility",
    "true_final_form_execution",
    "workflow_and_case_management",
  ],
  messy_books: [
    "accounting_fluency",
    "record_and_evidence_analysis",
    "messy_evidence_generalization",
    "unknown_pattern_resolution",
  ],
  authority_heavy: [
    "technical_tax_law",
    "tax_treatment_selection",
    "ethics_and_professional_responsibility",
    "confidence_calibration",
  ],
  commingled_entity: [
    "fact_pattern_judgment",
    "entity_and_filing_path_classification",
    "risk_and_materiality_judgment",
    "practice_judgment",
  ],
  schedule_c: [
    "form_and_compliance_execution",
    "true_final_form_execution",
  ],
  payroll: [
    "accounting_fluency",
    "tax_treatment_selection",
    "form_and_compliance_execution",
  ],
  contractor: [
    "accounting_fluency",
    "tax_treatment_selection",
    "review_and_error_detection",
  ],
  sales_tax: [
    "technical_tax_law",
    "tax_treatment_selection",
    "confidence_calibration",
  ],
  inventory: [
    "accounting_fluency",
    "tax_treatment_selection",
    "industry_and_scenario_familiarity",
  ],
  owner_flow: [
    "accounting_fluency",
    "messy_evidence_generalization",
    "practice_judgment",
  ],
  transfer: [
    "fact_pattern_judgment",
    "review_and_error_detection",
    "practice_judgment",
  ],
  related_party: [
    "fact_pattern_judgment",
    "risk_and_materiality_judgment",
    "practice_judgment",
  ],
  continuity: [
    "fact_pattern_judgment",
    "form_and_compliance_execution",
    "durable_case_memory",
  ],
  depreciation: [
    "technical_tax_law",
    "form_and_compliance_execution",
    "document_intelligence_depth",
  ],
  state_scope: [
    "industry_and_scenario_familiarity",
    "risk_and_materiality_judgment",
  ],
};

export function buildTinaBenchmarkProposalDecisionId(
  skillId: string,
  cohortTag: TinaReviewerOutcomeCaseTag
): string {
  return `benchmark-proposal-${cohortTag}-${skillId}`;
}

function buildReasons(draft: TinaWorkspaceDraft, skillId: string): string[] {
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const reviewDelivery = buildTinaReviewDeliveryReport(draft);
  const reasons: string[] = [];

  if (REVIEW_DELIVERY_SKILLS.has(skillId)) {
    reasons.push(`Review-delivery status is ${reviewDelivery.status.replace(/_/g, " ")}.`);
  }

  if (TRACEABILITY_SKILLS.has(skillId) && draft.scheduleCDraft.fields.length > 0) {
    reasons.push("Schedule C fields now carry reviewer-final, tax-position, and source-document traceability.");
  }

  if (
    skillId === "live_acceptance_testing_against_reality" ||
    skillId === "confidence_calibration" ||
    skillId === "reviewer_learning_loop" ||
    skillId === "reviewer_override_governance"
  ) {
    reasons.push(liveAcceptance.benchmarkMovement.summary);
  }

  if (
    draft.taxPositionMemory.status === "complete" &&
    (skillId === "documentation_and_defensibility" ||
      skillId === "true_final_form_execution" ||
      skillId === "practice_judgment")
  ) {
    reasons.push("Tax-position memory is current and included in the exported CPA packet.");
  }

  return reasons;
}

function buildRecommendation(
  draft: TinaWorkspaceDraft,
  benchmark: TinaSkillBenchmarkEntry
): TinaBenchmarkRescoreProposal {
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const currentFileReality = buildTinaCurrentFileReviewerReality(draft);
  const reviewDelivery = buildTinaReviewDeliveryReport(draft);
  const reasons = buildReasons(draft, benchmark.id);
  let recommendation: TinaBenchmarkRescoreRecommendation = "hold";
  let summary =
    "Do not move this score yet unless broader live reviewer evidence and engine gains clearly support it.";

  const currentFileFragile = liveAcceptance.currentFileCohorts.some(
    (cohort) => cohort.trustLevel === "fragile"
  );

  if (currentFileFragile || currentFileReality.status === "fragile") {
    recommendation = "do_not_raise";
    summary =
      "Do not raise this score while the current file still falls into a fragile live reviewer cohort.";
  } else if (currentFileReality.status === "mixed") {
    recommendation = "hold";
    summary =
      "Hold this score while current-file reviewer reality is still mixed and Tina is proving she absorbed those corrections.";
  } else if (
    reviewDelivery.status === "ready_to_send" &&
    (liveAcceptance.benchmarkMovement.recommendation === "raise_narrowly" ||
      liveAcceptance.benchmarkMovement.recommendation === "raise_broadly") &&
    (REVIEW_DELIVERY_SKILLS.has(benchmark.id) || TRACEABILITY_SKILLS.has(benchmark.id))
  ) {
    recommendation = "consider_raise";
    summary =
      "This score may deserve a narrow upward review because Tina now has stronger review-delivery evidence on this file and the related engine layer improved.";
  }

  return {
    skillId: benchmark.id,
    title: benchmark.title,
    currentScore: benchmark.score,
    recommendation,
    summary,
    reasons,
  };
}

export function buildTinaBenchmarkRescoreReport(
  draft: TinaWorkspaceDraft
): TinaBenchmarkRescoreReport {
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const proposals = ALL_BENCHMARKS.map((benchmark) => buildRecommendation(draft, benchmark));
  const cohortProposals: TinaBenchmarkCohortRescoreProposal[] = liveAcceptance.cohorts.flatMap(
    (cohort) =>
      (COHORT_SKILL_MAP[cohort.tag] ?? []).map((skillId) => {
        const recommendation: TinaBenchmarkRescoreRecommendation =
          cohort.trustLevel === "strong" && cohort.totalOutcomes >= 4
            ? "consider_raise"
            : cohort.trustLevel === "fragile"
              ? "do_not_raise"
              : "hold";
        const summary =
          recommendation === "consider_raise"
            ? `${cohort.label} outcomes are strong enough to review a narrow score increase for this skill.`
            : recommendation === "do_not_raise"
              ? `${cohort.label} outcomes are still fragile, so this skill should stay frozen for that cohort.`
              : `${cohort.label} outcomes are useful but not yet strong enough to move this skill.`;
        return {
          skillId,
          cohortTag: cohort.tag,
          cohortLabel: cohort.label,
          recommendation,
          summary,
          decision:
            draft.benchmarkProposalDecisions.find(
              (item) =>
                item.id === buildTinaBenchmarkProposalDecisionId(skillId, cohort.tag)
            )?.status ?? null,
        };
      })
  );
  const considerCount = proposals.filter(
    (proposal) => proposal.recommendation === "consider_raise"
  ).length;
  const blockCount = proposals.filter(
    (proposal) => proposal.recommendation === "do_not_raise"
  ).length;

  let summary =
    "Tina does not have enough grounded review-delivery and live-acceptance evidence to support benchmark movement yet.";
  let nextStep =
    "Keep improving the engine layers and collecting live CPA-review outcomes before proposing score changes.";

  if (blockCount > 0) {
    summary =
      "Some benchmark movement should stay frozen because the current file still reveals fragile reviewer-trust cohorts.";
    nextStep =
      "Fix the fragile cohorts first, then revisit only the skills directly supported by the improved evidence.";
  } else if (considerCount > 0) {
    summary =
      "A narrow set of scores may be ready for review because Tina now has stronger CPA-review delivery posture and supporting evidence.";
    nextStep =
      "Review only the flagged skills and move them only if the underlying engine change really broadened capability.";
  }

  return {
    summary,
    nextStep,
    proposals,
    cohortProposals,
  };
}
