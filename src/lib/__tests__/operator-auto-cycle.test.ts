import { describe, expect, it } from "vitest";
import type { LeadPhone } from "@/lib/dialer/types";
import {
  planNextQueueTarget,
  resolveDialerPhoneSelection,
} from "@/lib/dialer/operator-auto-cycle";

function buildPhone(id: string, phone: string, overrides: Partial<LeadPhone> = {}): LeadPhone {
  return {
    id,
    phone,
    label: "mobile",
    source: "test",
    status: "active",
    dead_reason: null,
    is_primary: false,
    position: 1,
    last_called_at: null,
    call_count: 0,
    ...overrides,
  };
}

describe("resolveDialerPhoneSelection", () => {
  const phones = [
    buildPhone("lead-phone-1", "5091111111", { position: 1 }),
    buildPhone("lead-phone-2", "5092222222", { position: 2 }),
    buildPhone("lead-phone-3", "5093333333", { position: 3 }),
  ];

  it("uses the auto-cycle nextPhoneId instead of a stale first-phone index", () => {
    const selection = resolveDialerPhoneSelection({
      autoCycleMode: true,
      leadPhones: phones,
      phoneIndex: 0,
      nextPhoneId: "lead-phone-2",
      fallbackPhone: "5099999999",
    });

    expect(selection.selectedIndex).toBe(1);
    expect(selection.phone).toBe("5092222222");
  });

  it("keeps the same auto-cycle target after a lead refresh when local state is still at zero", () => {
    const firstPass = resolveDialerPhoneSelection({
      autoCycleMode: true,
      leadPhones: phones,
      phoneIndex: 0,
      nextPhoneId: "lead-phone-3",
      fallbackPhone: null,
    });
    const refreshedPass = resolveDialerPhoneSelection({
      autoCycleMode: true,
      leadPhones: [...phones],
      phoneIndex: 0,
      nextPhoneId: "lead-phone-3",
      fallbackPhone: null,
    });

    expect(firstPass.phone).toBe("5093333333");
    expect(refreshedPass.phone).toBe("5093333333");
    expect(refreshedPass.selectedIndex).toBe(2);
  });

  it("walks each phone in client-file order as the auto-cycle pointer advances", () => {
    const dialedPhones = ["lead-phone-1", "lead-phone-2", "lead-phone-3"].map((nextPhoneId) =>
      resolveDialerPhoneSelection({
        autoCycleMode: true,
        leadPhones: phones,
        phoneIndex: 0,
        nextPhoneId,
        fallbackPhone: null,
      }).phone,
    );

    expect(dialedPhones).toEqual(["5091111111", "5092222222", "5093333333"]);
  });

  it("falls back to the first active phone when the pointer is missing or stale", () => {
    const selection = resolveDialerPhoneSelection({
      autoCycleMode: true,
      leadPhones: phones,
      phoneIndex: 2,
      nextPhoneId: "missing-phone-id",
      fallbackPhone: "5099999999",
    });

    expect(selection.selectedIndex).toBe(0);
    expect(selection.phone).toBe("5091111111");
  });

  it("keeps manual queue behavior unchanged and falls back to owner_phone when needed", () => {
    const manualSelection = resolveDialerPhoneSelection({
      autoCycleMode: false,
      leadPhones: phones,
      phoneIndex: 1,
      nextPhoneId: "lead-phone-3",
      fallbackPhone: "5099999999",
    });
    const fallbackSelection = resolveDialerPhoneSelection({
      autoCycleMode: false,
      leadPhones: [],
      phoneIndex: 0,
      nextPhoneId: null,
      fallbackPhone: "5099999999",
    });

    expect(manualSelection.phone).toBe("5092222222");
    expect(fallbackSelection.phone).toBe("5099999999");
  });
});

describe("planNextQueueTarget", () => {
  const queueLeadIds = ["lead-1", "lead-2", "lead-3"];

  it("stays on the same lead for the next phone when more active phones remain", () => {
    expect(planNextQueueTarget({
      queueLeadIds,
      currentLeadId: "lead-1",
      phoneIndex: 0,
      activePhoneCount: 3,
      isTerminalDisposition: false,
    })).toEqual({
      action: "stay",
      leadId: "lead-1",
      nextPhoneIndex: 1,
    });
  });

  it("advances to the next lead after the final phone attempt", () => {
    expect(planNextQueueTarget({
      queueLeadIds,
      currentLeadId: "lead-1",
      phoneIndex: 1,
      activePhoneCount: 2,
      isTerminalDisposition: false,
    })).toEqual({
      action: "next",
      leadId: "lead-2",
    });
  });

  it("advances immediately on terminal dispositions", () => {
    expect(planNextQueueTarget({
      queueLeadIds,
      currentLeadId: "lead-1",
      phoneIndex: 0,
      activePhoneCount: 3,
      isTerminalDisposition: true,
    })).toEqual({
      action: "next",
      leadId: "lead-2",
    });
  });

  it("finishes cleanly at the end of the queue", () => {
    expect(planNextQueueTarget({
      queueLeadIds,
      currentLeadId: "lead-3",
      phoneIndex: 0,
      activePhoneCount: 1,
      isTerminalDisposition: false,
    })).toEqual({
      action: "done",
    });
  });
});
