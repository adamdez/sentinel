"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Mail, Eye, MousePointer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";

interface DripStat {
  name: string;
  count: number;
  status: "active" | "paused";
}

export function ActiveDrips() {
  const [drips, setDrips] = useState<DripStat[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("status, tags, source")
      .in("status", ["nurture", "prospect", "lead"]);

    const rows = (leads ?? []) as { status: string; tags: string[] | null; source: string | null }[];

    const nurture = rows.filter((r) => r.status === "nurture");
    const drip = rows.filter((r) => r.tags?.includes("drip") || r.tags?.includes("follow_up"));
    const outreach = rows.filter((r) => r.source === "manual" || r.source === "manual-new-prospect");

    setDrips([
      { name: "Nurture Pipeline", count: nurture.length, status: nurture.length > 0 ? "active" : "paused" },
      { name: "Drip / Follow-up Tagged", count: drip.length, status: drip.length > 0 ? "active" : "paused" },
      { name: "Manual Outreach", count: outreach.length, status: outreach.length > 0 ? "active" : "paused" },
    ]);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
        ))}
      </div>
    );
  }

  const totalActive = drips.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-2">
      {drips.map((drip, i) => (
        <motion.div
          key={drip.name}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="p-2 rounded-[12px] bg-secondary/20 space-y-1.5 transition-all hover:bg-secondary/25"
          style={drip.status === "active" ? { boxShadow: "inset 0 0 15px rgba(0,212,255,0.02)" } : {}}
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
            <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" /> {drip.count} leads</span>
          </div>
        </motion.div>
      ))}
      <p className="text-[9px] text-muted-foreground text-center pt-1">
        {totalActive > 0
          ? `${totalActive} leads across active pipelines`
          : "No leads in nurture or drip sequences yet"}
      </p>
    </div>
  );
}
