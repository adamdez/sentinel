"use client";

import { CalendarDays, Plus, Clock, MapPin } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const events = [
  { time: "9:00 AM", title: "Morning Dial Session", type: "Recurring", color: "bg-cyan/[0.08] border-cyan/15 text-neon" },
  { time: "11:00 AM", title: "Henderson Property Walkthrough", type: "Appointment", color: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
  { time: "2:00 PM", title: "Contract Review — Chen Deal", type: "Task", color: "bg-purple-500/10 border-purple-500/20 text-purple-400" },
  { time: "4:00 PM", title: "Follow-up: Tax Lien Batch", type: "Follow-up", color: "bg-orange-500/10 border-orange-500/20 text-orange-400" },
];

export default function MyCalendarPage() {
  return (
    <PageShell
      title="My Calendar"
      description="Sentinel My Calendar — Your personal schedule and task timeline"
      actions={
        <Button size="sm" className="gap-2 text-xs">
          <Plus className="h-3 w-3" />
          Add Event
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GlassCard hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-neon" />
                Today&apos;s Schedule
              </h2>
              <Badge variant="neon" className="text-[10px]">{events.length} Events</Badge>
            </div>
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.title}
                  className={`flex items-center gap-4 p-3 rounded-[10px] border ${event.color} transition-colors hover:brightness-110`}
                >
                  <div className="text-xs font-mono w-16 shrink-0">
                    <Clock className="h-3 w-3 inline mr-1 opacity-50" />
                    {event.time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{event.title}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {event.type}
                  </Badge>
                </div>
              ))}
            </div>
            {/* TODO: Calendar sync integration */}
            {/* TODO: Auto-schedule follow-ups based on lead status */}
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard>
            <h3 className="text-sm font-semibold mb-3">Upcoming</h3>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2">
                  <Skeleton className="h-3 w-14 shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          </GlassCard>
          <GlassCard>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              Property Visits
            </h3>
            <p className="text-xs text-muted-foreground">
              No property visits scheduled today.
            </p>
            {/* TODO: MapView integration for property visits */}
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}
