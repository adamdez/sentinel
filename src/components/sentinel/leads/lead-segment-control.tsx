"use client";

import { motion } from "framer-motion";
import { Users, UserCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DynamicTeamMember, LeadSegment } from "@/lib/leads-data";
import type { Role } from "@/lib/types";

interface LeadSegmentControlProps {
  value: LeadSegment;
  onChange: (segment: LeadSegment) => void;
  counts: { all: number; mine: number; byMember: Record<string, number> };
  currentUserId: string;
  currentUserRole: Role;
  /** Other team members (current user already excluded by the hook). */
  teamMembers: DynamicTeamMember[];
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
  currentUserRole,
  teamMembers,
}: LeadSegmentControlProps) {
  const tabs: Tab[] = [
    { id: "mine", label: "My Leads", icon: UserCheck, count: counts.mine },
    { id: "all", label: "Team Leads", icon: Users, count: counts.all },
  ];

  // Admins see per-member tabs for OTHER team members (their own is "My Leads")
  if (currentUserRole === "admin") {
    for (const member of teamMembers) {
      const firstName = member.name.split(" ")[0];
      tabs.push({
        id: member.id,
        label: `${firstName}'s Leads`,
        icon: User,
        count: counts.byMember[member.id] ?? 0,
      });
    }
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-[12px] bg-secondary/40 border border-glass-border w-fit">
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            {active && (
              <motion.div
                layoutId="lead-segment-pill"
                className="absolute inset-0 rounded-[10px] bg-primary/[0.08] border border-primary/15 shadow-[0_0_10px_var(--overlay-6)]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <tab.icon className="h-3 w-3" />
              {tab.label}
              <span
                className={cn(
                  "text-sm px-1.5 py-0 rounded-full",
                  active
                    ? "bg-primary/12 text-primary"
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
