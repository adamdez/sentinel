import { beforeEach, describe, expect, it, vi } from "vitest";

const phoneLookupMocks = vi.hoisted(() => ({
  unifiedPhoneLookup: vi.fn(),
  searchPhoneCandidates: vi.fn(),
  phoneMatchReason: vi.fn(),
}));

vi.mock("@/lib/dialer/phone-lookup", () => ({
  unifiedPhoneLookup: phoneLookupMocks.unifiedPhoneLookup,
  searchPhoneCandidates: phoneLookupMocks.searchPhoneCandidates,
  phoneMatchReason: phoneLookupMocks.phoneMatchReason,
}));

function createLeadResolutionSb() {
  const smsUpdates: Array<Record<string, unknown>> = [];
  const insertedLeadPhones: Array<Record<string, unknown>> = [];
  const insertedEvents: Array<Record<string, unknown>> = [];

  return {
    smsUpdates,
    insertedLeadPhones,
    insertedEvents,
    sb: {
      from(table: string) {
        if (table === "leads") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle: async () => ({
              data: {
                id: "lead-1",
                property_id: "property-1",
                assigned_to: "user-1",
                priority: 87,
                tags: ["probate"],
                status: "lead",
              },
              error: null,
            }),
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
            maybeSingle: async () => ({
              data: {
                owner_name: "Linda Example",
                address: "2302 S Davis Ct",
              },
              error: null,
            }),
          };
        }

        if (table === "sms_messages") {
          return {
            update(payload: Record<string, unknown>) {
              smsUpdates.push(payload);
              return {
                eq() {
                  return {
                    is: async () => ({ error: null }),
                  };
                },
              };
            },
          };
        }

        if (table === "lead_phones") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order: async () => ({ data: [], error: null }),
            insert(payload: Record<string, unknown>) {
              insertedLeadPhones.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }

        if (table === "event_log") {
          return {
            insert(payload: Record<string, unknown>) {
              insertedEvents.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("resolveSmsLead", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    phoneLookupMocks.phoneMatchReason.mockImplementation((source: string, options?: { phoneStatus?: string | null }) => {
      if (source === "lead_phones" && options?.phoneStatus !== "active") return "Old lead phone";
      if (source === "lead_phones" || source === "contacts" || source === "properties") return "Direct phone";
      if (source === "calls_log" || source === "call_sessions") return "Historical call";
      if (source === "sms_messages") return "SMS thread";
      return "Phone match";
    });
  });

  it("auto-links inbound SMS when the phone is a direct current lead phone", async () => {
    const { sb } = createLeadResolutionSb();
    phoneLookupMocks.unifiedPhoneLookup.mockResolvedValue({
      leadId: "lead-1",
      matchSource: "lead_phones",
      matchConfidence: "direct",
      ownerName: null,
      propertyAddress: null,
      contactId: null,
      propertyId: "property-1",
      intakeLeadId: null,
      recentCallCount: 2,
      lastCallDate: "2026-04-09T20:00:00.000Z",
    });
    phoneLookupMocks.searchPhoneCandidates.mockResolvedValue([]);

    const { resolveSmsLead } = await import("@/lib/sms/lead-resolution");
    const result = await resolveSmsLead(sb as never, "+1 (509) 555-1234");

    expect(result.resolutionState).toBe("direct");
    expect(result.leadId).toBe("lead-1");
    expect(result.matchReason).toBe("Direct phone");
  });

  it("creates a suggested match when only historical call evidence exists", async () => {
    const { sb } = createLeadResolutionSb();
    phoneLookupMocks.unifiedPhoneLookup.mockResolvedValue({
      leadId: "lead-1",
      matchSource: "calls_log",
      matchConfidence: "indirect",
      ownerName: null,
      propertyAddress: null,
      contactId: null,
      propertyId: "property-1",
      intakeLeadId: null,
      recentCallCount: 1,
      lastCallDate: "2026-04-09T20:00:00.000Z",
    });
    phoneLookupMocks.searchPhoneCandidates.mockResolvedValue([
      {
        leadId: "lead-1",
        ownerName: "Linda Example",
        propertyAddress: "2302 S Davis Ct",
        propertyId: "property-1",
        contactId: null,
        intakeLeadId: null,
        matchSource: "calls_log",
        matchConfidence: "indirect",
        matchedPhone: "+15095551234",
        matchReason: "Historical call",
        exact: true,
        phoneStatus: "historical",
        recentCallCount: 1,
        lastCallDate: "2026-04-09T20:00:00.000Z",
      },
    ]);

    const { resolveSmsLead } = await import("@/lib/sms/lead-resolution");
    const result = await resolveSmsLead(sb as never, "+1 (509) 555-1234");

    expect(result.resolutionState).toBe("suggested");
    expect(result.leadId).toBeNull();
    expect(result.suggestedMatch).toMatchObject({
      leadId: "lead-1",
      matchReason: "Historical call",
    });
  });

  it("keeps the thread unresolved when there is no credible match", async () => {
    const { sb } = createLeadResolutionSb();
    phoneLookupMocks.unifiedPhoneLookup.mockResolvedValue({
      leadId: null,
      matchSource: null,
      matchConfidence: "none",
      ownerName: null,
      propertyAddress: null,
      contactId: null,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    });
    phoneLookupMocks.searchPhoneCandidates.mockResolvedValue([]);

    const { resolveSmsLead } = await import("@/lib/sms/lead-resolution");
    const result = await resolveSmsLead(sb as never, "+1 (509) 555-1234");

    expect(result.resolutionState).toBe("unresolved");
    expect(result.leadId).toBeNull();
    expect(result.suggestedMatch).toBeNull();
  });

  it("attaches an unresolved thread and creates a canonical phone fact", async () => {
    const { sb, smsUpdates, insertedLeadPhones, insertedEvents } = createLeadResolutionSb();

    const { attachSmsThreadToLead } = await import("@/lib/sms/lead-resolution");
    const attached = await attachSmsThreadToLead(sb as never, {
      phone: "+1 (509) 555-1234",
      leadId: "lead-1",
      actorUserId: "actor-1",
      reason: "suggested_review_attach",
      addPhoneFact: true,
    });

    expect(attached).toMatchObject({
      leadId: "lead-1",
      matchReason: "SMS thread",
    });
    expect(smsUpdates[0]).toMatchObject({
      lead_id: "lead-1",
      user_id: "user-1",
    });
    expect(insertedLeadPhones[0]).toMatchObject({
      lead_id: "lead-1",
      phone: "+15095551234",
      source: "sms_attach",
      label: "unknown",
    });
    expect(insertedEvents[0]).toMatchObject({
      action: "sms.thread_attached",
    });
  });
});
