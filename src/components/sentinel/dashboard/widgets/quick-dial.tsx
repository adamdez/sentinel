"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneOff, User, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function QuickDial() {
  const [calling, setCalling] = useState(false);

  const lead = {
    name: "Margaret Henderson",
    phone: "(602) 555-0142",
    reason: "Callback — probate",
    compliant: true,
  };

  const handleCall = () => {
    setCalling(true);
    // TODO: Twilio Client JS integration
    setTimeout(() => setCalling(false), 3000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary/20">
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{lead.name}</p>
          <p className="text-[10px] text-muted-foreground">{lead.phone}</p>
          <p className="text-[9px] text-neon">{lead.reason}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <Shield className={cn("h-3 w-3", lead.compliant ? "text-neon" : "text-destructive")} />
        {lead.compliant ? "Compliance cleared — DNC clean" : "BLOCKED — DNC registered"}
      </div>

      {calling ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="h-2 w-2 rounded-full bg-neon animate-pulse" />
            <span className="text-xs text-neon font-medium">Calling...</span>
          </div>
          <Button
            variant="destructive"
            className="w-full h-8 text-xs gap-1"
            onClick={() => setCalling(false)}
          >
            <PhoneOff className="h-3 w-3" />
            Hang Up
          </Button>
        </motion.div>
      ) : (
        <Button
          className="w-full h-8 text-xs gap-1"
          onClick={handleCall}
          disabled={!lead.compliant}
        >
          <Phone className="h-3 w-3" />
          Quick Call
        </Button>
      )}
      {/* TODO: Twilio Client JS WebRTC integration */}
      {/* TODO: Auto-advance to next lead after disposition */}
      {/* TODO: Call timer + recording indicator */}
    </div>
  );
}
