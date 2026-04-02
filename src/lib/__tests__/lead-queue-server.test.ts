import { describe, expect, it } from "vitest";

import { buildLeadQueueRow } from "@/lib/lead-queue-server";

describe("buildLeadQueueRow", () => {
  it("strips heavy owner flag payloads while preserving useful queue metadata", () => {
    const row = buildLeadQueueRow({
      id: "lead-1",
      property_id: "property-1",
      priority: 80,
      status: "lead",
      source: "csv_import",
      tags: ["probate", "vacant"],
      total_calls: 2,
      live_answers: 1,
      properties: {
        id: "property-1",
        county: "Spokane",
        address: "123 Main St",
        city: "Spokane",
        state: "WA",
        zip: "99201",
        owner_name: "Alice Owner",
        owner_phone: "5095551111",
        owner_flags: {
          absentee: true,
          pr_raw: { huge: true },
          deep_crawl: { huge: true },
          deep_crawl_result: { huge: true },
          bricked_full_response: { huge: true },
          prospecting_intake: {
            source_channel: "csv_import",
            import_batch_id: "batch-1",
            niche_tag: "probate",
          },
          outbound_intake: {
            attempt_count: 3,
            wrong_number: false,
          },
        },
      },
    }, 90);

    expect(row.predictivePriority).toBe(84);
    expect(row.ownerBadge).toBe("absentee");
    expect(row.importBatchId).toBe("batch-1");
    expect(row.nicheTag).toBe("probate");
    expect(row.ownerFlags).toEqual(expect.objectContaining({
      absentee: true,
      prospecting_intake: expect.any(Object),
      outbound_intake: expect.any(Object),
    }));
    expect(row.ownerFlags).not.toHaveProperty("pr_raw");
    expect(row.ownerFlags).not.toHaveProperty("deep_crawl");
    expect(row.ownerFlags).not.toHaveProperty("deep_crawl_result");
    expect(row.ownerFlags).not.toHaveProperty("bricked_full_response");
  });

  it("falls back safely when property data is missing", () => {
    const row = buildLeadQueueRow({
      id: "lead-2",
      status: "closed",
      priority: null,
    });

    expect(row.id).toBe("lead-2");
    expect(row.status).toBe("closed");
    expect(row.address).toBe("Unknown");
    expect(row.ownerName).toBe("Unknown");
    expect(row.predictivePriority).toBe(0);
    expect(row.ownerFlags).toEqual({});
  });
});
