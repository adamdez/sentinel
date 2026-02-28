"use client";

import { Calendar, Users, Clock, Plus } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const teamMembers = ["Adam D.", "Sarah K.", "Mike R."];
const hours = Array.from({ length: 10 }, (_, i) => i + 8);

export default function TeamCalendarPage() {
  return (
    <PageShell
      title="Team Calendar"
      description="Sentinel Team Calendar — Shared scheduling for the acquisition team"
      actions={
        <Button size="sm" className="gap-2 text-xs">
          <Plus className="h-3 w-3" />
          New Event
        </Button>
      }
    >
      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-cyan" />
            Today — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">Week View</Badge>
            <Badge variant="neon" className="text-[10px]">Day View</Badge>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="col-span-1">
            <div className="h-10" />
            {hours.map((h) => (
              <div key={h} className="h-16 flex items-start justify-end pr-3 text-[10px] text-muted-foreground">
                {h > 12 ? h - 12 : h} {h >= 12 ? "PM" : "AM"}
              </div>
            ))}
          </div>
          {teamMembers.map((member) => (
            <div key={member} className="col-span-1">
              <div className="h-10 flex items-center gap-2 px-2">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs font-medium">{member}</span>
              </div>
              {hours.map((h) => (
                <div
                  key={h}
                  className="h-16 border-t border-glass-border hover:bg-secondary/20 transition-colors rounded-sm relative"
                >
                  {h === 10 && member === "Adam D." && (
                    <div className="absolute inset-1 rounded bg-cyan/8 border border-cyan/15 p-1">
                      <p className="text-[9px] font-medium text-cyan">Follow-up Calls</p>
                      <p className="text-[8px] text-muted-foreground">10 - 11 AM</p>
                    </div>
                  )}
                  {h === 14 && member === "Sarah K." && (
                    <div className="absolute inset-1 rounded bg-purple-500/10 border border-purple-500/20 p-1">
                      <p className="text-[9px] font-medium text-purple-400">Closing Meeting</p>
                      <p className="text-[8px] text-muted-foreground">2 - 3 PM</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* TODO: Google Calendar API integration */}
        {/* TODO: Drag-to-create events */}
        {/* TODO: Appointment scheduling with leads */}
      </GlassCard>
    </PageShell>
  );
}
