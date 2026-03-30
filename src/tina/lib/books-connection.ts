import type { TinaBooksConnectionSnapshot, TinaStoredDocument } from "@/tina/types";

const QUICKBOOKS_REQUEST_ID = "quickbooks";

function countBooksDocuments(documents: TinaStoredDocument[]): number {
  return documents.filter((document) => document.requestId === QUICKBOOKS_REQUEST_ID).length;
}

export function createDefaultTinaBooksConnection(): TinaBooksConnectionSnapshot {
  return {
    provider: "quickbooks",
    status: "not_connected",
    summary: "Tina is waiting for one clear books source.",
    nextStep: "Add a QuickBooks export or a profit-and-loss report so Tina can start sorting your books.",
    connectedAt: null,
    lastSyncAt: null,
    companyName: "",
    realmId: null,
  };
}

export function createUploadOnlyTinaBooksConnection(
  documentCount: number,
  current?: TinaBooksConnectionSnapshot
): TinaBooksConnectionSnapshot {
  return {
    provider: "quickbooks",
    status: "upload_only",
    summary:
      documentCount > 0
        ? `Tina is using ${documentCount} uploaded book ${documentCount === 1 ? "file" : "files"} for now.`
        : "Tina is set to use uploaded book files for now.",
    nextStep:
      documentCount > 0
        ? "Let Tina read these book files, then rebuild the books snapshot."
        : "Add a QuickBooks export, profit-and-loss report, or general ledger here.",
    connectedAt: null,
    lastSyncAt: null,
    companyName: current?.companyName ?? "",
    realmId: current?.realmId ?? null,
  };
}

export function createPlanningLiveSyncTinaBooksConnection(
  documentCount: number,
  current?: TinaBooksConnectionSnapshot
): TinaBooksConnectionSnapshot {
  return {
    provider: "quickbooks",
    status: "planning_live_sync",
    summary:
      documentCount > 0
        ? "Tina is using uploaded book files now and holding this lane open for a live QuickBooks link later."
        : "Tina is holding this lane open for a live QuickBooks link later.",
    nextStep:
      documentCount > 0
        ? "Keep using uploads here for now. Tina can plug live QuickBooks sync into this same spot later."
        : "Add one books file now, or come back here when Tina is ready for a live QuickBooks link.",
    connectedAt: current?.connectedAt ?? null,
    lastSyncAt: current?.lastSyncAt ?? null,
    companyName: current?.companyName ?? "",
    realmId: current?.realmId ?? null,
  };
}

export function syncTinaBooksConnectionWithDocuments(
  current: TinaBooksConnectionSnapshot,
  documents: TinaStoredDocument[]
): TinaBooksConnectionSnapshot {
  const documentCount = countBooksDocuments(documents);

  if (current.status === "planning_live_sync") {
    return createPlanningLiveSyncTinaBooksConnection(documentCount, current);
  }

  if (current.status === "connected") {
    return {
      ...current,
      summary:
        documentCount > 0
          ? `Tina has a live QuickBooks link and ${documentCount} uploaded backup ${documentCount === 1 ? "file" : "files"}.`
          : "Tina has a live QuickBooks link.",
      nextStep:
        documentCount > 0
          ? "Tina can compare the live books feed with your uploaded backup files."
          : "Run a live sync when you are ready, or add a backup books file here.",
    };
  }

  if (current.status === "needs_attention") {
    return {
      ...current,
      summary:
        documentCount > 0
          ? "Tina needs help with the books lane, but your uploaded files are still here."
          : current.summary,
      nextStep:
        documentCount > 0
          ? "Check the books lane note, then let Tina sort the uploaded files again."
          : current.nextStep,
    };
  }

  if (documentCount > 0) {
    return createUploadOnlyTinaBooksConnection(documentCount, current);
  }

  return createDefaultTinaBooksConnection();
}
