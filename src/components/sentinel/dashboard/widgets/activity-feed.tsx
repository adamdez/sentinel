"use client";

import { motion } from "framer-motion";
import { Phone, UserPlus, FileCheck, Zap, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  time: string;
  color: string;
}

const FEED: FeedItem[] = [
  { id: "1", icon: Phone, text: "Called Margaret Henderson — 2:14 duration", time: "12m ago", color: "text-neon" },
  { id: "2", icon: Zap, text: "AI scored 3 new probate leads", time: "28m ago", color: "text-purple-400" },
  { id: "3", icon: UserPlus, text: "New prospect: Walker property (Tempe)", time: "1h ago", color: "text-blue-400" },
  { id: "4", icon: FileCheck, text: "Disposition sent for Chen deal", time: "2h ago", color: "text-orange-400" },
  { id: "5", icon: Mail, text: "Drip email opened by L. Morales", time: "3h ago", color: "text-yellow-400" },
];

export function ActivityFeed() {
  return (
    <div className="space-y-1.5">
      {FEED.map((item, i) => {
        const Icon = item.icon;
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-start gap-2.5 py-1.5"
          >
            <div className={cn("mt-0.5 shrink-0", item.color)} style={{ filter: `drop-shadow(0 0 3px currentColor)` }}>
              <Icon className="h-3 w-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] leading-tight truncate">{item.text}</p>
              <p className="text-[9px] text-muted-foreground">{item.time}</p>
            </div>
          </motion.div>
        );
      })}
      {/* TODO: Pull from audit_log filtered to current user */}
      {/* TODO: Real-time subscription for new events */}
      {/* TODO: Paginated "View All" link */}
    </div>
  );
}
