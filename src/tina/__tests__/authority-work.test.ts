import { describe, expect, it } from "vitest";
import {
  buildTinaAuthorityBackgroundProgress,
  buildTinaAuthorityBackgroundQueueState,
  buildTinaAuthorityWorkItems,
  createDefaultTinaAuthorityWorkItem,
  failTinaAuthorityChallengeRun,
  failTinaAuthorityResearchRun,
  mergeTinaAuthorityChallengeRun,
  mergeTinaAuthorityResearchRun,
  queueTinaAuthorityResearchRun,
  queueTinaAuthorityChallengeRun,
  shouldProcessTinaAuthorityBackgroundRun,
  startTinaAuthorityChallengeRun,
  startTinaAuthorityResearchRun,
} from "@/tina/lib/authority-work";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaAuthorityWorkItems", () => {
  it("builds default saved-work views from the current draft", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const workItems = buildTinaAuthorityWorkItems(draft);
    const qbiItem = workItems.find((item) => item.ideaId === "qbi-review");

    expect(workItems.length).toBeGreaterThan(0);
    expect(qbiItem?.status).toBe("not_started");
    expect(qbiItem?.authorityTargets).toEqual(
      expect.arrayContaining(["IRS instructions", "Treasury regulations"])
    );
  });

  it("preserves saved memo, citations, and reviewer state", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [
        {
          ...createDefaultTinaAuthorityWorkItem("qbi-review"),
          status: "researching" as const,
          memo: "Need to confirm the limits.",
          reviewerNotes: "Hold until authority is attached.",
          citations: [
            {
              id: "citation-1",
              title: "IRS example",
              url: "https://www.irs.gov/example",
              sourceClass: "primary_authority" as const,
              effect: "supports" as const,
              note: "Potentially helpful.",
            },
          ],
        },
      ],
    };

    const workItems = buildTinaAuthorityWorkItems(draft);
    const qbiItem = workItems.find((item) => item.ideaId === "qbi-review");

    expect(qbiItem?.status).toBe("researching");
    expect(qbiItem?.memo).toContain("confirm the limits");
    expect(qbiItem?.citations).toHaveLength(1);
  });

  it("heals mojibake in saved authority-work text before Tina shows it again", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [
        {
          ...createDefaultTinaAuthorityWorkItem("qbi-review"),
          status: "researching" as const,
          memo: "Blue Cedarâ€™s memo cites IRC Â§199A.",
          challengeMemo: "The item was placed inæœåŠ¡ in 2025.",
          reviewerNotes: "Keep the â€œplain languageâ€ explanation.",
          missingAuthority: ["Confirm IRC Â§199A limits."],
          challengeWarnings: ["Watch the â€œowner wagesâ€ assumption."],
          challengeQuestions: ["Was it placed inæœåŠ¡ in 2025?"],
          citations: [
            {
              id: "citation-1",
              title: "26 U.S. Code Â§ 199A",
              url: "https://www.irs.gov/example",
              sourceClass: "primary_authority" as const,
              effect: "supports" as const,
              note: "Blue Cedarâ€™s strongest lead.",
            },
          ],
        },
      ],
    };

    const workItems = buildTinaAuthorityWorkItems(draft);
    const qbiItem = workItems.find((item) => item.ideaId === "qbi-review");

    expect(qbiItem?.memo).toBe("Blue Cedar's memo cites IRC §199A.");
    expect(qbiItem?.challengeMemo).toBe("The item was placed in service in 2025.");
    expect(qbiItem?.reviewerNotes).toBe('Keep the "plain language" explanation.');
    expect(qbiItem?.missingAuthority).toEqual(["Confirm IRC §199A limits."]);
    expect(qbiItem?.challengeWarnings).toEqual(['Watch the "owner wages" assumption.']);
    expect(qbiItem?.challengeQuestions).toEqual(["Was it placed in service in 2025?"]);
    expect(qbiItem?.citations[0]).toMatchObject({
      title: "26 U.S. Code § 199A",
      note: "Blue Cedar's strongest lead.",
    });
  });

  it("treats a saved do-not-use reviewer decision as rejected work", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [
        {
          ...createDefaultTinaAuthorityWorkItem("wa-state-review"),
          status: "ready_for_reviewer" as const,
          reviewerDecision: "do_not_use" as const,
          memo: "Keep this out of the federal package.",
        },
      ],
    };

    const workItems = buildTinaAuthorityWorkItems(draft);
    const stateItem = workItems.find((item) => item.ideaId === "wa-state-review");

    expect(stateItem?.reviewerDecision).toBe("do_not_use");
    expect(stateItem?.status).toBe("rejected");
  });
});

