import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/skip-trace", () => ({
  dualSkipTrace: vi.fn(),
}));

vi.mock("@/lib/intelligence", () => ({
  createArtifact: vi.fn(),
  createFact: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase";
import { dualSkipTrace } from "@/lib/skip-trace";
import { createArtifact, createFact } from "@/lib/intelligence";
import { runSkipTraceIntel } from "@/lib/skiptrace-intel";

function createSupabaseMock() {
  const properties = new Map<string, Record<string, unknown>>([
    ["prop-1", { id: "prop-1", owner_phone: null, owner_email: null, owner_flags: {} }],
  ]);
  const leadPhoneRows: Array<Record<string, unknown>> = [];
  const leadUpdates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const propertyUpdates: Array<{ id: string; values: Record<string, unknown> }> = [];
  const phoneInserts: Array<Record<string, unknown>> = [];

  const from = vi.fn((table: string) => {
    if (table === "properties") {
      return {
        select() {
          return {
            eq(_column: string, value: unknown) {
              return {
                maybeSingle: async () => ({ data: properties.get(String(value)) ?? null, error: null }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          return {
            async eq(_column: string, value: unknown) {
              const id = String(value);
              const current = properties.get(id) ?? { id, owner_flags: {} };
              properties.set(id, { ...current, ...values });
              propertyUpdates.push({ id, values });
              return { data: null, error: null };
            },
          };
        },
      };
    }

    if (table === "lead_phones") {
      return {
        select() {
          return {
            async eq(_column: string, value: unknown) {
              return {
                data: leadPhoneRows
                  .filter((row) => row.lead_id === value)
                  .map((row) => ({ phone: row.phone, position: row.position })),
                error: null,
              };
            },
          };
        },
        async insert(values: Record<string, unknown>) {
          phoneInserts.push(values);
          leadPhoneRows.push(values);
          return { error: null };
        },
      };
    }

    if (table === "fact_assertions") {
      return {
        select() {
          const chain = {
            eq() {
              return chain;
            },
            in() {
              return chain;
            },
            then(
              onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
            },
          };
          return chain;
        },
      };
    }

    if (table === "leads") {
      return {
        update(values: Record<string, unknown>) {
          return {
            async eq(_column: string, value: unknown) {
              leadUpdates.push({ id: String(value), values });
              return { data: null, error: null };
            },
          };
        },
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    sb: { from },
    leadUpdates,
    propertyUpdates,
    phoneInserts,
  };
}

const baseSkipTraceResult = {
  phones: [
    {
      number: "+15095551234",
      normalized: "5095551234",
      lineType: "mobile" as const,
      confidence: 92,
      dnc: false,
      source: "tracerfy" as const,
    },
  ],
  emails: [],
  persons: [],
  primaryPhone: "+15095551234",
  primaryEmail: null,
  isLitigator: false,
  hasDncNumbers: false,
  providers: ["tracerfy"] as const,
  prSuccess: false,
  bdSuccess: false,
  tfSuccess: true,
  totalPhoneCount: 1,
  totalEmailCount: 0,
};

describe("runSkipTraceIntel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dualSkipTrace).mockResolvedValue(baseSkipTraceResult as never);
    vi.mocked(createArtifact).mockResolvedValue("artifact-1");
    vi.mocked(createFact).mockResolvedValue({ factId: "fact-1", contradictions: [] } as never);
  });

  it("still promotes phones when artifact persistence fails", async () => {
    const { sb, phoneInserts, leadUpdates, propertyUpdates } = createSupabaseMock();
    vi.mocked(createServerClient).mockReturnValue(sb as never);
    vi.mocked(createArtifact).mockRejectedValue(new Error("artifact table missing"));

    const result = await runSkipTraceIntel({
      leadId: "lead-1",
      propertyId: "prop-1",
      address: "1314 E Bridgeport Ave",
      city: "Spokane",
      state: "WA",
      zip: "99207",
      ownerName: "Ashley Hamilton",
      reason: "queue_bulk",
    });

    expect(result.reason).toBe("completed");
    expect(result.phonesPromoted).toBe(1);
    expect(result.newFactsCreated).toBe(0);
    expect(result.saveFailures).toBe(0);
    expect(createFact).not.toHaveBeenCalled();
    expect(phoneInserts).toHaveLength(1);
    expect(propertyUpdates).toHaveLength(1);
    expect(leadUpdates.at(-1)?.values).toMatchObject({
      skip_trace_status: "completed",
      skip_trace_last_error: null,
    });
  });

  it("still promotes phones when fact persistence fails", async () => {
    const { sb, phoneInserts, leadUpdates } = createSupabaseMock();
    vi.mocked(createServerClient).mockReturnValue(sb as never);
    vi.mocked(createFact).mockRejectedValue(new Error("fact insert failed"));

    const result = await runSkipTraceIntel({
      leadId: "lead-1",
      propertyId: "prop-1",
      address: "1314 E Bridgeport Ave",
      city: "Spokane",
      state: "WA",
      zip: "99207",
      ownerName: "Ashley Hamilton",
      reason: "queue_bulk",
    });

    expect(result.reason).toBe("completed");
    expect(result.phonesPromoted).toBe(1);
    expect(result.newFactsCreated).toBe(0);
    expect(result.saveFailures).toBe(0);
    expect(createFact).toHaveBeenCalledTimes(1);
    expect(phoneInserts).toHaveLength(1);
    expect(leadUpdates.at(-1)?.values).toMatchObject({
      skip_trace_status: "completed",
      skip_trace_last_error: null,
    });
  });
});
