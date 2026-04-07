import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  applyScoutIngestionPolicy: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/scout-ingest", () => ({
  applyScoutIngestionPolicy: (...args: unknown[]) => mocks.applyScoutIngestionPolicy(...args),
}));

describe("POST /api/ingest/spokane-scout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    process.env.INGEST_WEBHOOK_SECRET = "test-secret";
    mocks.createServerClient.mockReturnValue({});
  });

  it("returns summarized ingest statuses with persisted update totals", async () => {
    mocks.applyScoutIngestionPolicy
      .mockResolvedValueOnce({
        ok: true,
        ingest_status: "created",
        persisted_updates: 2,
        failure_reason: null,
        entity_ids: { property_id: "p1", lead_id: "l1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        ingest_status: "enriched",
        persisted_updates: 1,
        failure_reason: null,
        entity_ids: { property_id: "p2", lead_id: "l2" },
      });

    const { POST } = await import("@/app/api/ingest/spokane-scout/route");
    const res = await POST(new Request("http://localhost/api/ingest/spokane-scout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": "test-secret",
      },
      body: JSON.stringify({
        ingest_mode: "create",
        records: [
          {
            source_system: "spokane_scout_crawler",
            source_run_id: "run-1",
            source_record_id: "r1",
            property: { address: "1 Main", city: "Spokane", state: "WA", zip: "99201" },
          },
          {
            source_system: "spokane_scout_crawler",
            source_run_id: "run-1",
            source_record_id: "r2",
            property: { address: "2 Main", city: "Spokane", state: "WA", zip: "99201" },
          },
        ],
      }),
    }) as never);

    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.summary).toMatchObject({
      total: 2,
      created: 1,
      enriched: 1,
      skipped: 0,
      failed: 0,
      persisted_updates: 3,
    });
  });
});

