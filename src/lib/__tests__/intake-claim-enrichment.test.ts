import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCountyData: vi.fn(),
  isCountySupported: vi.fn(),
  querySpokaneOwnerByAddress: vi.fn(),
  fanOutAgents: vi.fn(),
  isOpenClawConfigured: vi.fn(),
}));

vi.mock("@/lib/county-data", () => ({
  getCountyData: mocks.getCountyData,
  isCountySupported: mocks.isCountySupported,
  querySpokaneOwnerByAddress: mocks.querySpokaneOwnerByAddress,
}));

vi.mock("@/lib/openclaw-client", () => ({
  fanOutAgents: mocks.fanOutAgents,
  isOpenClawConfigured: mocks.isOpenClawConfigured,
}));

function createSb(propertyOverrides?: Record<string, unknown>) {
  const property = {
    id: "property-1",
    owner_name: "Unknown",
    address: "4705 North Fruit Hill Road",
    city: "Spokane",
    state: "WA",
    zip: "99217",
    county: "Spokane",
    apn: "TBD",
    lat: null,
    lng: null,
    owner_flags: {},
    ...propertyOverrides,
  };

  const update = vi.fn().mockResolvedValue({ error: null });

  return {
    update,
    client: {
      from(table: string) {
        if (table === "properties") {
          return {
            select() {
              return {
                eq() {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: property,
                      error: null,
                    }),
                  };
                },
              };
            },
            update(payload: Record<string, unknown>) {
              update(payload);
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("runClaimEnrichment", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.isCountySupported.mockReturnValue(true);
    mocks.getCountyData.mockResolvedValue({ owner: null, sales: [] });
    mocks.querySpokaneOwnerByAddress.mockResolvedValue([]);
    mocks.isOpenClawConfigured.mockReturnValue(false);
    mocks.fanOutAgents.mockResolvedValue({ results: [], meta: { agentsRun: [], agentsSucceeded: [], agentsFailed: [], totalDurationMs: 0 } });
  });

  it("fills county data by address when APN is missing", async () => {
    const sb = createSb();
    mocks.querySpokaneOwnerByAddress.mockResolvedValue([
      {
        apn: "35054.0101",
        ownerName: "Barrington Kip",
        siteAddress: "4705 North Fruit Hill Road",
        taxYear: 2026,
        assessmentYear: 2026,
        segStatus: "Active-Complete",
        siteState: "WA",
        siteZip: "99217",
        exemptionAmount: 0,
        rawAttributes: {},
      },
    ]);

    const { runClaimEnrichment } = await import("@/lib/intake-claim-enrichment");
    await runClaimEnrichment({
      sb: sb.client as never,
      propertyId: "property-1",
      leadId: "lead-1",
    });

    expect(mocks.querySpokaneOwnerByAddress).toHaveBeenCalledWith("4705 North Fruit Hill Road", 1);
    expect(sb.update).toHaveBeenCalled();
    const payload = sb.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(payload.apn).toBe("35054.0101");
    expect(payload.owner_name).toBe("Barrington Kip");
    expect((payload.owner_flags as Record<string, unknown>).county_data).toBeTruthy();
  });

  it("stores property photos from OpenClaw when available", async () => {
    const sb = createSb({
      owner_name: "Barrington Kip",
      apn: "35054.0101",
    });
    mocks.getCountyData.mockResolvedValue({ owner: null, sales: [] });
    mocks.isOpenClawConfigured.mockReturnValue(true);
    mocks.fanOutAgents.mockResolvedValue({
      results: [
        {
          agentId: "property_photos",
          success: true,
          findings: [],
          model: "deepseek-chat",
          durationMs: 500,
          photos: [
            {
              url: "https://example.com/front.jpg",
              source: "assessor",
              capturedAt: "2026-04-02T12:00:00.000Z",
            },
          ],
        },
      ],
      meta: { agentsRun: ["property_photos"], agentsSucceeded: ["property_photos"], agentsFailed: [], totalDurationMs: 500 },
    });

    const { runClaimEnrichment } = await import("@/lib/intake-claim-enrichment");
    await runClaimEnrichment({
      sb: sb.client as never,
      propertyId: "property-1",
      leadId: "lead-1",
    });

    expect(mocks.fanOutAgents).toHaveBeenCalledTimes(1);
    const payload = sb.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const ownerFlags = payload.owner_flags as Record<string, unknown>;
    expect(Array.isArray(ownerFlags.photos)).toBe(true);
    expect((ownerFlags.photos as Array<{ url: string }>)[0]?.url).toBe("https://example.com/front.jpg");
  });

  it("falls back to street view photos when agent photos are empty", async () => {
    const sb = createSb({
      owner_name: "Barrington Kip",
      apn: "35054.0101",
    });
    mocks.getCountyData.mockResolvedValue({ owner: null, sales: [] });
    mocks.isOpenClawConfigured.mockReturnValue(true);
    mocks.fanOutAgents.mockResolvedValue({
      results: [
        {
          agentId: "property_photos",
          success: true,
          findings: [],
          model: "deepseek-chat",
          durationMs: 500,
          photos: [],
        },
      ],
      meta: { agentsRun: ["property_photos"], agentsSucceeded: ["property_photos"], agentsFailed: [], totalDurationMs: 500 },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            geometry: {
              location: { lat: 47.7001, lng: -117.4002 },
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GOOGLE_STREET_VIEW_KEY", "test-key");

    const { runClaimEnrichment } = await import("@/lib/intake-claim-enrichment");
    await runClaimEnrichment({
      sb: sb.client as never,
      propertyId: "property-1",
      leadId: "lead-1",
    });

    const payload = sb.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    const ownerFlags = payload.owner_flags as Record<string, unknown>;
    expect(payload.lat).toBe(47.7001);
    expect(payload.lng).toBe(-117.4002);
    expect((ownerFlags.photo_fallback as string)).toBe("google_street_view");
    expect(Array.isArray(ownerFlags.photos)).toBe(true);
    expect((ownerFlags.photos as Array<{ url: string }>).some((photo) => photo.url.includes("/api/street-view?lat=47.7001&lng=-117.4002"))).toBe(true);
  });

  it("normalizes generic market cities from ZIP during claim enrichment", async () => {
    const sb = createSb({
      address: "5328 Rail Canyon Road",
      city: "Spokane",
      zip: "99006",
      county: "Spokane",
      owner_name: "Anna Macpherson",
    });

    const { runClaimEnrichment } = await import("@/lib/intake-claim-enrichment");
    await runClaimEnrichment({
      sb: sb.client as never,
      propertyId: "property-1",
      leadId: "lead-1",
    });

    const payload = sb.update.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(payload.city).toBe("Deer Park");
  });
});
