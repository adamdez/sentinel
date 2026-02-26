"use client";

import { motion } from "framer-motion";
import { Mail, Eye, MousePointer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const drips = [
  { name: "Probate Outreach", sent: 450, opened: 142, clicked: 23, status: "active" },
  { name: "Pre-Foreclosure SMS", sent: 280, opened: 198, clicked: 34, status: "active" },
  { name: "Tax Lien Follow-up", sent: 120, opened: 45, clicked: 8, status: "paused" },
];

export function ActiveDrips() {
  return (
    <div className="space-y-2">
      {drips.map((drip, i) => (
        <motion.div
          key={drip.name}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="p-2 rounded-lg bg-secondary/20 space-y-1.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium truncate">{drip.name}</span>
            <Badge
              variant={drip.status === "active" ? "neon" : "secondary"}
              className="text-[8px]"
            >
              {drip.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" /> {drip.sent}</span>
            <span className="flex items-center gap-1"><Eye className="h-2.5 w-2.5" /> {drip.opened}</span>
            <span className="flex items-center gap-1"><MousePointer className="h-2.5 w-2.5" /> {drip.clicked}</span>
          </div>
        </motion.div>
      ))}
      {/* TODO: Pull from campaigns table filtered to drip type */}
      {/* TODO: Real-time open/click tracking */}
      {/* TODO: Auto-promote respondents to lead status */}
    </div>
  );
}
