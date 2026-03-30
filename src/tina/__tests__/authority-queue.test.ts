import { describe, expect, it } from "vitest";
import {
  buildTinaAuthorityWorkItems,
  queueTinaAuthorityChallengeRun,
  startTinaAuthorityChallengeRun,
} from "@/tina/lib/authority-work";
import { processTinaAuthorityQueueTask } from "@/tina/lib/authority-queue";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("processTinaAuthorityQueueTask", () => {
  it("saves an unfinished verdict when a first challenge attempt fails", async () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const seededDraft = {
      ...baseDraft,
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...baseDraft.profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
    };
    const dossier = buildTinaResearchDossiers(seededDraft)[0]!;
    const surfacedWorkItem = buildTinaAuthorityWorkItems(seededDraft).find(
      (item) => item.ideaId === dossier.id
    )!;
    const initialWorkItem = queueTinaAuthorityChallengeRun(
      surfacedWorkItem
    );
    const draft = {
      ...seededDraft,
      authorityWork: [initialWorkItem],
    };
    const workItemView = buildTinaAuthorityWorkItems(draft).find((item) => item.ideaId === dossier.id)!;
    const currentWorkItem = startTinaAuthorityChallengeRun(initialWorkItem);

    const processed = await processTinaAuthorityQueueTask({
      kind: "challenge",
      draft,
      dossier,
      currentWorkItem,
      workItemView: {
        ...workItemView,
        ...currentWorkItem,
      },
      runChallenge: async () => {
        throw new Error("Tina could not finish this stress test.");
      },
    });

    expect(processed.responseStatus).toBe(500);
    expect(processed.workItem.challengeRun.status).toBe("failed");
    expect(processed.workItem.challengeVerdict).toBe("did_not_finish");
    expect(processed.workItem.challengeMemo).toBe("Tina could not finish this stress test.");
    expect(processed.workItem.lastChallengeRunAt).toBeNull();
  });
});
