import { buildTinaBenchmarkRescoreReport } from "@/tina/lib/benchmark-rescore";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import type { TinaWorkspaceDraft } from "@/tina/types";

export interface TinaBenchmarkDashboardCard {
  id: string;
  title: string;
  summary: string;
  status: "positive" | "mixed" | "blocked";
  lines: string[];
}

export interface TinaBenchmarkDashboardReport {
  summary: string;
  nextStep: string;
  cards: TinaBenchmarkDashboardCard[];
}

export function buildTinaBenchmarkDashboardReport(
  draft: TinaWorkspaceDraft
): TinaBenchmarkDashboardReport {
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const rescore = buildTinaBenchmarkRescoreReport(draft);
  const raiseableCohorts = rescore.cohortProposals.filter(
    (proposal) => proposal.recommendation === "consider_raise"
  );
  const blockedCohorts = rescore.cohortProposals.filter(
    (proposal) => proposal.recommendation === "do_not_raise"
  );

  const cards: TinaBenchmarkDashboardCard[] = [
    {
      id: "recent-live-acceptance",
      title: "Recent live acceptance",
      status:
        liveAcceptance.windows[0]?.trustLevel === "strong"
          ? "positive"
          : liveAcceptance.windows[0]?.trustLevel === "fragile"
            ? "blocked"
            : "mixed",
      summary: liveAcceptance.summary,
      lines: liveAcceptance.windows.map(
        (window) =>
          `${window.label}: ${window.totalOutcomes} outcomes, score ${window.acceptanceScore ?? 0}/100, trust ${window.trustLevel.replace(
            /_/g,
            " "
          )}`
      ),
    },
    {
      id: "cohort-raise-candidates",
      title: "Cohort raise candidates",
      status: raiseableCohorts.length > 0 ? "positive" : "mixed",
      summary:
        raiseableCohorts.length > 0
          ? "Some cohort-specific skills now have enough evidence for narrow rescore review."
          : "No cohort-specific skill has enough evidence for a narrow raise yet.",
      lines:
        raiseableCohorts.length > 0
          ? raiseableCohorts.slice(0, 6).map(
              (proposal) => `${proposal.cohortLabel}: ${proposal.skillId.replace(/_/g, " ")}`
            )
          : ["Keep collecting more accepted reviewer outcomes by cohort."],
    },
    {
      id: "cohort-freezes",
      title: "Cohort freezes",
      status: blockedCohorts.length > 0 ? "blocked" : "positive",
      summary:
        blockedCohorts.length > 0
          ? "Some cohorts still freeze benchmark movement because reviewer trust is fragile."
          : "No cohort is currently forcing a benchmark freeze.",
      lines:
        blockedCohorts.length > 0
          ? blockedCohorts.slice(0, 6).map(
              (proposal) => `${proposal.cohortLabel}: ${proposal.skillId.replace(/_/g, " ")}`
            )
          : ["Reviewer trust is not currently fragile in any measured cohort."],
    },
  ];

  return {
    summary: rescore.summary,
    nextStep: rescore.nextStep,
    cards,
  };
}
