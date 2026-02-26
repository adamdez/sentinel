"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "./glass-card";
import { cn } from "@/lib/utils";

type DialerState = "idle" | "dialing" | "connected" | "ended";

export function DialerWidget() {
  const [state, setState] = useState<DialerState>("idle");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const handleDial = () => {
    setState("dialing");
    // TODO: Integrate Twilio Client JS
    setTimeout(() => {
      setState("connected");
      const timer = setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
      // Auto-end after 5s for demo
      setTimeout(() => {
        clearInterval(timer);
        setState("ended");
        setTimeout(() => {
          setState("idle");
          setElapsed(0);
        }, 2000);
      }, 5000);
    }, 2000);
  };

  const handleHangup = () => {
    setState("ended");
    setTimeout(() => {
      setState("idle");
      setElapsed(0);
    }, 2000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <GlassCard
      glow={state === "connected"}
      className={cn(
        "transition-all duration-300",
        state === "dialing" && "border-yellow-500/30"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Phone className="h-4 w-4 text-neon" />
          Dialer
        </h3>
        {state !== "idle" && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full",
              state === "dialing" && "bg-yellow-500/10 text-yellow-400",
              state === "connected" && "bg-neon/10 text-neon",
              state === "ended" && "bg-destructive/10 text-destructive"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                state === "dialing" && "bg-yellow-400 animate-pulse",
                state === "connected" && "bg-neon animate-pulse",
                state === "ended" && "bg-destructive"
              )}
            />
            {state === "dialing" && "Dialing..."}
            {state === "connected" && "Connected"}
            {state === "ended" && "Ended"}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3 p-3 rounded-lg bg-secondary/30">
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Margaret Henderson</p>
          <p className="text-xs text-muted-foreground">(602) 555-0142</p>
        </div>
        {state === "connected" && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTime(elapsed)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {state === "idle" && (
          <Button onClick={handleDial} className="flex-1 gap-2">
            <Phone className="h-4 w-4" />
            Call
          </Button>
        )}
        {(state === "dialing" || state === "connected") && (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMuted(!muted)}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button
              variant="destructive"
              className="flex-1 gap-2"
              onClick={handleHangup}
            >
              <PhoneOff className="h-4 w-4" />
              Hang Up
            </Button>
          </>
        )}
        {state === "ended" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full text-center text-sm text-muted-foreground py-2"
          >
            Call ended — {formatTime(elapsed)}
          </motion.div>
        )}
      </div>
    </GlassCard>
  );
}
