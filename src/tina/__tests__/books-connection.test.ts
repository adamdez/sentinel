import { describe, expect, it } from "vitest";
import {
  createDefaultTinaBooksConnection,
  createPlanningLiveSyncTinaBooksConnection,
  createUploadOnlyTinaBooksConnection,
  syncTinaBooksConnectionWithDocuments,
} from "@/tina/lib/books-connection";

describe("books connection helpers", () => {
  it("starts disconnected by default", () => {
    const snapshot = createDefaultTinaBooksConnection();

    expect(snapshot.status).toBe("not_connected");
    expect(snapshot.summary).toContain("waiting");
  });

  it("can switch into upload-only mode", () => {
    const snapshot = createUploadOnlyTinaBooksConnection(2);

    expect(snapshot.status).toBe("upload_only");
    expect(snapshot.summary).toContain("2 uploaded book files");
  });

  it("keeps planning-live-sync language while uploads are present", () => {
    const base = createPlanningLiveSyncTinaBooksConnection(0);

    const synced = syncTinaBooksConnectionWithDocuments(base, [
      {
        id: "doc-quickbooks",
        name: "profit-loss.xlsx",
        size: 1200,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        storagePath: "tina/docs/profit-loss.xlsx",
        category: "supporting_document" as const,
        requestId: "quickbooks",
        requestLabel: "QuickBooks export",
        uploadedAt: "2026-03-27T10:00:00.000Z",
      },
    ]);

    expect(synced.status).toBe("planning_live_sync");
    expect(synced.summary).toContain("holding this lane open");
  });
});
