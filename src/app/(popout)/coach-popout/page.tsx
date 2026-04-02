"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Brain } from "lucide-react";
import { useLiveCoach, type LiveCoachMode } from "@/hooks/use-live-coach";
import { LiveAssistPanel } from "@/components/sentinel/live-assist-panel";

const CHANNEL_NAME = "sentinel-coach-popout";

export default function CoachPopoutPage() {
  const params = useSearchParams();
  const sessionId = params.get("sessionId");
  const mode = (params.get("mode") as LiveCoachMode) || "outbound";

  const [callEnded, setCallEnded] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const { coach, loading, error } = useLiveCoach({
    sessionId,
    enabled: !callEnded && Boolean(sessionId),
    mode,
  });

  useEffect(() => {
    if (!sessionId) return;

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (event) => {
        const data = event.data as { type?: string; sessionId?: string };
        if (data.type === "call-ended" && data.sessionId === sessionId) {
          setCallEnded(true);
        }
      };
    } catch {
      // BroadcastChannel not supported; coach still works via polling
    }

    return () => {
      bc?.close();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!callEnded) return;
    closeTimerRef.current = window.setTimeout(() => {
      window.close();
    }, 4000);
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, [callEnded]);

  if (!sessionId) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No active session.</p>
      </div>
    );
  }

  if (callEnded) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8">
        <Brain className="h-6 w-6 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">Call ended</p>
        <p className="text-xs text-muted-foreground/50">This window will close shortly.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-overlay-8 px-4 py-3">
        <Brain className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Live Coach
        </span>
        {loading && (
          <span className="ml-auto rounded-full border border-overlay-8 bg-overlay-3 px-2 py-0.5 text-xs text-muted-foreground/60">
            Refreshing
          </span>
        )}
      </header>
      <div className="flex-1 overflow-y-auto">
        <LiveAssistPanel
          brief={null}
          coach={coach}
          loading={loading}
          error={error}
          showHeader={false}
        />
      </div>
    </div>
  );
}
