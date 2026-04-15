import { describe, expect, it } from "vitest";
import {
  buildDialerQueueCollections,
  findRefreshedDialerLead,
  reconcileRefreshedSelectedDialerLead,
  resolveVisibleDialerLead,
  selectFallbackDialerLead,
  selectInitialDialerLead,
  shouldLockDialerLeadSelection,
} from "@/lib/dialer/dialer-ui-state";

type TestLead = {
  id: string;
  ready?: boolean;
};

const queueLeads: TestLead[] = [
  { id: "lead-1" },
  { id: "lead-2" },
];

const autoCycleLeads: TestLead[] = [
  { id: "lead-a", ready: false },
  { id: "lead-b", ready: true },
];

describe("buildDialerQueueCollections", () => {
  it("shows the same staged lead list in queue mode and power dial mode", () => {
    const result = buildDialerQueueCollections({
      autoCycleMode: false,
      queue: [{ id: "lead-1" }, { id: "lead-2" }],
      queueLoading: false,
      autoCycleQueue: [{ id: "lead-2", ready: true }, { id: "lead-3", ready: false }],
      autoCycleQueueLoading: false,
      isReadyLead: (lead) => lead.ready === true,
    });

    expect(result.displayedQueue.map((lead) => lead.id)).toEqual(["lead-1", "lead-2", "lead-3"]);
    expect(result.executionQueue.map((lead) => lead.id)).toEqual(["lead-1", "lead-2", "lead-3"]);
  });

  it("uses only ready auto-cycle leads for the power-dial execution queue", () => {
    const result = buildDialerQueueCollections({
      autoCycleMode: true,
      queue: queueLeads,
      queueLoading: false,
      autoCycleQueue: autoCycleLeads,
      autoCycleQueueLoading: true,
      isReadyLead: (lead) => lead.ready === true,
    });

    expect(result.displayedQueue.map((lead) => lead.id)).toEqual(["lead-1", "lead-2", "lead-a", "lead-b"]);
    expect(result.executionQueue.map((lead) => lead.id)).toEqual(["lead-b"]);
    expect(result.preferredQueue.map((lead) => lead.id)).toEqual(["lead-b"]);
    expect(result.displayedQueueLoading).toBe(true);
    expect(result.powerDialReadyQueueExhausted).toBe(false);
  });

  it("marks power dial as exhausted when nothing is ready now", () => {
    const result = buildDialerQueueCollections({
      autoCycleMode: true,
      queue: queueLeads,
      queueLoading: false,
      autoCycleQueue: [{ id: "lead-a", ready: false }],
      autoCycleQueueLoading: false,
      isReadyLead: (lead) => lead.ready === true,
    });

    expect(result.executionQueue).toEqual([]);
    expect(result.preferredQueue.map((lead) => lead.id)).toEqual(["lead-1", "lead-2", "lead-a"]);
    expect(result.powerDialReadyQueueExhausted).toBe(true);
  });

  it("does not mark power dial as exhausted when the staged queue is empty", () => {
    const result = buildDialerQueueCollections({
      autoCycleMode: true,
      queue: [],
      queueLoading: false,
      autoCycleQueue: [],
      autoCycleQueueLoading: false,
      isReadyLead: (lead) => lead.ready === true,
    });

    expect(result.executionQueue).toEqual([]);
    expect(result.displayedQueue).toEqual([]);
    expect(result.powerDialReadyQueueExhausted).toBe(false);
  });
});

