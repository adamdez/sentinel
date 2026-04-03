import type {
  TinaReviewerAcceptanceForecastItem,
  TinaReviewerAcceptanceForecastSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaReviewerChallenges } from "@/tina/lib/reviewer-challenges";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaReviewerAcceptanceForecastItem): TinaReviewerAcceptanceForecastItem {
  return {
    ...item,
    relatedPositionIds: unique(item.relatedPositionIds),
    relatedChallengeIds: unique(item.relatedChallengeIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

function matchingChallenges(
  position: ReturnType<typeof buildTinaAuthorityPositionMatrix>["items"][number],
  reviewerChallenges: ReturnType<typeof buildTinaReviewerChallenges>
) {
  return reviewerChallenges.items.filter((challenge) => {
    const docMatch = challenge.relatedDocumentIds.some((id) =>
      position.relatedDocumentIds.includes(id)
    );
    const factMatch = challenge.relatedFactIds.some((id) =>
      position.relatedFactIds.includes(id)
    );
    const titleToken = position.title.toLowerCase().split(" ")[0] ?? "";
    const titleMatch = titleToken.length >= 5 && challenge.title.toLowerCase().includes(titleToken);
    return docMatch || factMatch || titleMatch;
  });
}

export function buildTinaReviewerAcceptanceForecast(
  draft: TinaWorkspaceDraft
): TinaReviewerAcceptanceForecastSnapshot {
  const positionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const reviewerChallenges = buildTinaReviewerChallenges(draft);

  const items: TinaReviewerAcceptanceForecastItem[] = positionMatrix.items.map((position) => {
    const matches = matchingChallenges(position, reviewerChallenges);
    const hasBlockingChallenge = matches.some((challenge) => challenge.severity === "blocking");
    const hasAttentionChallenge = matches.some(
      (challenge) => challenge.severity === "needs_attention"
    );
    const disclosureItem = disclosureReadiness.items.find((item) =>
      item.relatedPositionIds.includes(position.id)
    );

    const status =
      position.recommendation === "reject" ||
      position.recommendation === "hold_for_authority" ||
      position.recommendation === "hold_for_facts" ||
      disclosureItem?.status === "required" ||
      hasBlockingChallenge ||
      position.factStrength === "missing"
        ? "likely_reject"
        : position.recommendation === "review_first" ||
            position.recommendation === "appendix_only" ||
            disclosureItem?.status === "needs_review" ||
            hasAttentionChallenge ||
            position.factStrength === "thin" ||
            position.authorityStrength === "thin" ||
            position.authorityStrength === "missing"
          ? "likely_pushback"
          : "likely_accept";

    return buildItem({
      id: `acceptance-${position.id}`,
      title: position.title,
      status,
      summary:
        status === "likely_accept"
          ? "Tina sees enough law, fact support, and reviewer posture for this to survive a skeptical first pass."
          : status === "likely_pushback"
            ? "A skeptical CPA is likely to press on this position before allowing it into the final package."
            : "A skeptical CPA is likely to stop or reject this position in its current state.",
      whyItMatters:
        status === "likely_accept"
          ? "This is where Tina starts feeling like a strong senior preparer instead of just an organized draft engine."
          : status === "likely_pushback"
            ? "Pushback here means human review is still doing meaningful judgment work, not just confirmation."
            : "If Tina cannot predict rejection here, she will overstate readiness and lose reviewer trust.",
      relatedPositionIds: [position.id],
      relatedChallengeIds: matches.map((challenge) => challenge.id),
      relatedDocumentIds: [...position.relatedDocumentIds, ...matches.flatMap((challenge) => challenge.relatedDocumentIds)],
    });
  });

  const likelyAcceptCount = items.filter((item) => item.status === "likely_accept").length;
  const likelyRejectCount = items.filter((item) => item.status === "likely_reject").length;
  const likelyPushbackCount = items.filter((item) => item.status === "likely_pushback").length;
  const overallStatus =
    likelyRejectCount === 0 && likelyPushbackCount <= 1
      ? "high_confidence"
      : likelyAcceptCount > 0
        ? "mixed"
        : "low_confidence";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "high_confidence"
        ? `Tina sees ${likelyAcceptCount} position${likelyAcceptCount === 1 ? "" : "s"} that should survive skeptical reviewer scrutiny cleanly.`
        : overallStatus === "mixed"
          ? "Tina sees a mixed reviewer-acceptance forecast with some strong positions and some likely pushback."
          : "Tina expects a skeptical reviewer to reject or stop on most of the current non-routine positions.",
    nextStep:
      overallStatus === "high_confidence"
        ? "Carry the likely-accepted positions into reviewer planning and keep the weaker ones contained."
        : "Use the likely pushback and likely reject calls to decide where Tina still needs facts, authority, or a cleaner disclosure posture.",
    items,
  };
}