describe("mergeTinaAuthorityResearchRun", () => {
  it("merges AI memo, missing authority, and citations into saved work", () => {
    const current = startTinaAuthorityResearchRun(
      queueTinaAuthorityResearchRun(createDefaultTinaAuthorityWorkItem("qbi-review"))
    );

    const merged = mergeTinaAuthorityResearchRun(current, {
      memo: "QBI may apply here, but Tina still needs stronger primary support.",
      missingAuthority: ["Need primary authority that clearly fits this fact pattern"],
      citations: [
        {
          id: "citation-1",
          title: "IRS source",
          url: "https://www.irs.gov/example",
          sourceClass: "primary_authority",
          effect: "supports",
          note: "Potentially relevant authority.",
        },
      ],
      status: "researching",
      reviewerDecision: "need_more_support",
      disclosureDecision: "needs_review",
      lastAiRunAt: "2026-03-26T23:05:00.000Z",
    });

    expect(merged.memo).toContain("QBI may apply");
    expect(merged.missingAuthority).toHaveLength(1);
    expect(merged.citations).toHaveLength(1);
    expect(merged.lastAiRunAt).toBe("2026-03-26T23:05:00.000Z");
    expect(merged.researchRun.status).toBe("succeeded");
    expect(merged.researchRun.finishedAt).toBe("2026-03-26T23:05:00.000Z");
  });

  it("sanitizes saved memo and citation text while merging a new research result", () => {
    const current = startTinaAuthorityResearchRun(
      queueTinaAuthorityResearchRun({
        ...createDefaultTinaAuthorityWorkItem("qbi-review"),
        memo: "Blue Cedarâ€™s memo cites IRC Â§199A.",
        missingAuthority: ["Confirm IRC Â§199A limits."],
        citations: [
          {
            id: "citation-1",
            title: "26 U.S. Code Â§ 199A",
            url: "https://www.irs.gov/example",
            sourceClass: "primary_authority",
            effect: "supports",
            note: "Blue Cedarâ€™s strongest lead.",
          },
        ],
      })
    );

    const merged = mergeTinaAuthorityResearchRun(current, {
      memo: "This still needs stronger proof.",
      missingAuthority: ["Need a cleaner fact pattern."],
      citations: [],
      status: "researching",
      reviewerDecision: "need_more_support",
      disclosureDecision: "needs_review",
      lastAiRunAt: "2026-03-29T23:05:00.000Z",
    });

    expect(merged.memo).toBe("This still needs stronger proof.");
    expect(merged.missingAuthority).toEqual(["Need a cleaner fact pattern."]);
    expect(merged.citations[0]).toMatchObject({
      title: "26 U.S. Code § 199A",
      note: "Blue Cedar's strongest lead.",
    });
  });
});

