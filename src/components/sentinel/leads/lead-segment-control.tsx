"use client";

import { motion } from "framer-motion";
import { Users, UserCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEAM_MEMBERS, type LeadSegment } from "@/lib/leads-data";
import type { Role } from "@/lib/types";

interface LeadSegmentControlProps {
  value: LeadSegment;
  onChange: (segment: LeadSegment) => void;
  counts: { all: number; mine: number; byMember: Record<string, number> };
  currentUserId: string;
  currentUserRole: Role;
}

interface Tab {
  id: LeadSegment;
  label: string;
  icon: React.ElementType;
  count: number;
}

export function LeadSegmentControl({
  value,
  onChange,
  counts,
  currentUserId,
  currentUserRole,
}: LeadSegmentControlProps) {
  const tabs: Tab[] = [
    { id: "all", label: "All Leads", icon: Users, count: counts.all },
    { id: "mine", label: "My Leads", icon: UserCheck, count: counts.mine },
  ];

  if (currentUserRole === "admin") {
    for (const member of TEAM_MEMBERS) {
      if (member.id === currentUserId) continue;
      tabs.push({
        id: member.id,
        label: `${member.name.split(" ")[0]}'s`,
        icon: User,
        count: counts.byMember[member.id] ?? 0,
      });
    }
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/40 border border-glass-border w-fit">
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            {active && (
              <motion.div
                layoutId="lead-segment-pill"
                className="absolute inset-0 rounded-md bg-glass border border-glass-border shadow-sm"
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <tab.icon className="h-3 w-3" />
              {tab.label}
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0 rounded-full",
                  active
                    ? "bg-neon/15 text-neon"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
