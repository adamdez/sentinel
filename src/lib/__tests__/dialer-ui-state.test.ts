import { describe, expect, it } from "vitest";
import {
  buildDialerQueueCollections,
  findRefreshedDialerLead,
  selectFallbackDialerLead,
  selectInitialDialerLead,
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
  it("uses only ready auto-cycle leads for the power-dial execution queue", () => {
    const result = buildDialerQueueCollections({
      autoCycleMode: true,
      queue: queueLeads,
      queueLoading: false,
      autoCycleQueue: autoCycleLeads,
      autoCycleQueueLoading: true,
      isReadyLead: (lead) => lead.ready === true,
    });

    expect(result.displayedQueue.map((lead) => lead.id)).toEqual(["lead-a", "lead-b"]);
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
    expect(result.preferredQueue.map((lead) => lead.id)).toEqual(["lead-a"]);
    expect(result.powerDialReadyQueueExhausted).toBe(true);
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
});
