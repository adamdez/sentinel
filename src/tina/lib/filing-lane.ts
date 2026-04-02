import type { TinaBusinessTaxProfile, TinaFilingLaneRecommendation } from "@/tina/types";

function buildBlockedRecommendation(
  title: string,
  summary: string,
  reasons: string[],
  blockers: string[]
): TinaFilingLaneRecommendation {
  return {
    laneId: "unknown",
    title,
    support: "blocked",
    summary,
    reasons,
    blockers,
  };
}

export function recommendTinaFilingLane(
  profile: TinaBusinessTaxProfile
): TinaFilingLaneRecommendation {
  const blockers: string[] = [];
  const ownerCount = profile.ownerCount;
  const hasMultipleOwners = ownerCount !== null ? ownerCount > 1 : false;
  const isSingleOwner = ownerCount === 1;
  const hasCorporateElection =
    profile.entityType === "s_corp" ||
    profile.taxElection === "s_corp" ||
    profile.taxElection === "c_corp";
  const hasOwnershipComplexity =
    profile.ownershipChangedDuringYear ||
    profile.hasOwnerBuyoutOrRedemption ||
    profile.hasFormerOwnerPayments;
  const hasConfirmedCommunityPropertyException =
    profile.spouseCommunityPropertyTreatment === "confirmed";
  const entityLooksSingleOwner =
    profile.entityType === "sole_prop" || profile.entityType === "single_member_llc";
  const entityLooksMultiOwner =
    profile.entityType === "partnership" || profile.entityType === "multi_member_llc";

  if (!profile.businessName.trim()) {
    blockers.push("Add your business name so Tina knows whose tax package she is building.");
  }

  if (profile.entityType === "unsure") {
    blockers.push("Tina still does not know what kind of business this is. Pick the best fit, or bring the formation papers later.");
  }

  if (profile.hasIdahoActivity) {
    blockers.push("You marked Idaho activity. Tina can flag that today, but this first version does not finish Idaho tax work yet.");
  }

  if (
    ownerCount !== null &&
    ownerCount > 1 &&
    entityLooksSingleOwner &&
    !hasConfirmedCommunityPropertyException
  ) {
    return {
      laneId: "1065",
      title: "1065 / Partnership review",
      support: "future",
      summary: "Tina sees more than one owner, so she should start this file as a partnership-style review instead of a Schedule C lane.",
      reasons: [
        `You marked ${ownerCount} owners, which points away from the single-owner Schedule C path.`,
        "Ownership percentages do not change the need to review this as a multi-owner business first.",
      ],
      blockers: [
        "Tina should not continue in the single-owner lane when the business had more than one owner.",
      ],
    };
  }

  if (profile.entityType === "unsure" && hasCorporateElection) {
    return buildBlockedRecommendation(
      "Needs entity election review",
      "Tina has enough signals to know a corporate election may be in play, but she still needs the business structure confirmed before choosing the return path.",
      [
        "A corporate election changes the starting path immediately.",
        "Tina is stopping before prep so she does not open the wrong return type.",
      ],
      [
        "Confirm the entity structure and the election in effect for this tax year before Tina starts prep.",
      ]
    );
  }

  if (blockers.length > 0) {
    return buildBlockedRecommendation(
      "Needs intake confirmation",
      "Tina needs one or two more answers before she can safely choose the right tax path.",
      [
        "A few setup answers are still missing, so Tina is stopping early instead of guessing.",
      ],
      blockers
    );
  }

  if (hasOwnershipComplexity) {
    if (hasMultipleOwners || entityLooksMultiOwner) {
      return {
        laneId: "1065",
        title: "1065 / Partnership + ownership review",
        support: "future",
        summary: "Tina can tell this is a multi-owner file with ownership changes, so she should start in a partnership-style review lane.",
        reasons: [
          "More than one owner or a partnership-style entity points away from Schedule C.",
          "Buyouts, redemptions, or former-owner payments need ownership review before Tina can trust the return path.",
        ],
        blockers: [
          "Tina should pause after intake and route this file through ownership review before return prep continues.",
        ],
      };
    }

    return buildBlockedRecommendation(
      "Needs ownership timeline review",
      "Tina sees ownership-change facts that make the start path too risky to guess from the current answers alone.",
      [
        "Ownership changed during the tax year or owner-related payouts occurred.",
        "Those facts can change both the filing path and the treatment of payments.",
      ],
      [
        "Confirm the ownership timeline, owner exits, and related payments before Tina starts return prep.",
      ]
    );
  }

  if (profile.taxElection === "c_corp") {
    return {
      laneId: "1120",
      title: "1120 / C-Corp",
      support: "future",
      summary: "Tina recognizes a corporate election here, so this file should start in a corporate return lane instead of Schedule C.",
      reasons: [
        "A C-corp election changes the federal starting path.",
        "Tina should identify that correctly even before the corporate engine is built.",
      ],
      blockers: [
        "Tina should stop here for now instead of pretending she can finish a corporate return safely.",
      ],
    };
  }

  if (profile.taxElection === "s_corp" || profile.entityType === "s_corp") {
    return {
      laneId: "1120_s",
      title: "1120-S / S-Corp",
      support: "future",
      summary: "Tina recognizes this business type, but this first build is not ready to finish that return yet.",
      reasons: [
        "Your answers look like an S-corp setup.",
        "Tina is starting with the simpler Schedule C path before she expands to 1120-S.",
      ],
      blockers: [
        "Tina should stop here for now instead of pretending she can finish this return safely.",
      ],
    };
  }

  if (
    ownerCount === 2 &&
    hasConfirmedCommunityPropertyException &&
    !hasCorporateElection
  ) {
    return buildBlockedRecommendation(
      "Community-property spouse review",
      "Tina sees a possible spouse/community-property exception, which may still point toward a Schedule C-style start but needs explicit confirmation first.",
      [
        "This is a narrow exception path, not the default rule for multi-owner businesses.",
        "Tina should recognize it, but not silently rely on it without confirmation.",
      ],
      [
        "Confirm the spouse/community-property treatment before Tina starts the return in a Schedule C lane.",
      ]
    );
  }

  if (
    (entityLooksSingleOwner && (ownerCount === null || isSingleOwner)) ||
    (profile.entityType === "unsure" && isSingleOwner && profile.taxElection === "default")
  ) {
    const reasons = [
      profile.entityType === "sole_prop"
        ? "You picked sole proprietor, and that usually means a Schedule C style return."
        : profile.entityType === "single_member_llc"
          ? "You picked single-member LLC, and that usually means a Schedule C style return unless a different tax election was made."
          : "One owner with the default federal classification points Tina toward the Schedule C start path.",
      `Tina's first fully supported path is built for this kind of business for tax year ${profile.taxYear}.`,
    ];

    if (ownerCount === 1) {
      reasons.push("You marked one owner, which matches Tina's supported single-owner lane.");
    }

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

  if (entityLooksMultiOwner || hasMultipleOwners) {
    return {
      laneId: "1065",
      title: "1065 / Partnership",
      support: "future",
      summary: "Tina can tell this looks like a partnership, but this first build does not finish partnership returns yet.",
      reasons: [
        profile.entityType === "multi_member_llc"
          ? "A multi-member LLC usually follows a partnership path unless another election was made."
          : hasMultipleOwners
            ? "More than one owner points Tina toward a partnership-style return unless another election is in effect."
            : "Your answers point Tina toward a partnership return.",
        "Partnership splits and K-1 work are outside Tina's first supported lane.",
      ],
      blockers: [
        "Tina should pause after intake and wait for the future partnership engine.",
      ],
    };
  }

  return buildBlockedRecommendation(
    "Needs structure review",
    "Tina still does not have a clean enough ownership and election picture to choose the right starting path safely.",
    [
      "The current answers do not support a confident return-path decision.",
      "Tina is stopping before prep instead of opening the wrong lane.",
    ],
    [
      "Confirm owner count, election status, and whether ownership changed during the year.",
    ]
  );
}
