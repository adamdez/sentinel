"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  DEFAULT_IDLE_RAIL_ATTENTION,
  hasIdleRailMissedAttention,
  idleRailAttentionReducer,
  type IdleRailAttentionSnapshot,
} from "@/lib/dialer/idle-rail-attention";

type SmsThreadsAttentionResponse = {
  totalUnread?: number;
};

type QueueAttentionResponse = {
  missed_inbound?: unknown[];
  unclassified_answered?: unknown[];
};

type UseIdleRailAttentionOptions = {
  getHeaders: () => Promise<Record<string, string>>;
  refreshMs?: number;
};

const DEFAULT_REFRESH_MS = 10_000;

export function useIdleRailAttention({
  getHeaders,
  refreshMs = DEFAULT_REFRESH_MS,
}: UseIdleRailAttentionOptions) {
  const [state, dispatch] = useReducer(
    idleRailAttentionReducer,
    DEFAULT_IDLE_RAIL_ATTENTION,
  );
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshAttention = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      const headers = await getHeaders();
      const [smsResult, queueResult] = await Promise.allSettled([
        fetch("/api/twilio/sms/threads", { headers, cache: "no-store" }),
        fetch("/api/dialer/v1/queue?limit=1", { headers, cache: "no-store" }),
      ]);

      let hasUnreadSms = false;
      let hasMissedQueueItems = false;

      if (smsResult.status === "fulfilled") {
        if (smsResult.value.ok) {
          const smsData = (await smsResult.value.json()) as SmsThreadsAttentionResponse;
          hasUnreadSms = (smsData.totalUnread ?? 0) > 0;
        } else {
          console.warn("[Dialer] Failed to refresh SMS attention state:", smsResult.value.status);
        }
      } else {
        console.warn("[Dialer] Failed to refresh SMS attention state:", smsResult.reason);
      }

      if (queueResult.status === "fulfilled") {
        if (queueResult.value.ok) {
          const queueData = (await queueResult.value.json()) as QueueAttentionResponse;
          hasMissedQueueItems =
            (queueData.missed_inbound?.length ?? 0) > 0
            || (queueData.unclassified_answered?.length ?? 0) > 0;
        } else {
          console.warn("[Dialer] Failed to refresh missed attention state:", queueResult.value.status);
        }
      } else {
        console.warn("[Dialer] Failed to refresh missed attention state:", queueResult.reason);
      }

      if (!mountedRef.current) return;

      dispatch({
        type: "backend_synced",
        hasUnreadSms,
        hasMissedQueueItems,
      });
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [getHeaders]);

  useEffect(() => {
    void refreshAttention();

    const interval = window.setInterval(() => {
      void refreshAttention();
    }, refreshMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshAttention, refreshMs]);

  const recordLocalMissedCall = useCallback(() => {
    dispatch({ type: "local_missed" });
  }, []);

  const clearLocalMissedAttention = useCallback(() => {
    dispatch({ type: "local_missed_seen" });
  }, []);

  return {
    state: state as IdleRailAttentionSnapshot,
    hasMissedAttention: hasIdleRailMissedAttention(state),
    recordLocalMissedCall,
    clearLocalMissedAttention,
    refreshAttention,
  };
}
