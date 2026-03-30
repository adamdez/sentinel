import {
  describeTinaLlcFederalTaxTreatment,
  findTinaLlcCommunityPropertySourceFact,
  findTinaLlcTreatmentSourceFact,
  isTinaCommunityPropertyState,
  resolveTinaLlcCommunityPropertyStatus,
  resolveTinaLlcFederalTaxTreatment,
} from "@/tina/lib/llc-profile";
import type {
  TinaBusinessTaxProfile,
  TinaFilingLaneRecommendation,
  TinaSourceFact,
} from "@/tina/types";

function buildBlockedRecommendation(summary: string, blockers: string[]): TinaFilingLaneRecommendation {
  return {
    laneId: "unknown",
    title: "Needs intake confirmation",
    support: "blocked",
    summary,
    reasons: [
      "A few setup answers are still missing, so Tina is stopping early instead of guessing.",
    ],
    blockers,
  };
}

export function recommendTinaFilingLane(
  profile: TinaBusinessTaxProfile,
  sourceFacts: TinaSourceFact[] = []
): TinaFilingLaneRecommendation {
  const blockers: string[] = [];
  const llcTreatmentSourceFact = findTinaLlcTreatmentSourceFact(sourceFacts);
  const communityPropertySourceFact = findTinaLlcCommunityPropertySourceFact(sourceFacts);

  if (!profile.businessName.trim()) {
    blockers.push("Add your business name so Tina knows whose tax package she is building.");
  }

  if (profile.entityType === "unsure") {
    blockers.push(
      "Tina still does not know what kind of business this is. Pick the best fit, or bring the formation papers later."
    );
  }

  if (profile.hasIdahoActivity) {
    blockers.push(
      "You marked Idaho activity. Tina can flag that today, but this first version does not finish Idaho tax work yet."
    );
  }

  if (blockers.length > 0) {
    return buildBlockedRecommendation(
      "Tina needs one or two more answers before she can safely choose the right tax path.",
      blockers
    );
  }

  if (profile.entityType === "sole_prop") {
    const reasons = [
      "You picked sole proprietor, and that usually means a Schedule C style return.",
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
      title: "Schedule C / Owner Return",
      support: "supported",
      summary: "Good news. Tina can move forward on this business type right now.",
      reasons,
      blockers: [],
    };
  }

  if (profile.entityType === "single_member_llc") {
    const llcTreatment = resolveTinaLlcFederalTaxTreatment(profile, sourceFacts);

    if (llcTreatment === "unsure") {
      return buildBlockedRecommendation(
        "Tina needs one LLC tax answer before she can safely choose the federal return.",
        [
          "Tell Tina how this LLC files with the IRS so she does not guess the federal return path.",
        ]
      );
    }

    if (llcTreatment === "partnership_return") {
      return buildBlockedRecommendation(
        "Tina sees an LLC answer that does not fit a one-owner LLC.",
        [
          "A single-member LLC usually does not file as a partnership. Double-check whether there is really more than one owner or whether a different tax election was made.",
        ]
      );
    }

    if (llcTreatment === "owner_return") {
      const reasons = [
        "You picked single-member LLC, and Tina sees the owner-return federal tax path for this LLC.",
        "A single-member LLC on the owner-return path usually lands on a Schedule C style business return unless a different IRS election was made.",
        `Tina's first fully supported path is built for this kind of business for tax year ${profile.taxYear}.`,
      ];

      if (profile.llcFederalTaxTreatment === "default") {
        reasons.push(
          "Tina is using the normal IRS default for a one-owner LLC here. If this LLC ever elected S-corp or corporation treatment, change that above."
        );
      }

      if (
        llcTreatmentSourceFact &&
        (profile.llcFederalTaxTreatment === "default" ||
          profile.llcFederalTaxTreatment === "unsure")
      ) {
        reasons.push(
          `Tina also found matching LLC filing evidence in a saved paper: ${llcTreatmentSourceFact.value}`
        );
      }

      return {
        laneId: "schedule_c_single_member_llc",
        title: "Schedule C / Owner Return LLC",
        support: "supported",
        summary: "Good news. Tina can move forward on this LLC path right now.",
        reasons,
        blockers: [],
      };
    }

    if (llcTreatment === "s_corp_return") {
      return {
        laneId: "1120_s",
        title: "1120-S / LLC Taxed as S-Corp",
        support: "future",
        summary:
          "Tina recognizes this LLC as an S-corp tax path, but this first build is not ready to finish that return yet.",
        reasons: [
          describeTinaLlcFederalTaxTreatment(profile, sourceFacts) ??
            "This LLC is using S-corp tax treatment.",
          "Tina is starting with the simpler Schedule C owner-return path before she expands to 1120-S.",
          ...(llcTreatmentSourceFact &&
          (profile.llcFederalTaxTreatment === "default" ||
            profile.llcFederalTaxTreatment === "unsure")
            ? [`Tina found that tax-path clue in a saved paper: ${llcTreatmentSourceFact.value}`]
            : []),
        ],
        blockers: [
          "Tina should stop here for now instead of pretending she can finish this return safely.",
        ],
      };
    }

    return {
      laneId: "1120",
      title: "1120 / LLC Taxed as Corporation",
      support: "future",
      summary:
        "Tina recognizes this LLC as a corporation tax path, but this first build is not ready to finish Form 1120 work yet.",
      reasons: [
        describeTinaLlcFederalTaxTreatment(profile, sourceFacts) ??
          "This LLC is using corporation tax treatment.",
        "Corporate return work is outside Tina's first supported lane.",
        ...(llcTreatmentSourceFact &&
        (profile.llcFederalTaxTreatment === "default" ||
          profile.llcFederalTaxTreatment === "unsure")
          ? [`Tina found that tax-path clue in a saved paper: ${llcTreatmentSourceFact.value}`]
          : []),
      ],
      blockers: [
        "Tina should pause after intake and wait for the future corporate-return engine.",
      ],
    };
  }

  if (profile.entityType === "multi_member_llc") {
    const llcTreatment = resolveTinaLlcFederalTaxTreatment(profile, sourceFacts);

    if (llcTreatment === "unsure") {
      return buildBlockedRecommendation(
        "Tina needs one LLC tax answer before she can safely choose the federal return.",
        [
          "Tell Tina how this LLC files with the IRS so she does not guess the federal return path.",
        ]
      );
    }

    if (llcTreatment === "owner_return") {
      const communityPropertyStatus = resolveTinaLlcCommunityPropertyStatus(profile, sourceFacts);

      if (
        communityPropertyStatus === "unsure" ||
        communityPropertyStatus === "not_applicable"
      ) {
        return buildBlockedRecommendation(
          "Tina needs one more answer before she can trust the owner-return path for this LLC.",
          [
            "Tell Tina whether the only owners are a married couple in a community-property state using the owner-return treatment for this LLC.",
          ]
        );
      }

      if (communityPropertyStatus === "no") {
        return buildBlockedRecommendation(
          "Tina sees an LLC answer that does not fit the normal federal filing rules.",
          [
            "A multi-member LLC usually cannot use the owner-return path unless it is the married-couple community-property case. Double-check the federal tax treatment above.",
          ]
        );
      }

      if (!isTinaCommunityPropertyState(profile.formationState)) {
        return buildBlockedRecommendation(
          "Tina needs a closer look before trusting the owner-return path for this LLC.",
          [
            `${profile.formationState || "This formation state"} is not one of Tina's standard community-property-state matches for this spouse-owned LLC path. A human should verify the federal treatment before Tina picks a return lane.`,
          ]
        );
      }

      return {
        laneId: "schedule_c_single_member_llc",
        title: "Schedule C / Community-Property Spouse LLC",
        support: "supported",
        summary:
          "Tina can move forward on this owner-return LLC path, but she will keep the spouse/community-property fact visible.",
        reasons: [
          profile.llcFederalTaxTreatment === "owner_return"
            ? "You picked a multi-member LLC, but you also marked the owner-return path for a married couple in a community-property state."
            : "Tina sees a multi-member LLC and a saved-paper owner-return clue for the married-couple community-property path.",
          `Tina sees ${profile.formationState} as a community-property state for this special LLC filing path.`,
          `Tina's first fully supported path can still start on a Schedule C style return for tax year ${profile.taxYear}.`,
          ...(llcTreatmentSourceFact &&
          (profile.llcFederalTaxTreatment === "default" ||
            profile.llcFederalTaxTreatment === "unsure")
            ? [`Tina found the owner-return clue in a saved paper: ${llcTreatmentSourceFact.value}`]
            : []),
          ...(communityPropertySourceFact &&
          (profile.llcCommunityPropertyStatus === "not_applicable" ||
            profile.llcCommunityPropertyStatus === "unsure")
            ? [
                `Tina also found spouse/community-property support in a saved paper: ${communityPropertySourceFact.value}`,
              ]
            : []),
        ],
        blockers: [],
      };
    }

    if (llcTreatment === "s_corp_return") {
      return {
        laneId: "1120_s",
        title: "1120-S / LLC Taxed as S-Corp",
        support: "future",
        summary:
          "Tina recognizes this LLC as an S-corp tax path, but this first build is not ready to finish that return yet.",
        reasons: [
          describeTinaLlcFederalTaxTreatment(profile, sourceFacts) ??
            "This LLC is using S-corp tax treatment.",
          "Tina is starting with the simpler Schedule C owner-return path before she expands to 1120-S.",
          ...(llcTreatmentSourceFact &&
          (profile.llcFederalTaxTreatment === "default" ||
            profile.llcFederalTaxTreatment === "unsure")
            ? [`Tina found that tax-path clue in a saved paper: ${llcTreatmentSourceFact.value}`]
            : []),
        ],
        blockers: [
          "Tina should stop here for now instead of pretending she can finish this return safely.",
        ],
      };
    }

    if (llcTreatment === "c_corp_return") {
      return {
        laneId: "1120",
        title: "1120 / LLC Taxed as Corporation",
        support: "future",
        summary:
          "Tina recognizes this LLC as a corporation tax path, but this first build is not ready to finish Form 1120 work yet.",
        reasons: [
          describeTinaLlcFederalTaxTreatment(profile, sourceFacts) ??
            "This LLC is using corporation tax treatment.",
          "Corporate return work is outside Tina's first supported lane.",
          ...(llcTreatmentSourceFact &&
          (profile.llcFederalTaxTreatment === "default" ||
            profile.llcFederalTaxTreatment === "unsure")
            ? [`Tina found that tax-path clue in a saved paper: ${llcTreatmentSourceFact.value}`]
            : []),
        ],
        blockers: [
          "Tina should pause after intake and wait for the future corporate-return engine.",
        ],
      };
    }

    const reasons = [
      describeTinaLlcFederalTaxTreatment(profile, sourceFacts) ??
        "This LLC is using the partnership-style federal tax path.",
      "A multi-member LLC usually follows a partnership path unless another election was made.",
      "Partnership splits and K-1 work are outside Tina's first supported lane.",
    ];

    if (profile.llcFederalTaxTreatment === "default") {
      reasons.unshift(
        "Tina is using the normal IRS default for a multi-member LLC here. If this LLC elected S-corp or corporation treatment, change that above."
      );
    }

    if (
      llcTreatmentSourceFact &&
      (profile.llcFederalTaxTreatment === "default" ||
        profile.llcFederalTaxTreatment === "unsure")
    ) {
      reasons.push(`Tina found that tax-path clue in a saved paper: ${llcTreatmentSourceFact.value}`);
    }

    return {
      laneId: "1065",
      title: "1065 / Multi-Member LLC",
      support: "future",
      summary:
        "Tina can tell this looks like a partnership-style LLC return, but this first build does not finish that return yet.",
      reasons,
      blockers: [
        "Tina should pause after intake and wait for the future partnership engine.",
      ],
    };
  }

  if (profile.entityType === "s_corp") {
    return {
      laneId: "1120_s",
      title: "1120-S / S-Corp",
      support: "future",
      summary:
        "Tina recognizes this business type, but this first build is not ready to finish that return yet.",
      reasons: [
        "Your answers look like an S-corp setup.",
        "Tina is starting with the simpler Schedule C path before she expands to 1120-S.",
      ],
      blockers: [
        "Tina should stop here for now instead of pretending she can finish this return safely.",
      ],
    };
  }

  return {
    laneId: "1065",
    title: "1065 / Partnership",
    support: "future",
    summary:
      "Tina can tell this looks like a partnership, but this first build does not finish partnership returns yet.",
    reasons: [
      "Your answers point Tina toward a partnership return.",
      "Partnership splits and K-1 work are outside Tina's first supported lane.",
    ],
    blockers: [
      "Tina should pause after intake and wait for the future partnership engine.",
    ],
  };
}
