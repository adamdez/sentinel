"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface ComplianceData {
  dncCount: number;
  litigantCount: number;
  optOutCount: number;
  totalLeads: number;
  blockedLeads: number;
}

export function ComplianceStatus() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [dncRes, litRes, optRes, leadsRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("dnc_list") as any).select("id", { count: "exact", head: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("litigants") as any).select("id", { count: "exact", head: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("opt_outs") as any).select("id", { count: "exact", head: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.from("leads") as any).select("id, compliance_flags", { count: "exact" }),
    ]);

    const totalLeads = leadsRes.count ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadsRows = (leadsRes.data ?? []) as any[];
    const blockedLeads = leadsRows.filter(
      (l) => l.compliance_flags && Object.keys(l.compliance_flags).length > 0
    ).length;

    setData({
      dncCount: dncRes.count ?? 0,
      litigantCount: litRes.count ?? 0,
      optOutCount: optRes.count ?? 0,
      totalLeads,
      blockedLeads,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-2.5">
        <Skeleton className="h-10 w-full rounded-[10px]" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  const d = data!;
  const totalScreened = d.dncCount + d.litigantCount + d.optOutCount;
  const healthPct = d.totalLeads > 0
    ? Math.round(((d.totalLeads - d.blockedLeads) / d.totalLeads) * 100)
    : 100;

  const healthColor = healthPct >= 95 ? "text-foreground" : healthPct >= 80 ? "text-foreground" : "text-foreground";

  const rows = [
    { icon: ShieldX, label: "DNC Numbers", value: d.dncCount, color: "text-foreground" },
    { icon: ShieldAlert, label: "Known Litigants", value: d.litigantCount, color: "text-foreground" },
    { icon: ShieldCheck, label: "Opt-Outs", value: d.optOutCount, color: "text-foreground" },
  ];

  return (
    <div className="space-y-2.5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-1.5 rounded-[12px] bg-secondary/20"
      >
        <p className={cn("text-2xl font-black", healthColor)}
          style={{ textShadow: healthPct >= 95 ? "0 0 12px rgba(52,211,153,0.4)" : undefined }}>
          {healthPct}%
        </p>
        <p className="text-[10px] text-muted-foreground">Clean Pipeline</p>
      </motion.div>

      {rows.map((r, i) => {
        const Icon = r.icon;
        return (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Icon className={cn("h-3 w-3", r.color)} />
              {r.label}
            </span>
            <span className="text-sm font-bold">{r.value.toLocaleString()}</span>
          </motion.div>
        );
      })}

      <p className="text-[10px] text-muted-foreground text-center pt-1">
        {totalScreened.toLocaleString()} records screened — {d.blockedLeads} leads flagged
      </p>
    </div>
  );
}
