import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_RAIL_ATTENTION,
  hasIdleRailMissedAttention,
  idleRailAttentionReducer,
} from "@/lib/dialer/idle-rail-attention";

describe("idleRailAttentionReducer", () => {
  it("marks local missed calls as unseen until the operator reviews them", () => {
    const withMissedCall = idleRailAttentionReducer(DEFAULT_IDLE_RAIL_ATTENTION, {
      type: "local_missed",
    });
    const reviewed = idleRailAttentionReducer(withMissedCall, {
      type: "local_missed_seen",
    });

    expect(withMissedCall.hasUnseenLocalMissedCalls).toBe(true);
    expect(reviewed.hasUnseenLocalMissedCalls).toBe(false);
  });

  it("preserves local missed-call attention when backend queue state refreshes", () => {
    const withMissedCall = idleRailAttentionReducer(DEFAULT_IDLE_RAIL_ATTENTION, {
      type: "local_missed",
    });
    const synced = idleRailAttentionReducer(withMissedCall, {
      type: "backend_synced",
      hasUnreadSms: true,
      hasMissedQueueItems: false,
    });

    expect(synced.hasUnreadSms).toBe(true);
    expect(synced.hasUnseenLocalMissedCalls).toBe(true);
    expect(hasIdleRailMissedAttention(synced)).toBe(true);
  });

  it("shows missed attention for either backend queue items or unseen local misses", () => {
    expect(hasIdleRailMissedAttention(DEFAULT_IDLE_RAIL_ATTENTION)).toBe(false);
    expect(hasIdleRailMissedAttention({
      ...DEFAULT_IDLE_RAIL_ATTENTION,
      hasMissedQueueItems: true,
    })).toBe(true);
    expect(hasIdleRailMissedAttention({
      ...DEFAULT_IDLE_RAIL_ATTENTION,
      hasUnseenLocalMissedCalls: true,
    })).toBe(true);
  });
});
