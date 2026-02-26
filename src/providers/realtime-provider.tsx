"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

interface RealtimeContextValue {
  connected: boolean;
  subscribe: (channel: string, handler: (data: unknown) => void) => () => void;
  publish: (channel: string, data: unknown) => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  subscribe: () => () => {},
  publish: () => {},
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const listeners = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());

  useEffect(() => {
    // TODO: Replace with WebSocket / SSE / Supabase Realtime connection
    const timer = setTimeout(() => setConnected(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const subscribe = (channel: string, handler: (data: unknown) => void) => {
    if (!listeners.current.has(channel)) {
      listeners.current.set(channel, new Set());
    }
    listeners.current.get(channel)!.add(handler);

    return () => {
      listeners.current.get(channel)?.delete(handler);
    };
  };

  const publish = (channel: string, data: unknown) => {
    listeners.current.get(channel)?.forEach((handler) => handler(data));
  };

  return (
    <RealtimeContext.Provider value={{ connected, subscribe, publish }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
