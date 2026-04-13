import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  requireAuth: vi.fn(),
  ensureDealForLead: vi.fn(),
  createOfferRecord: vi.fn(),
  insertOfferExecution: vi.fn(),
  syncOfferStatusSnapshot: vi.fn(),
  appendOfferEventLog: vi.fn(),
  createDocusignOfferDraft: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@/lib/offer-manager", () => ({
  ensureDealForLead: (...args: unknown[]) => mocks.ensureDealForLead(...args),
  createOfferRecord: (...args: unknown[]) => mocks.createOfferRecord(...args),
  insertOfferExecution: (...args: unknown[]) => mocks.insertOfferExecution(...args),
  syncOfferStatusSnapshot: (...args: unknown[]) => mocks.syncOfferStatusSnapshot(...args),
  appendOfferEventLog: (...args: unknown[]) => mocks.appendOfferEventLog(...args),
}));

vi.mock("@/lib/docusign", () => ({
  createDocusignOfferDraft: (...args: unknown[]) => mocks.createDocusignOfferDraft(...args),
}));

function createPrepareClient(options?: {
  decisionMakerConfirmed?: boolean;
  state?: string;
  tags?: string[];
  offerCount?: number;
}) {
  const state = {
    propertyUpdates: [] as Array<Record<string, unknown>>,
  };

  return {
    state,
    client: {
      from(table: string) {
        if (table === "leads") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            single: vi.fn(async () => ({
              data: {
                id: "lead-1",
                property_id: "property-1",
                decision_maker_confirmed: options?.decisionMakerConfirmed ?? true,
                qualification_route: "offer_ready",
                status: "lead",
                tags: options?.tags ?? [],
                source: "manual",
                source_list_name: null,
              },
              error: null,
            })),
          };
        }

        if (table === "properties") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            single: vi.fn(async () => ({
              data: {
                id: "property-1",
                address: "123 Main St",
                city: "Spokane",
                state: options?.state ?? "WA",
                zip: "99208",
                apn: "12345.6789",
                owner_name: "Guy Bates",
                owner_flags: {},
              },
              error: null,
            })),
          };
        }

        if (table === "offers") {
          return {
            select() {
              return this;
            },
            eq() {
              return Promise.resolve({
                count: options?.offerCount ?? 0,
                error: null,
              });
            },
          };
        }

        if (table === "event_log") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("POST /api/offers/prepare", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1", email: "adam@example.com" });
    mocks.ensureDealForLead.mockResolvedValue({ id: "deal-1" });
    mocks.createOfferRecord.mockResolvedValue({ id: "offer-1", deal_id: "deal-1", amount: 182000 });
    mocks.insertOfferExecution.mockResolvedValue({ id: "exec-1", offer_id: "offer-1" });
    mocks.syncOfferStatusSnapshot.mockResolvedValue(undefined);
    mocks.appendOfferEventLog.mockResolvedValue(undefined);
    mocks.createDocusignOfferDraft.mockResolvedValue({
      provider: "docusign",
      templateKey: "wa_cash_psa_v1",
      envelopeId: "env-1",
      senderViewUrl: "https://example.com/sender",
      providerStatus: "created",
    });
  });

  it("blocks unsupported probate-like files before DocuSign preparation", async () => {
    const prepareClient = createPrepareClient({ tags: ["probate"] });
    mocks.createServerClient.mockReturnValue(prepareClient.client);

    const { POST } = await import("@/app/api/offers/prepare/route");
    const response = await POST(new Request("http://localhost/api/offers/prepare", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        leadId: "lead-1",
        purchasePrice: 182000,
        earnestMoney: 1000,
        closeDate: "2026-05-15",
        inspectionPeriodDays: 10,
        expirationAt: "2026-04-15T17:00:00.000Z",
        buyerEntity: "Dominion Homes, LLC",
        buyerSignerName: "Adam Desjardin",
        sellerSigners: [{ name: "Guy Bates", email: "guy@example.com" }],
      }),
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(422);
    expect(payload.unsupported_reasons[0]).toContain("Probate");
    expect(mocks.createDocusignOfferDraft).not.toHaveBeenCalled();
  });

  it("creates a DocuSign draft and returns the sender review url", async () => {
    const prepareClient = createPrepareClient();
    mocks.createServerClient.mockReturnValue(prepareClient.client);

    const { POST } = await import("@/app/api/offers/prepare/route");
    const response = await POST(new Request("http://localhost/api/offers/prepare", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
      },
      body: JSON.stringify({
        leadId: "lead-1",
        purchasePrice: 182000,
        earnestMoney: 1000,
        closeDate: "2026-05-15",
        inspectionPeriodDays: 10,
        expirationAt: "2026-04-15T17:00:00.000Z",
        buyerEntity: "Dominion Homes, LLC",
        buyerSignerName: "Adam Desjardin",
        buyerSignerTitle: "Manager",
        titleCompany: "First Title",
        notes: "Cash offer with standard inspection window.",
        sellerSigners: [{ name: "Guy Bates", email: "guy@example.com" }],
      }),
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.sender_view_url).toBe("https://example.com/sender");
    expect(mocks.createDocusignOfferDraft).toHaveBeenCalledOnce();
    expect(mocks.createOfferRecord).toHaveBeenCalledOnce();
    expect(mocks.insertOfferExecution).toHaveBeenCalledOnce();
    expect(mocks.syncOfferStatusSnapshot).toHaveBeenCalledOnce();
  });
});
