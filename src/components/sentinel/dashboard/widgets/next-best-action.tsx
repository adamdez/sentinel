"use client";

import { motion } from "framer-motion";
import { Zap, ArrowRight, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function NextBestAction() {
  return (
    <div className="space-y-3">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 rounded-lg bg-neon/5 border border-neon/15"
      >
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-3.5 w-3.5 text-neon" />
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
