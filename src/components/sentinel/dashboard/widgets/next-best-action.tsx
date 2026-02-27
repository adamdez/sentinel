"use client";

import { motion } from "framer-motion";
import { Zap, ArrowRight, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function GlowingOrb() {
  return (
    <div className="relative flex items-center justify-center">
      <motion.div
        className="absolute h-8 w-8 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,255,136,0.4) 0%, rgba(0,255,136,0.1) 50%, transparent 70%)",
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute h-5 w-5 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(0,255,136,0.6) 0%, rgba(0,255,136,0.2) 60%, transparent 80%)",
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />
      <Zap className="h-3.5 w-3.5 text-neon relative z-10" style={{ filter: "drop-shadow(0 0 4px rgba(0,255,136,0.6))" }} />
    </div>
  );
}

export function NextBestAction() {
  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-lg bg-neon/5 border border-neon/15 relative overflow-hidden"
      >
        <div
          className="absolute top-0 right-0 w-24 h-24 pointer-events-none"
          style={{
            background: "radial-gradient(circle at top right, rgba(0,255,136,0.06) 0%, transparent 70%)",
          }}
        />
        <div className="flex items-center gap-2 mb-2">
          <GlowingOrb />
          <span className="text-[10px] font-semibold text-neon uppercase tracking-wider">
            AI Recommendation
          </span>
        </div>
        <p className="text-xs font-medium mb-1">
          Call Margaret Henderson now
        </p>
        <p className="text-[10px] text-muted-foreground mb-2.5">
          Probate lead scored 94 — callback requested 2h ago. Highest conversion probability window closing.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-[10px] gap-1 flex-1">
            <Phone className="h-3 w-3" />
            Call Now
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1">
            <Clock className="h-3 w-3" />
            Snooze
          </Button>
        </div>
      </motion.div>

      <div className="text-[9px] text-muted-foreground flex items-center gap-1">
        <ArrowRight className="h-2.5 w-2.5" />
        Next: Follow up with R. Chen on counter offer
      </div>
      {/* TODO: ML model for optimal contact timing */}
      {/* TODO: Queue of ranked next-best-actions */}
      {/* TODO: Snooze persists to user preferences */}
    </div>
  );
}
