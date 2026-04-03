import type { TinaBusinessTaxProfile, TinaFilingLaneRecommendation } from "@/tina/types";

export function recommendTinaFilingLane(
  profile: TinaBusinessTaxProfile
): TinaFilingLaneRecommendation {
  const blockers: string[] = [];
  const reasons: string[] = [];

  if (profile.entityType === "unsure" && profile.taxElection === "unsure") {
    return {
      laneId: "unknown",
      title: "Needs intake confirmation",
      support: "blocked",
      summary: "Tina still needs a clearer entity and election picture before she can name the right tax path.",
      reasons: [
        "The organizer does not yet say enough about the entity form or tax election to choose a defensible starting lane.",
      ],
      blockers: [
        "Pick the closest entity setup or bring formation and election papers so Tina can classify the return path correctly.",
      ],
    };
  }

  let laneId: TinaFilingLaneRecommendation["laneId"];
  let title: string;
  let support: TinaFilingLaneRecommendation["support"];
  let summary: string;

  const hasConfirmedCommunityPropertyException =
    profile.entityType === "single_member_llc" &&
    profile.ownerCount !== null &&
    profile.ownerCount > 1 &&
    profile.spouseCommunityPropertyTreatment === "confirmed";
  const hasPossibleCommunityPropertyException =
    profile.entityType === "single_member_llc" &&
    profile.ownerCount !== null &&
    profile.ownerCount > 1 &&
    profile.spouseCommunityPropertyTreatment === "possible";

  if (profile.taxElection === "c_corp" || profile.entityType === "c_corp") {
    laneId = "1120";
    title = "1120 / C-Corp";
    support = "future";
    summary =
      "Tina recognizes a corporate return path here, but this first build does not finish 1120 returns yet.";
    reasons.push(
      "The organizer points to a corporate election or corporate entity treatment.",
      "Tina's first supported lane is still the Schedule C single-owner path."
    );
  } else if (profile.taxElection === "s_corp" || profile.entityType === "s_corp") {
    laneId = "1120_s";
    title = "1120-S / S-Corp";
    support = "future";
    summary =
      "Tina recognizes this as an S-corp path, but this first build is not ready to finish that return yet.";
    reasons.push(
      "The organizer points to an S-corp setup or election.",
      "Tina is starting with the Schedule C lane before expanding to 1120-S."
    );
  } else if (hasConfirmedCommunityPropertyException || hasPossibleCommunityPropertyException) {
    laneId = "schedule_c_single_member_llc";
    title = "Schedule C / Community-Property Review";
    support = "future";
    summary =
      "Tina sees a possible spouse community-property exception that may still fit a single-owner federal path, but she needs reviewer confirmation before using it.";
    reasons.push(
      "The organizer shows more than one owner, but also points to spouse community-property treatment.",
      "That can sometimes still fit a Schedule C or disregarded federal path in limited cases."
    );
    if (hasPossibleCommunityPropertyException) {
      blockers.push(
        "Spouse community-property treatment is only marked as possible, not confirmed, so Tina should stop and verify the exception before starting on Schedule C."
      );
    }
  } else if (
    (profile.ownerCount !== null && profile.ownerCount > 1) ||
    profile.entityType === "multi_member_llc" ||
    profile.entityType === "partnership"
  ) {
    laneId = "1065";
    title = "1065 / Partnership";
    support = "future";
    summary =
      "Tina sees a multi-owner or partnership-style setup, so she should route this to the partnership path instead of the Schedule C pilot.";
    reasons.push(
      profile.ownerCount !== null && profile.ownerCount > 1
        ? "More than one owner usually means a partnership-style starting path unless a different election is proved."
        : "A multi-member LLC or partnership answer points Tina toward a 1065-style starting path.",
      "Partnership splits, capital accounts, and K-1 work are outside Tina's first supported lane."
    );
  } else if (profile.entityType === "sole_prop" || profile.entityType === "single_member_llc") {
    laneId = "schedule_c_single_member_llc";
    title = "Schedule C / Single-Member LLC";
    support = "supported";
    summary = "Good news. Tina can move forward on this business type right now.";
    reasons.push(
      profile.entityType === "sole_prop"
        ? "You picked sole proprietor, and that usually means a Schedule C style return."
        : "You picked single-member LLC, and that usually means a Schedule C style return unless a different tax election was made.",
      `Tina's first fully supported path is built for this kind of business for tax year ${profile.taxYear}.`
    );
  } else {
    laneId = "1065";
    title = "1065 / Partnership";
    support = "future";
    summary =
      "Tina can tell this looks like a partnership path, but this first build does not finish partnership returns yet.";
    reasons.push(
      "Your answers point Tina toward a partnership-style return.",
      "Partnership splits and K-1 work are outside Tina's first supported lane."
    );
  }

  if (profile.entityType === "single_member_llc" && profile.spouseCommunityPropertyTreatment === "confirmed") {
    reasons.push(
      "The organizer marks spouse community-property treatment as confirmed, which Tina keeps visible because it can change how a multiple-owner LLC is classified federally."
    );
  }

  if (profile.hasPayroll) {
    reasons.push("You also marked payroll, so Tina will ask for payroll records too.");
  }

  if (profile.hasInventory) {
    reasons.push("You marked inventory, so Tina will ask for a little more proof before the package is final.");
  }

  if (profile.hasIdahoActivity) {
    blockers.push(
      "Idaho or multistate activity expands the package beyond Tina's first-class Washington-only Schedule C scope, so she should keep the likely federal lane but stop for state review."
    );
  }

  if (profile.ownershipChangedDuringYear) {
    blockers.push(
      "Ownership changed during the year. Tina should keep the likely lane visible, but stop and route the file to review before prep starts."
    );
  }

  if (profile.hasOwnerBuyoutOrRedemption) {
    blockers.push(
      "You marked an owner buyout or redemption. Tina should stop and route that to review before trusting the starting path."
    );
  }

  if (profile.hasFormerOwnerPayments) {
    blockers.push(
      "You marked payments to a former owner. Tina should stop and route that to review before trusting the starting path."
    );
  }

  if (support === "supported" && blockers.length > 0) {
    support = "blocked";
    summary =
      "Tina sees the likely supported federal lane here, but one or more scope or ownership blockers still require review before she should start prep.";
  }

  return {
    laneId,
    title,
    support,
    summary,
    reasons,
    blockers,
  };
}
