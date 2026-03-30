import { buildTinaAiCleanupSnapshot } from "@/tina/lib/ai-cleanup";
import { buildTinaBootstrapReview } from "@/tina/lib/bootstrap-review";
import { buildTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { buildTinaCleanupPlan } from "@/tina/lib/cleanup-plan";
import { buildTinaFinalSignoff } from "@/tina/lib/final-signoff";
import { buildTinaIssueQueue } from "@/tina/lib/issue-queue";
import { buildTinaOfficialFormPacket } from "@/tina/lib/official-form-packet";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaReviewerFinalSnapshot } from "@/tina/lib/reviewer-final";
import { buildTinaScheduleCDraft } from "@/tina/lib/schedule-c-draft";
import { buildTinaTaxAdjustmentSnapshot } from "@/tina/lib/tax-adjustments";
import { buildTinaWorkpaperSnapshot } from "@/tina/lib/workpapers";
import type { TinaWorkspaceDraft } from "@/tina/types";

function preserveLastRunAtIfUnchanged<T extends { lastRunAt: string | null }>(
  previous: T,
  next: T
): T {
  return JSON.stringify({ ...next, lastRunAt: previous.lastRunAt }) === JSON.stringify(previous)
    ? {
        ...next,
        lastRunAt: previous.lastRunAt,
      }
    : next;
}

export function reconcileTinaDerivedWorkspace(
  draft: TinaWorkspaceDraft
): TinaWorkspaceDraft {
  let next: TinaWorkspaceDraft = {
    ...draft,
  };

  next = {
    ...next,
    bootstrapReview: buildTinaBootstrapReview(next),
  };

  next = {
    ...next,
    issueQueue: buildTinaIssueQueue(next),
  };

  next = {
    ...next,
    workpapers: buildTinaWorkpaperSnapshot(next),
  };

  next = {
    ...next,
    cleanupPlan: buildTinaCleanupPlan(next),
  };

  next = {
    ...next,
    aiCleanup: buildTinaAiCleanupSnapshot(next),
  };

  next = {
    ...next,
    taxAdjustments: buildTinaTaxAdjustmentSnapshot(next),
  };

  next = {
    ...next,
    reviewerFinal: buildTinaReviewerFinalSnapshot(next),
  };

  next = {
    ...next,
    scheduleCDraft: buildTinaScheduleCDraft(next),
  };

  next = {
    ...next,
    packageReadiness: buildTinaPackageReadiness(next),
  };

  next = {
    ...next,
    officialFormPacket: buildTinaOfficialFormPacket(next),
  };

  next = {
    ...next,
    cpaHandoff: buildTinaCpaHandoff(next),
  };

  next = {
    ...next,
    finalSignoff: buildTinaFinalSignoff(next),
  };

  return next;
}

export function revalidateTinaCompletedDerivedWorkspace(
  draft: TinaWorkspaceDraft
): TinaWorkspaceDraft {
  let next: TinaWorkspaceDraft = {
    ...draft,
  };

  if (next.bootstrapReview.status === "complete") {
    next = {
      ...next,
      bootstrapReview: preserveLastRunAtIfUnchanged(
        next.bootstrapReview,
        buildTinaBootstrapReview(next)
      ),
    };
  }

  if (next.issueQueue.status === "complete") {
    next = {
      ...next,
      issueQueue: preserveLastRunAtIfUnchanged(next.issueQueue, buildTinaIssueQueue(next)),
    };
  }

  if (next.workpapers.status === "complete") {
    next = {
      ...next,
      workpapers: preserveLastRunAtIfUnchanged(next.workpapers, buildTinaWorkpaperSnapshot(next)),
    };
  }

  if (next.cleanupPlan.status === "complete") {
    next = {
      ...next,
      cleanupPlan: preserveLastRunAtIfUnchanged(next.cleanupPlan, buildTinaCleanupPlan(next)),
    };
  }

  if (next.aiCleanup.status === "complete") {
    next = {
      ...next,
      aiCleanup: preserveLastRunAtIfUnchanged(next.aiCleanup, buildTinaAiCleanupSnapshot(next)),
    };
  }

  if (next.taxAdjustments.status === "complete") {
    next = {
      ...next,
      taxAdjustments: preserveLastRunAtIfUnchanged(
        next.taxAdjustments,
        buildTinaTaxAdjustmentSnapshot(next)
      ),
    };
  }

  if (next.reviewerFinal.status === "complete") {
    next = {
      ...next,
      reviewerFinal: preserveLastRunAtIfUnchanged(
        next.reviewerFinal,
        buildTinaReviewerFinalSnapshot(next)
      ),
    };
  }

  if (next.scheduleCDraft.status === "complete") {
    next = {
      ...next,
      scheduleCDraft: preserveLastRunAtIfUnchanged(
        next.scheduleCDraft,
        buildTinaScheduleCDraft(next)
      ),
    };
  }

  if (next.packageReadiness.status === "complete") {
    next = {
      ...next,
      packageReadiness: preserveLastRunAtIfUnchanged(
        next.packageReadiness,
        buildTinaPackageReadiness(next)
      ),
    };
  }

  if (next.officialFormPacket.status === "complete") {
    next = {
      ...next,
      officialFormPacket: preserveLastRunAtIfUnchanged(
        next.officialFormPacket,
        buildTinaOfficialFormPacket(next)
      ),
    };
  }

  if (next.cpaHandoff.status === "complete") {
    next = {
      ...next,
      cpaHandoff: preserveLastRunAtIfUnchanged(next.cpaHandoff, buildTinaCpaHandoff(next)),
    };
  }

  if (next.finalSignoff.status === "complete") {
    next = {
      ...next,
      finalSignoff: preserveLastRunAtIfUnchanged(
        next.finalSignoff,
        buildTinaFinalSignoff(next)
      ),
    };
  }

  return next;
}
