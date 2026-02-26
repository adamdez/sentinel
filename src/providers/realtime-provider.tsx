"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface RealtimeContextValue {
  connected: boolean;
  onlineUsers: string[];
  subscribe: (channel: string, handler: (data: unknown) => void) => () => void;
  publish: (channel: string, data: unknown) => void;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  onlineUsers: [],
  subscribe: () => () => {},
  publish: () => {},
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const listeners = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());
  const presenceChannel = useRef<RealtimeChannel | null>(null);
  const { currentUser } = useSentinelStore();

  useEffect(() => {
    const channel = supabase.channel("sentinel_presence", {
      config: { presence: { key: currentUser.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineUsers(Object.keys(state));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          await channel.track({
            user_id: currentUser.id,
            user_name: currentUser.name,
            online_at: new Date().toISOString(),
          });
        }
      });

    presenceChannel.current = channel;

    return () => {
      supabase.removeChannel(channel);
      setConnected(false);
    };
  }, [currentUser.id, currentUser.name]);

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
    <RealtimeContext.Provider value={{ connected, onlineUsers, subscribe, publish }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