describe("dialer lead selection helpers", () => {
  it("picks the ready queue for initial power-dial selection", () => {
    const collections = buildDialerQueueCollections({
      autoCycleMode: true,
      queue: queueLeads,
      queueLoading: false,
      autoCycleQueue: autoCycleLeads,
      autoCycleQueueLoading: false,
      isReadyLead: (lead) => lead.ready === true,
    });

    expect(selectInitialDialerLead(true, collections.executionQueue, collections.preferredQueue)?.id).toBe("lead-b");
  });

  it("does not force-close the current lead while the client file modal is open", () => {
    const collections = buildDialerQueueCollections({
      autoCycleMode: true,
      queue: queueLeads,
      queueLoading: false,
      autoCycleQueue: autoCycleLeads,
      autoCycleQueueLoading: false,
      isReadyLead: (lead) => lead.ready === true,
    });

    expect(selectFallbackDialerLead({
      autoCycleMode: true,
      displayedQueue: collections.displayedQueue,
      executionQueue: collections.executionQueue,
      preferredQueue: collections.preferredQueue,
      fileModalOpen: true,
    })).toBeNull();
  });

  it("falls back cleanly to the next viable lead when the current lead disappears", () => {
    const collections = buildDialerQueueCollections({
      autoCycleMode: false,
      queue: queueLeads,
      queueLoading: false,
      autoCycleQueue: [],
      autoCycleQueueLoading: false,
      isReadyLead: () => true,
    });

    expect(selectFallbackDialerLead({
      autoCycleMode: false,
      displayedQueue: collections.displayedQueue,
      executionQueue: collections.executionQueue,
      preferredQueue: collections.preferredQueue,
      fileModalOpen: false,
    })?.id).toBe("lead-1");
  });

  it("refreshes the current lead from the latest displayed queue snapshot", () => {
    expect(findRefreshedDialerLead([
      { id: "lead-1", ready: true },
      { id: "lead-2", ready: false },
    ], "lead-2")).toEqual({ id: "lead-2", ready: false });
    expect(findRefreshedDialerLead(queueLeads, "missing")).toBeNull();
  });

  it("locks visible lead selection while the dialer is actively handling a call", () => {
    expect(shouldLockDialerLeadSelection("idle")).toBe(false);
    expect(shouldLockDialerLeadSelection("dialing")).toBe(true);
    expect(shouldLockDialerLeadSelection("connected")).toBe(true);
    expect(shouldLockDialerLeadSelection("ended")).toBe(true);
  });

  it("keeps the active call lead visible until the dialer returns to idle", () => {
    const selectedLead = { id: "lead-selected" };
    const activeLead = { id: "lead-active" };

    expect(resolveVisibleDialerLead("dialing", activeLead, selectedLead)?.id).toBe("lead-active");
    expect(resolveVisibleDialerLead("connected", activeLead, selectedLead)?.id).toBe("lead-active");
    expect(resolveVisibleDialerLead("ended", activeLead, selectedLead)?.id).toBe("lead-active");
    expect(resolveVisibleDialerLead("idle", activeLead, selectedLead)?.id).toBe("lead-selected");
  });

  it("preserves a pending same-lead phone advance until the refreshed queue catches up", () => {
    const currentLead = {
      id: "lead-1",
      autoCycle: {
        nextPhoneId: "phone-2",
        readyNow: true,
      },
    };

    expect(reconcileRefreshedSelectedDialerLead(
      currentLead,
      {
        id: "lead-1",
        autoCycle: {
          nextPhoneId: "phone-1",
          readyNow: true,
        },
      },
      { leadId: "lead-1", nextPhoneId: "phone-2" },
    )).toEqual({
      id: "lead-1",
      autoCycle: {
        nextPhoneId: "phone-2",
        readyNow: true,
      },
    });
  });

  it("accepts the refreshed queue snapshot once it reflects the persisted next phone", () => {
    const refreshedLead = {
      id: "lead-1",
      autoCycle: {
        nextPhoneId: "phone-2",
        readyNow: true,
      },
    };

    expect(reconcileRefreshedSelectedDialerLead(
      {
        id: "lead-1",
        autoCycle: {
          nextPhoneId: "phone-2",
          readyNow: true,
        },
      },
      refreshedLead,
      { leadId: "lead-1", nextPhoneId: "phone-2" },
    )).toBe(refreshedLead);
  });
});
