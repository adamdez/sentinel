"use client";

import { useEffect } from "react";
import { useRealtime } from "@/providers/realtime-provider";

export function useRealtimeChannel(
  channel: string,
  handler: (data: unknown) => void
) {
  const { subscribe } = useRealtime();

  useEffect(() => {
    const unsubscribe = subscribe(channel, handler);
    return unsubscribe;
  }, [channel, handler, subscribe]);
}
