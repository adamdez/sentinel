import { describe, expect, it } from "vitest";
import { syncLeadPhoneOutcome } from "@/lib/lead-phone-outcome";

type RecordedOperation = {
  table: string;
  action: "update" | "insert" | "upsert";
  payload: Record<string, unknown>;
  conditions: Array<{ type: "eq" | "neq"; field: string; value: unknown }>;
};

type PhoneRow = {
  id: string;
  lead_id: string;
  property_id: string | null;
  phone: string;
  status: "active" | "dead" | "dnc";
  is_primary: boolean;
  position: number | null;
  dead_reason: string | null;
};

function createOutcomeClient(initialPhones: PhoneRow[]) {
  const operations: RecordedOperation[] = [];
  let phones = initialPhones.map((phone) => ({ ...phone }));
  let propertyOwnerPhone: string | null = phones.find((phone) => phone.is_primary)?.phone ?? null;

  const buildLeadPhonesQuery = () => {
    const state: {
      selectArgs?: unknown[];
      updatePayload?: Record<string, unknown>;
      conditions: Array<{ type: "eq" | "neq"; field: string; value: unknown }>;
    } = { conditions: [] };

    const query = {
      select(...args: unknown[]) {
        state.selectArgs = args;
        return query;
      },
      eq(field: string, value: unknown) {
        state.conditions.push({ type: "eq", field, value });
        return query;
      },
      neq(field: string, value: unknown) {
        state.conditions.push({ type: "neq", field, value });
        return query;
      },
      order() {
        return query;
      },
      update(payload: Record<string, unknown>) {
        state.updatePayload = payload;
        return query;
      },
      then(resolve: (value: unknown) => unknown) {
        if (state.selectArgs) {
          return Promise.resolve(
            resolve({
              data: phones.map((phone) => ({ ...phone })),
              error: null,
            }),
          );
        }

        if (!state.updatePayload) {
          return Promise.resolve(resolve({ error: null }));
        }

        const conditions = [...state.conditions];
        operations.push({
          table: "lead_phones",
          action: "update",
          payload: state.updatePayload,
          conditions,
        });

        phones = phones.map((phone) => {
          const matches = conditions.every((condition) => {
            const value = phone[condition.field as keyof PhoneRow];
            return condition.type === "eq" ? value === condition.value : value !== condition.value;
          });
          return matches ? { ...phone, ...(state.updatePayload as Partial<PhoneRow>) } : phone;
        });

        return Promise.resolve(resolve({ error: null }));
      },
    };

    return query;
  };

  return {
    operations,
    getPropertyOwnerPhone: () => propertyOwnerPhone,
    client: {
      from(table: string) {
        if (table === "lead_phones") {
          return buildLeadPhonesQuery();
        }
        if (table === "properties") {
          return {
            update(payload: Record<string, unknown>) {
              operations.push({
                table: "properties",
                action: "update",
                payload,
                conditions: [],
              });
              return {
                eq(field: string, value: unknown) {
                  operations[operations.length - 1].conditions.push({ type: "eq", field, value });
                  propertyOwnerPhone = (payload.owner_phone as string | null | undefined) ?? null;
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }
        if (table === "event_log") {
          return {
            insert(payload: Record<string, unknown>) {
              operations.push({
                table: "event_log",
                action: "insert",
                payload,
                conditions: [],
              });
              return Promise.resolve({ error: null });
            },
          };
        }
        if (table === "dnc_list") {
          return {
            upsert(payload: Record<string, unknown>) {
              operations.push({
                table: "dnc_list",
                action: "upsert",
                payload,
                conditions: [],
              });
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("syncLeadPhoneOutcome", () => {
  it("promotes the selected active phone to primary callback", async () => {
    const { client, operations, getPropertyOwnerPhone } = createOutcomeClient([
      {
        id: "phone-1",
        lead_id: "lead-1",
        property_id: "property-1",
        phone: "+15095551234",
        status: "active",
        is_primary: false,
        position: 1,
        dead_reason: null,
      },
      {
        id: "phone-2",
        lead_id: "lead-1",
        property_id: "property-1",
        phone: "+15095550000",
        status: "active",
        is_primary: true,
        position: 2,
        dead_reason: null,
      },
    ]);

    const result = await syncLeadPhoneOutcome({
      sb: client,
      leadId: "lead-1",
      userId: "user-1",
      disposition: "follow_up",
      phoneId: "phone-1",
    });

    expect(result.applied).toBe(true);
    expect(result.newPrimaryPhone).toBe("+15095551234");
    expect(getPropertyOwnerPhone()).toBe("+15095551234");
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "lead_phones",
          payload: expect.objectContaining({ is_primary: false }),
          conditions: expect.arrayContaining([
            { type: "eq", field: "lead_id", value: "lead-1" },
            { type: "neq", field: "id", value: "phone-1" },
          ]),
        }),
        expect.objectContaining({
          table: "lead_phones",
          payload: expect.objectContaining({ is_primary: true }),
          conditions: expect.arrayContaining([{ type: "eq", field: "id", value: "phone-1" }]),
        }),
        expect.objectContaining({
          table: "properties",
          payload: expect.objectContaining({ owner_phone: "+15095551234" }),
          conditions: expect.arrayContaining([{ type: "eq", field: "id", value: "property-1" }]),
        }),
      ]),
    );
  });

  it("marks a primary phone as wrong number and promotes the next active phone", async () => {
    const { client, operations, getPropertyOwnerPhone } = createOutcomeClient([
      {
        id: "phone-1",
        lead_id: "lead-1",
        property_id: "property-1",
        phone: "+15095551234",
        status: "active",
        is_primary: true,
        position: 1,
        dead_reason: null,
      },
      {
        id: "phone-2",
        lead_id: "lead-1",
        property_id: "property-1",
        phone: "+15095550000",
        status: "active",
        is_primary: false,
        position: 2,
        dead_reason: null,
      },
    ]);

    const result = await syncLeadPhoneOutcome({
      sb: client,
      leadId: "lead-1",
      userId: "user-1",
      disposition: "wrong_number",
      phoneId: "phone-1",
    });

    expect(result.applied).toBe(true);
    expect(result.newStatus).toBe("dead");
    expect(result.newPrimaryPhone).toBe("+15095550000");
    expect(result.allPhonesDead).toBe(false);
    expect(getPropertyOwnerPhone()).toBe("+15095550000");
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "lead_phones",
          payload: expect.objectContaining({ status: "dead", dead_reason: "wrong_number" }),
          conditions: expect.arrayContaining([{ type: "eq", field: "id", value: "phone-1" }]),
        }),
        expect.objectContaining({
          table: "lead_phones",
          payload: expect.objectContaining({ is_primary: false }),
          conditions: expect.arrayContaining([{ type: "eq", field: "id", value: "phone-1" }]),
        }),
        expect.objectContaining({
          table: "lead_phones",
          payload: expect.objectContaining({ is_primary: true }),
          conditions: expect.arrayContaining([{ type: "eq", field: "id", value: "phone-2" }]),
        }),
        expect.objectContaining({
          table: "properties",
          payload: expect.objectContaining({ owner_phone: "+15095550000" }),
          conditions: expect.arrayContaining([{ type: "eq", field: "id", value: "property-1" }]),
        }),
      ]),
    );
  });
});