describe("mergeTinaAuthorityChallengeRun", () => {
  it("saves a stress-test result without dropping the earlier research trail", () => {
    const current = {
      ...createDefaultTinaAuthorityWorkItem("qbi-review"),
      memo: "This may work if the facts fit.",
      missingAuthority: ["Need primary authority that clearly fits this fact pattern"],
      citations: [
        {
          id: "citation-1",
          title: "IRS source",
          url: "https://www.irs.gov/example",
          sourceClass: "primary_authority" as const,
          effect: "supports" as const,
          note: "Potentially relevant authority.",
        },
      ],
      lastAiRunAt: "2026-03-26T23:05:00.000Z",
    };

    const merged = mergeTinaAuthorityChallengeRun(current, {
      challengeVerdict: "needs_care",
      challengeMemo: "This idea may still work, but only if the taxpayer facts match very closely.",
      challengeWarnings: [
        "The authority may be narrower than the first read suggests.",
        "A reviewer should confirm the business facts match the authority exactly.",
      ],
      challengeQuestions: [
        "Do the current-year facts still match the fact pattern in the authority?",
      ],
      citations: [
        {
          id: "citation-2",
          title: "Treasury regulation",
          url: "https://www.ecfr.gov/example",
          sourceClass: "primary_authority",
          effect: "warns",
          note: "Adds a limiting condition.",
        },
      ],
      missingAuthority: ["Need a source that addresses the limiting condition directly"],
      status: "ready_for_reviewer",
      reviewerDecision: "need_more_support",
      disclosureDecision: "needs_review",
      lastChallengeRunAt: "2026-03-27T01:00:00.000Z",
    });

    expect(merged.memo).toContain("may work");
    expect(merged.challengeVerdict).toBe("needs_care");
    expect(merged.challengeWarnings).toHaveLength(2);
    expect(merged.challengeQuestions).toHaveLength(1);
    expect(merged.citations).toHaveLength(2);
    expect(merged.missingAuthority).toEqual([
      "Need primary authority that clearly fits this fact pattern",
      "Need a source that addresses the limiting condition directly",
    ]);
    expect(merged.lastAiRunAt).toBe("2026-03-26T23:05:00.000Z");
    expect(merged.lastChallengeRunAt).toBe("2026-03-27T01:00:00.000Z");
    expect(merged.challengeRun.status).toBe("succeeded");
    expect(merged.challengeRun.finishedAt).toBe("2026-03-27T01:00:00.000Z");
  });
});

