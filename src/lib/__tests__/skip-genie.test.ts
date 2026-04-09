import { describe, expect, it } from "vitest";
import { deriveSkipGenieMarker, hasSkipGenieMarker } from "@/lib/skip-genie";

describe("skip genie marker", () => {
  it("shows when an explicit skip genie import flag exists", () => {
    const marker = deriveSkipGenieMarker({
      ownerFlags: {
        skip_genie: {
          status: "enriched",
          imported_at: "2026-04-09T18:20:46.000Z",
        },
      },
    });

    expect(marker).not.toBeNull();
    expect(marker?.importedAt).toBe("2026-04-09T18:20:46.000Z");
  });

  it("falls back to skip genie source labels", () => {
    expect(hasSkipGenieMarker({
      sourceVendor: "Skip Genie",
      sourceListName: "Skip Genie Return",
    })).toBe(true);
  });

  it("stays hidden for unrelated leads", () => {
    expect(hasSkipGenieMarker({
      sourceVendor: "CSV Import",
      sourceListName: "Probate April",
      ownerFlags: {},
    })).toBe(false);
  });
});
