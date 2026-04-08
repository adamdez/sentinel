import { buildTinaResearchIdeas } from "@/tina/lib/research-ideas";
import type { TinaWorkspaceDraft } from "@/tina/types";

export interface TinaPlanningScenario {
  id: string;
  title: string;
  supportLevel: "strong" | "developing" | "thin";
  payoffWindow: "current_return" | "next_cycle" | "needs_reviewer_call";
  tradeoff: string;
  nextStep: string;
}

export interface TinaPlanningReport {
  summary: string;
  nextStep: string;
  scenarios: TinaPlanningScenario[];
}

function pushScenario(
  scenarios: TinaPlanningScenario[],
  scenario: TinaPlanningScenario | null
): void {
  if (scenario) scenarios.push(scenario);
}

export function buildTinaPlanningReport(draft: TinaWorkspaceDraft): TinaPlanningReport {
  const ideas = buildTinaResearchIdeas(draft);
  const scenarios: TinaPlanningScenario[] = [];
  const deliveryIsStable =
    draft.packageReadiness.status === "complete" &&
    draft.packageReadiness.level === "ready_for_cpa" &&
    draft.taxPositionMemory.status === "complete" &&
    draft.taxPositionMemory.records.every((record) => record.status === "ready");

  pushScenario(
    scenarios,
    ideas.some((idea) => idea.id === "qbi-review")
      ? {
          id: "qbi",
          title: "Qualified business income deduction path",
          supportLevel: deliveryIsStable ? "developing" : "thin",
          payoffWindow: "current_return",
          tradeoff:
            "Potential current-year tax savings, but Tina still needs the deduction facts and limit posture to be reviewer-cleared before treating it as usable.",
          nextStep:
            "Review the QBI idea with the CPA packet and confirm whether the return facts support taking the deduction this year.",
        }
      : null
  );

  pushScenario(
    scenarios,
    ideas.some((idea) => idea.id === "de-minimis-safe-harbor-review")
      ? {
          id: "de-minimis-safe-harbor",
          title: "Small asset expensing vs capitalization",
          supportLevel: draft.profile.hasFixedAssets ? "developing" : "thin",
          payoffWindow: "current_return",
          tradeoff:
            "Immediate deduction may simplify the file and improve current-year timing, but Tina still needs asset support and reviewer signoff on policy consistency.",
          nextStep:
            "Bring the asset papers into the packet and ask the CPA to choose between de minimis, Section 179, bonus depreciation, or capitalization treatment.",
        }
      : null
  );

  pushScenario(
    scenarios,
    ideas.some((idea) => idea.id === "startup-costs-review")
      ? {
          id: "startup-costs",
          title: "Startup cost deduction vs amortization",
          supportLevel: "developing",
          payoffWindow: "current_return",
          tradeoff:
            "The current return may benefit from immediate deduction, but the wrong election posture can distort continuity and future-year treatment.",
          nextStep:
            "Use the startup-cost idea in the CPA packet and make a reviewer call on election posture before finalizing the return.",
        }
      : null
  );

  pushScenario(
    scenarios,
    ideas.some((idea) => idea.id === "prior-year-carryovers")
      ? {
          id: "continuity",
          title: "Carryover and prior-election continuity",
          supportLevel: draft.priorReturnDocumentId || draft.priorReturn ? "strong" : "thin",
          payoffWindow: "current_return",
          tradeoff:
            "Following last year correctly can protect money and prevent drift, but stale or misunderstood continuity assumptions can infect the whole file.",
          nextStep:
            "Review the prior return and continuity ideas first if the packet still has open carryover or election questions.",
        }
      : null
  );

  pushScenario(
    scenarios,
    ideas.some((idea) => idea.id === "payroll-review")
      ? {
          id: "payroll",
          title: "Payroll deduction and compliance posture",
          supportLevel: draft.profile.hasPayroll ? "developing" : "thin",
          payoffWindow: "needs_reviewer_call",
          tradeoff:
            "Payroll may support deductions cleanly, but if the records are incomplete it can also widen compliance risk and reviewer workload.",
          nextStep:
            "Attach payroll records and let the CPA decide whether payroll support is complete enough for return reliance.",
        }
      : null
  );

  if (scenarios.length === 0) {
    return {
      summary:
        "Tina does not see enough supported planning paths yet to present meaningful tradeoff scenarios.",
      nextStep:
        "Keep improving the file evidence and research layer so Tina can offer stronger planning comparisons instead of generic ideas.",
      scenarios: [],
    };
  }

  return {
    summary: `Tina found ${scenarios.length} planning or tradeoff scenario${
      scenarios.length === 1 ? "" : "s"
    } worth carrying into CPA review.`,
    nextStep:
      "Use these scenarios as CPA-review talking points, not as automatic positions, unless the supporting facts and reviewer posture are already strong.",
    scenarios,
  };
}