describe("authority background runs", () => {
  it("queues, retries, and resumes a research lane without losing the work item", () => {
    const queued = queueTinaAuthorityResearchRun(createDefaultTinaAuthorityWorkItem("qbi-review"));
    expect(queued.researchRun.status).toBe("queued");
    expect(shouldProcessTinaAuthorityBackgroundRun(queued.researchRun)).toBe(true);

    const running = startTinaAuthorityResearchRun(queued);
    expect(running.researchRun.status).toBe("running");
    expect(shouldProcessTinaAuthorityBackgroundRun(running.researchRun)).toBe(false);

    const rateLimited = failTinaAuthorityResearchRun(running, {
      error: "Rate limit hit. Try again in 8s.",
      retryAt: "2026-03-28T18:00:08.000Z",
    });
    expect(rateLimited.researchRun.status).toBe("rate_limited");
    expect(
      shouldProcessTinaAuthorityBackgroundRun(rateLimited.researchRun, {
        now: Date.parse("2026-03-28T18:00:00.000Z"),
      })
    ).toBe(false);
    expect(
      shouldProcessTinaAuthorityBackgroundRun(rateLimited.researchRun, {
        now: Date.parse("2026-03-28T18:00:09.000Z"),
      })
    ).toBe(true);
  });

  it("marks a first failed challenge attempt as unfinished instead of not run", () => {
    const running = startTinaAuthorityChallengeRun(
      queueTinaAuthorityChallengeRun(createDefaultTinaAuthorityWorkItem("qbi-review"))
    );

    const failed = failTinaAuthorityChallengeRun(running, {
      error: "Tina could not finish this stress test.",
    });

    expect(failed.challengeRun.status).toBe("failed");
    expect(failed.challengeVerdict).toBe("did_not_finish");
    expect(failed.challengeMemo).toBe("Tina could not finish this stress test.");
    expect(failed.lastChallengeRunAt).toBeNull();
  });

  it("keeps a prior challenge verdict when only a rerun fails", () => {
    const running = startTinaAuthorityChallengeRun(
      queueTinaAuthorityChallengeRun({
        ...createDefaultTinaAuthorityWorkItem("qbi-review"),
        challengeVerdict: "needs_care" as const,
        challengeMemo: "Earlier challenge found narrow fact-pattern risk.",
        lastChallengeRunAt: "2026-03-29T18:20:00.000Z",
      })
    );

    const failed = failTinaAuthorityChallengeRun(running, {
      error: "Tina could not finish this rerun.",
    });

    expect(failed.challengeRun.status).toBe("failed");
    expect(failed.challengeVerdict).toBe("needs_care");
    expect(failed.challengeMemo).toBe("Earlier challenge found narrow fact-pattern risk.");
    expect(failed.lastChallengeRunAt).toBe("2026-03-29T18:20:00.000Z");
  });

  it("summarizes tracked deeper-pass progress with a rough remaining-time estimate", () => {
    const progress = buildTinaAuthorityBackgroundProgress(
      [
        {
          ...createDefaultTinaAuthorityWorkItem("qbi-review"),
          researchRun: {
            status: "succeeded",
            jobId: "research-1",
            queuedAt: "2026-03-28T18:00:00.000Z",
            startedAt: "2026-03-28T18:00:00.000Z",
            finishedAt: "2026-03-28T18:05:00.000Z",
            retryAt: null,
            error: null,
          },
          challengeRun: {
            status: "running",
            jobId: "challenge-1",
            queuedAt: "2026-03-28T18:06:00.000Z",
            startedAt: "2026-03-28T18:10:00.000Z",
            finishedAt: null,
            retryAt: null,
            error: null,
          },
        },
        {
          ...createDefaultTinaAuthorityWorkItem("wa-state-review"),
          researchRun: {
            status: "queued",
            jobId: "research-2",
            queuedAt: "2026-03-28T18:14:00.000Z",
            startedAt: null,
            finishedAt: null,
            retryAt: null,
            error: null,
          },
          challengeRun: {
            status: "idle",
            jobId: null,
            queuedAt: null,
            startedAt: null,
            finishedAt: null,
            retryAt: null,
            error: null,
          },
        },
      ],
      Date.parse("2026-03-28T18:15:00.000Z")
    );

    expect(progress.trackedTaskCount).toBe(3);
    expect(progress.completedTaskCount).toBe(1);
    expect(progress.remainingTaskCount).toBe(2);
    expect(progress.progressPercent).toBe(33);
    expect(progress.estimatedRemainingMs).toBeGreaterThanOrEqual(11 * 60_000);
    expect(progress.estimatedRemainingMs).toBeLessThanOrEqual(13 * 60_000);
  });

  it("picks due research work before queued challenge work", () => {
    const queueState = buildTinaAuthorityBackgroundQueueState([
      {
        ...createDefaultTinaAuthorityWorkItem("qbi-review"),
        title: "QBI review",
        summary: "summary",
        nextStep: "next",
        memoFocus: "memo",
        reviewerQuestion: "question",
        authorityTargets: [],
        documentIds: [],
        factIds: [],
        researchRun: {
          status: "queued",
          jobId: "research-1",
          queuedAt: "2026-03-29T16:00:00.000Z",
          startedAt: null,
          finishedAt: null,
          retryAt: null,
          error: null,
        },
        challengeRun: {
          status: "queued",
          jobId: "challenge-1",
          queuedAt: "2026-03-29T16:00:00.000Z",
          startedAt: null,
          finishedAt: null,
          retryAt: null,
          error: null,
        },
      },
    ]);

    expect(queueState.nextTask).toMatchObject({
      kind: "research",
      ideaId: "qbi-review",
      delayMs: 0,
    });
    expect(queueState.hasPendingWork).toBe(true);
    expect(queueState.nextPollDelayMs).toBe(0);
  });

  it("waits for active research before it allows challenge work to start", () => {
    const queueState = buildTinaAuthorityBackgroundQueueState(
      [
        {
          ...createDefaultTinaAuthorityWorkItem("qbi-review"),
          title: "QBI review",
          summary: "summary",
          nextStep: "next",
          memoFocus: "memo",
          reviewerQuestion: "question",
          authorityTargets: [],
          documentIds: [],
          factIds: [],
          researchRun: {
            status: "rate_limited",
            jobId: "research-1",
            queuedAt: "2026-03-29T16:00:00.000Z",
            startedAt: "2026-03-29T16:01:00.000Z",
            finishedAt: "2026-03-29T16:01:10.000Z",
            retryAt: "2026-03-29T16:05:00.000Z",
            error: "Rate limit",
          },
          challengeRun: {
            status: "queued",
            jobId: "challenge-1",
            queuedAt: "2026-03-29T16:00:00.000Z",
            startedAt: null,
            finishedAt: null,
            retryAt: null,
            error: null,
          },
        },
      ],
      {
        now: Date.parse("2026-03-29T16:02:00.000Z"),
      }
    );

    expect(queueState.nextTask).toBeNull();
    expect(queueState.hasPendingWork).toBe(true);
    expect(queueState.nextPollDelayMs).toBe(3 * 60_000);
  });
});
