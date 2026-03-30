import { describe, expect, it } from "vitest";
import {
  getTinaDraftSyncStatusAfterSave,
  isTinaDraftSaveOutdated,
  shouldReplaceLocalTinaDraftAfterSave,
} from "@/tina/lib/draft-sync";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("draft sync helpers", () => {
  it("flags older save responses so they do not overwrite newer work", () => {
    expect(isTinaDraftSaveOutdated(2, 3)).toBe(true);
    expect(isTinaDraftSaveOutdated(3, 3)).toBe(false);
  });

  it("replaces the local draft only when the saved candidate still matches local state", () => {
    const candidateDraft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Northlight Systems LLC",
      },
    };

    expect(shouldReplaceLocalTinaDraftAfterSave(candidateDraft, candidateDraft)).toBe(true);

    expect(
      shouldReplaceLocalTinaDraftAfterSave(candidateDraft, {
        ...candidateDraft,
        profile: {
          ...candidateDraft.profile,
          entityType: "single_member_llc",
        },
      })
    ).toBe(false);
  });

  it("keeps Tina in a saving state when newer local work still needs to sync", () => {
    const savedDraft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Northlight Systems LLC",
      },
    };
    const newerLocalDraft = {
      ...savedDraft,
      profile: {
        ...savedDraft.profile,
        entityType: "single_member_llc",
      },
    };

    expect(getTinaDraftSyncStatusAfterSave(newerLocalDraft, savedDraft)).toBe("saving");
    expect(getTinaDraftSyncStatusAfterSave(savedDraft, savedDraft)).toBe("saved");
  });
});
