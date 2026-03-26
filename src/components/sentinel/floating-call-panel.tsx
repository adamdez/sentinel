"use client";

import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, ExternalLink, Loader2 } from "lucide-react";
import { useTwilio } from "@/providers/twilio-provider";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";

function formatPhone(raw: string | null): string {
  if (!raw) return "Unknown";
  const d = raw.replace(/\D/g, "").slice(-10);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return raw;
}

export function FloatingCallPanel() {
  const {
    callState, callMeta, formatted, isMuted,
    incomingCall, incomingFrom,
    endCall, toggleMute, answerIncoming, rejectIncoming,
  } = useTwilio();
  const pathname = usePathname();

  // Don't render on the dialer page — it manages its own call UI
  if (pathname === "/dialer") return null;

  // ── Incoming call popup ──────────────────────────────────────────────
  if (callState === "incoming" && incomingCall) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border shadow-2xl backdrop-blur-xl bg-card/95 border-emerald-500/30 animate-pulse-slow">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="relative shrink-0">
            <div className="h-10 w-10 rounded-full flex items-center justify-center bg-emerald-500/20 text-emerald-400">
              <PhoneIncoming className="h-5 w-5" />
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-400">Incoming Call</p>
            <p className="text-sm font-mono text-foreground/90">{formatPhone(incomingFrom)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={answerIncoming}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
          >
            <Phone className="h-4 w-4" />
            Answer
          </button>
          <button
            onClick={rejectIncoming}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors"
          >
            <PhoneOff className="h-4 w-4" />
            Reject
          </button>
        </div>
      </div>
    );
  }

  // ── Active/ended call panel ──────────────────────────────────────────
  if (callState === "idle") return null;

  const isDialing = callState === "dialing";
  const isEnded = callState === "ended";

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 w-72 rounded-xl border shadow-2xl backdrop-blur-xl",
        "bg-card/95 border-overlay-6",
        isEnded && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Pulsing indicator */}
        <div className="relative shrink-0">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              isDialing
                ? "bg-amber-500/20 text-amber-400"
                : isEnded
                  ? "bg-muted text-muted-foreground"
                  : "bg-green-500/20 text-green-400",
            )}
          >
            {isDialing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
          </div>
          {!isDialing && !isEnded && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-foreground">
            {callMeta?.leadName || "Unknown"}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {isDialing
                ? "Dialing…"
                : isEnded
                  ? "Call ended"
                  : formatted}
            </span>
            {callMeta?.phone && (
              <>
                <span>·</span>
                <span>***{callMeta.phone.slice(-4)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      {!isEnded && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={toggleMute}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors",
              isMuted
                ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                : "bg-overlay-4 text-muted-foreground hover:bg-overlay-6 hover:text-foreground",
            )}
          >
            {isMuted ? (
              <MicOff className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            {isMuted ? "Unmute" : "Mute"}
          </button>

          <button
            onClick={endCall}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            End
          </button>

          <Link
            href="/dialer"
            className="flex items-center justify-center rounded-lg py-1.5 px-2 text-xs text-muted-foreground hover:text-foreground bg-overlay-4 hover:bg-overlay-6 transition-colors"
            title="Open in Dialer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
