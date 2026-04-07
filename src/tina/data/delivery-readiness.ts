export interface TinaDeliveryClaim {
  id: string;
  label: string;
  audience: "client" | "operator" | "internal";
  status: "safe_now" | "unsafe_now";
  reason: string;
}

export interface TinaSubmissionReadyGate {
  id: string;
  title: string;
  status: "not_met";
  whyItMatters: string;
  requiredCapabilities: string[];
}

export const TINA_DELIVERY_CLAIMS: TinaDeliveryClaim[] = [
  {
    id: "supported_schedule_c_prep",
    label:
      "Tina can organize supported Schedule C files, reconcile evidence, and prepare a first draft plus CPA-ready handoff packet.",
    audience: "client",
    status: "safe_now",
    reason:
      "This matches the current guarded prep, Schedule C draft, package readiness, and CPA handoff behavior.",
  },
  {
    id: "guarded_fail_closed_behavior",
    label:
      "Tina is designed to stop, downgrade, or block the package when the file is stale, contradicted, unsupported, or weakly supported.",
    audience: "operator",
    status: "safe_now",
    reason:
      "Current Tina behavior includes readiness blocking, stale-state checks, reviewer-learning caution, and unsupported-lane stops.",
  },
  {
    id: "direct_irs_submission",
    label: "Tina can prepare documents for direct submission to IRS.gov.",
    audience: "client",
    status: "unsafe_now",
    reason:
      "The current checkout is explicitly CPA-handoff oriented and does not include direct IRS e-file or IRS XML generation.",
  },
  {
    id: "human_free_final_filing",
    label: "Tina can finish and file the return safely without human review.",
    audience: "client",
    status: "unsafe_now",
    reason:
      "Current readiness language is ready-for-CPA, not filing-approved, and major reviewer and filing layers still remain.",
  },
  {
    id: "broad_business_return_completion",
    label: "Tina supports all major business-return lanes end to end.",
    audience: "internal",
    status: "unsafe_now",
    reason:
      "1120-S and 1065 are still future-only in the current filing-lane engine.",
  },
];

export const TINA_SUBMISSION_READY_GATES: TinaSubmissionReadyGate[] = [
  {
    id: "final_filing_package",
    title: "Final federal filing package layer",
    status: "not_met",
    whyItMatters:
      "Tina currently reaches CPA handoff, not a governed filing-approved state.",
    requiredCapabilities: [
      "Final signoff state beyond ready_for_cpa",
      "Filing-approved artifact set distinct from draft and review artifacts",
      "Final package assembly rules for the supported lane",
    ],
  },
  {
    id: "efile_or_submission_channel",
    title: "Direct submission or governed e-file channel",
    status: "not_met",
    whyItMatters:
      "Without a real transmission path, Tina can help prepare the file but cannot honestly claim submission readiness.",
    requiredCapabilities: [
      "Direct e-file or governed export channel",
      "Submission validation checks",
      "Rejection and resubmission handling",
    ],
  },
  {
    id: "multi_lane_completion",
    title: "Promised lane completion",
    status: "not_met",
    whyItMatters:
      "A deliverable product must fully support any lane it claims to complete.",
    requiredCapabilities: [
      "Real 1120-S draft/readiness/handoff behavior",
      "Real 1065 draft/readiness/handoff behavior",
      "Lane-specific output and rules",
    ],
  },
  {
    id: "transaction_truth",
    title: "Transaction-level numeric proof",
    status: "not_met",
    whyItMatters:
      "Filing-grade trust requires provable material numbers, not only clue-driven summaries.",
    requiredCapabilities: [
      "Deterministic source-to-workpaper tie-out",
      "Duplicate and contamination controls",
      "Blocking or downgrade behavior on unresolved money-story conflicts",
    ],
  },
  {
    id: "position_and_reviewer_governance",
    title: "Durable position and reviewer governance",
    status: "not_met",
    whyItMatters:
      "A filing-grade system must preserve what was decided, why it was decided, and when reviewers disagreed.",
    requiredCapabilities: [
      "Material-position memory with authority posture",
      "Reviewer deltas tied to positions",
      "Downstream caution when reviewer trust is fragile",
    ],
  },
  {
    id: "live_acceptance_proof",
    title: "Live reviewer acceptance proof",
    status: "not_met",
    whyItMatters:
      "Tests show internal discipline, but delivery claims above CPA handoff need repeated real-world reviewer acceptance evidence.",
    requiredCapabilities: [
      "Accepted/revised/rejected outcome tracking on live files",
      "Cohort-level performance windows",
      "Hard rules for benchmark score movement",
    ],
  },
];
