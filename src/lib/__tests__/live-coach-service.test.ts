import { describe, expect, it } from "vitest";
import {
  applyStrategistMove,
  buildLiveCoachResponse,
  computeHighestPriorityGap,
  createEmptyLiveCoachState,
  reduceLiveCoachState,
  shouldInvokeStrategist,
} from "@/lib/dialer/live-coach-service";
import type { LiveCoachNoteInput } from "@/lib/dialer/live-coach-service";

const NOW = "2026-03-22T20:00:00.000Z";

function note(
  sequenceNum: number,
  content: string,
  speaker: "operator" | "seller" | "ai" | null = "seller",
  noteType = "transcript_chunk",
): LiveCoachNoteInput {
  return {
    id: `note-${sequenceNum}`,
    content,
    speaker,
    noteType,
    sequenceNum,
    createdAt: NOW,
    confidence: 0.92,
  };
}

describe("live-coach-service", () => {
  it("keeps roof leak as condition facts and leaves human pain open", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [note(1, "There is a roof leak in the back room.")],
      "outbound",
      NOW,
    );

    expect(result.state.discoveryMap.property_condition).toMatchObject({
      status: "confirmed",
      value: "roof issue",
      source: "transcript",
    });
    expect(result.state.discoveryMap.surface_problem).toMatchObject({
      status: "partial",
      value: "roof issue",
    });
    expect(result.state.discoveryMap.human_pain.status).toBe("missing");

    const response = buildLiveCoachResponse(result.state, "outbound");
    expect(response.highestPriorityGap).toBe("human_pain");
    expect(response.nextBestQuestion).toContain("affecting things for you personally");
    expect(response.dealMode).toBe("discovery");
    expect(response.primaryMove).toBe(response.nextBestQuestion);
    expect(response.commitmentTarget.length).toBeGreaterThan(0);
  });

  it("fills pain and relief from a family-move statement, then prioritizes timeline", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [note(1, "I need to move closer to my daughter.")],
      "outbound",
      NOW,
    );

    expect(result.state.discoveryMap.human_pain).toMatchObject({
      status: "confirmed",
      value: "distance from family is creating pressure",
    });
    expect(result.state.discoveryMap.desired_relief).toMatchObject({
      status: "confirmed",
      value: "move closer to family",
    });
    expect(result.state.discoveryMap.motivation.status).toBe("confirmed");
    // "my daughter" also triggers the family_member decision_maker rule (partial),
    // which takes priority over timeline in computeHighestPriorityGap
    expect(computeHighestPriorityGap(result.state.discoveryMap)).toBe("decision_maker");

    const response = buildLiveCoachResponse(result.state, "outbound");
    expect(response.highestPriorityGap).toBe("decision_maker");
    expect(response.nextBestQuestion).toContain("feel good about the next step");
  });

  it("elevates decision-maker clarity when another signer is involved", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [
        note(1, "The roof leak is getting worse."),
        note(2, "My brother has to sign too."),
      ],
      "outbound",
      NOW,
    );

    expect(result.state.discoveryMap.decision_maker).toMatchObject({
      status: "partial",
      value: "brother is involved",
    });

    const response = buildLiveCoachResponse(result.state, "outbound");
    expect(response.highestPriorityGap).toBe("decision_maker");
    expect(response.guardrails[0]).toContain("Delay commitment-style questions");
    expect(
      response.structuredLiveNotes.filter((entry) =>
        entry.text.includes("brother may be involved"),
      ),
    ).toHaveLength(1);
  });

  it("redirects early price questions toward motivation instead of quoting numbers", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [
        note(1, "There is a roof leak."),
        note(2, "What can you pay for it?"),
      ],
      "outbound",
      NOW,
    );

    expect(result.state.discoveryMap.price_posture.status).toBe("confirmed");

    const response = buildLiveCoachResponse(result.state, "outbound");
    expect(response.highestPriorityGap).toBe("motivation");
    expect(response.nextBestQuestion).toContain("solve this now instead of letting it sit");
    expect(response.guardrails[0]).toContain("do not anchor a number");
    expect(response.dealMode).toBe("price");
    expect(response.pricePosture).not.toBe("not_discussed");
  });

  it("dedupes repeated notes and respects the sequence watermark", () => {
    const firstPass = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [
        note(1, "There is a roof leak."),
        note(2, "There is a roof leak."),
      ],
      "outbound",
      NOW,
    );

    expect(firstPass.state.structuredLiveNotes).toHaveLength(2);
    expect(firstPass.state.lastProcessedSequence).toBe(2);

    const secondPass = reduceLiveCoachState(
      firstPass.state,
      [
        note(2, "There is a roof leak."),
        note(3, "There is a roof leak."),
      ],
      "outbound",
      "2026-03-22T20:00:05.000Z",
    );

    expect(secondPass.processedCount).toBe(1);
    expect(secondPass.state.structuredLiveNotes).toHaveLength(2);
    expect(secondPass.state.lastProcessedSequence).toBe(3);

    const replayPass = reduceLiveCoachState(
      secondPass.state,
      [note(1, "There is a roof leak."), note(2, "There is a roof leak.")],
      "outbound",
      "2026-03-22T20:00:10.000Z",
    );

    expect(replayPass.processedCount).toBe(0);
    expect(replayPass.state.structuredLiveNotes).toHaveLength(2);
  });

  it("keeps operator paraphrases conservative for pain and relief slots", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [note(1, "I need to move closer to my daughter.", "operator")],
      "outbound",
      NOW,
    );

    expect(result.state.discoveryMap.human_pain.status).not.toBe("confirmed");
    expect(result.state.discoveryMap.desired_relief.status).not.toBe("confirmed");
    expect(result.state.discoveryMap.human_pain.status).toBe("partial");
    expect(result.state.discoveryMap.desired_relief.status).toBe("partial");
  });

  it("tracks seller turn freshness in the response", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [note(1, "We are trying to get this solved this month.")],
      "outbound",
      NOW,
    );

    expect(result.hasNewSellerTurn).toBe(true);
    expect(result.state.lastSellerTurnAt).toBe(NOW);

    const response = buildLiveCoachResponse(result.state, "outbound");
    expect(response.lastSellerTurnAt).toBe(NOW);
    expect(response.lastProcessedSequence).toBe(1);
  });

  it("builds a concise post-call recap from discovery answers and negotiation signals", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [
        note(1, "The house needs a lot of repairs and it's becoming too much for me."),
        note(2, "I want to move closer to my daughter."),
        note(3, "I'd like to be done in the next 30 days."),
        note(4, "If the numbers make sense, send me something to review."),
      ],
      "outbound",
      NOW,
    );

    const response = buildLiveCoachResponse(result.state, "outbound");

    expect(response.postCallRecap.bullets.length).toBeGreaterThanOrEqual(4);
    expect(response.postCallRecap.bullets.length).toBeLessThanOrEqual(6);
    expect(response.postCallRecap.discoveryAnswers.motivation).toBeTruthy();
    expect(response.postCallRecap.discoveryAnswers.timeline).toContain("30 days");
    expect(response.postCallRecap.vossSignals.length).toBeGreaterThan(0);
    expect(response.postCallRecap.nepqSignals.join(" ")).toContain("Motivation");
    expect(response.postCallRecap.recommendedSummary.length).toBeGreaterThan(20);
  });

  it("keeps unresolved recap gaps honest instead of inventing missing answers", () => {
    const result = reduceLiveCoachState(
      createEmptyLiveCoachState(NOW),
      [note(1, "The roof leak is getting worse.")],
      "outbound",
      NOW,
    );

    const response = buildLiveCoachResponse(result.state, "outbound");

    expect(response.postCallRecap.discoveryAnswers.timeline).toBeUndefined();
    expect(response.postCallRecap.unresolvedGaps).toContain("human_pain");
    expect(response.postCallRecap.unresolvedGaps.some((gap) => gap === "timeline" || gap === "motivation")).toBe(true);
  });

  it("re-strategizes on a fresh seller turn even when the gap stays the same", () => {
    const firstPass = reduceLiveCoachState(
      createEmptyLiveCoachState("2026-03-22T20:00:00.000Z"),
      [note(1, "The roof leak is getting worse.")],
      "outbound",
      "2026-03-22T20:00:00.000Z",
    );
    const strategized = applyStrategistMove(
      firstPass.state,
      {
        currentStage: null,
        whyThisGapNow: null,
        nextBestQuestion: null,
        backupQuestion: null,
        suggestedMirror: null,
        suggestedLabel: null,
        guardrail: null,
        nepqQuestions: null,
        vossLabels: null,
      },
      "outbound",
      "2026-03-22T20:00:00.000Z",
    );

    const secondPass = reduceLiveCoachState(
      strategized,
      [note(2, "Yeah, I hear you.")],
      "outbound",
      "2026-03-22T20:00:04.000Z",
    );

    expect(secondPass.gapChanged).toBe(false);
    expect(secondPass.hasNewSellerTurn).toBe(true);
    expect(secondPass.state.lastProcessedSequence).toBe(2);
    expect(
      shouldInvokeStrategist(
        strategized,
        secondPass,
        Date.parse("2026-03-22T20:00:04.000Z"),
      ),
    ).toBe(true);
  });
});
