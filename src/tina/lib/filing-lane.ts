import type { TinaBusinessTaxProfile, TinaFilingLaneRecommendation } from "@/tina/types";

export function recommendTinaFilingLane(
  profile: TinaBusinessTaxProfile
): TinaFilingLaneRecommendation {
  const blockers: string[] = [];

  if (!profile.businessName.trim()) {
    blockers.push("Add your business name so Tina knows whose tax package she is building.");
  }

  if (profile.entityType === "unsure") {
    blockers.push("Tina still does not know what kind of business this is. Pick the best fit, or bring the formation papers later.");
  }

  if (profile.hasIdahoActivity) {
    blockers.push("You marked Idaho activity. Tina can flag that today, but this first version does not finish Idaho tax work yet.");
  }

  if (blockers.length > 0) {
    return {
      laneId: "unknown",
      title: "Needs intake confirmation",
      support: "blocked",
      summary: "Tina needs one or two more answers before she can safely choose the right tax path.",
      reasons: [
        "A few setup answers are still missing, so Tina is stopping early instead of guessing.",
      ],
      blockers,
    };
  }

  if (profile.entityType === "sole_prop" || profile.entityType === "single_member_llc") {
    const reasons = [
      profile.entityType === "sole_prop"
        ? "You picked sole proprietor, and that usually means a Schedule C style return."
        : "You picked single-member LLC, and that usually means a Schedule C style return unless a different tax election was made.",
      `Tina's first fully supported path is built for this kind of business for tax year ${profile.taxYear}.`,
    ];

    if (profile.hasPayroll) {
      reasons.push("You also marked payroll, so Tina will ask for payroll records too.");
    }

    if (profile.hasInventory) {
      reasons.push("You marked inventory, so Tina will ask for a little more proof before the package is final.");
    }

    return {
      laneId: "schedule_c_single_member_llc",
      title: "Schedule C / Single-Member LLC",
      support: "supported",
      summary: "Good news. Tina can move forward on this business type right now.",
      reasons,
      blockers: [],
    };
  }

  if (profile.entityType === "s_corp") {
    return {
      laneId: "1120_s",
      title: "1120-S / S-Corp",
      support: "future",
      summary:
        "Tina recognizes this business type and can organize the intake packet for CPA review, but this branch is not ready to finish the 1120-S return itself yet.",
      reasons: [
        "Your answers look like an S-corp setup.",
        "Tina is starting with the simpler Schedule C path before she expands to full 1120-S prep.",
      ],
      blockers: [
        "Tina should stop short of return prep here instead of pretending she can finish this 1120-S safely.",
      ],
    };
  }

  return {
      laneId: "1065",
      title: "1065 / Partnership",
      support: "future",
      summary:
        "Tina can tell this looks like a partnership and can organize the intake packet for CPA review, but this first build does not finish partnership returns yet.",
    reasons: [
      profile.entityType === "multi_member_llc"
        ? "A multi-member LLC usually follows a partnership path unless another election was made."
        : "Your answers point Tina toward a partnership return.",
      "Partnership splits and K-1 work are outside Tina's first supported lane.",
    ],
    blockers: [
      "Tina should pause after intake and wait for the future partnership engine.",
    ],
  };
}
