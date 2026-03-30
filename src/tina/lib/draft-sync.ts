import type { TinaDraftSyncStatus, TinaWorkspaceDraft } from "@/tina/types";

function serializeDraft(draft: TinaWorkspaceDraft): string {
  return JSON.stringify(draft);
}

export function isTinaDraftSaveOutdated(
  requestId: number,
  latestResolvedRequestId: number
): boolean {
  return requestId < latestResolvedRequestId;
}

export function shouldReplaceLocalTinaDraftAfterSave(
  candidateDraft: TinaWorkspaceDraft,
  currentDraft: TinaWorkspaceDraft
): boolean {
  return serializeDraft(candidateDraft) === serializeDraft(currentDraft);
}

export function getTinaDraftSyncStatusAfterSave(
  currentDraft: TinaWorkspaceDraft,
  savedDraft: TinaWorkspaceDraft
): TinaDraftSyncStatus {
  return serializeDraft(currentDraft) === serializeDraft(savedDraft) ? "saved" : "saving";
}
