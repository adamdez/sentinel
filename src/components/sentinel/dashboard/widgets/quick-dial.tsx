"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Phone, PhoneOff, User, Shield, Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { scrubLeadClient } from "@/lib/compliance";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface DialLead {
  name: string;
  phone: string;
  reason: string;
  compliant: boolean;
  blockedReasons: string[];
  scrubLoading: boolean;
}

export function QuickDial() {
  const [calling, setCalling] = useState(false);
  const [lead, setLead] = useState<DialLead | null>(null);
  const [loading, setLoading] = useState(true);
  const { ghostMode } = useSentinelStore();

  const fetchAndScrub = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("id, property_id, priority, tags, status")
      .in("status", ["prospect", "lead", "negotiation"])
      .order("priority", { ascending: false })
      .limit(20);

    if (!leads || leads.length === 0) {
      setLoading(false);
      return;
    }

    const propIds = [...new Set((leads as { property_id: string }[]).map((l) => l.property_id).filter(Boolean))];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: props } = await (supabase.from("properties") as any)
      .select("id, owner_name, owner_phone")
      .in("id", propIds)
      .not("owner_phone", "is", null);

    if (!props || props.length === 0) {
      setLoading(false);
      return;
    }

    const phoneMap = new Map<string, { name: string; phone: string }>();
    for (const p of props as { id: string; owner_name: string; owner_phone: string }[]) {
      if (p.owner_phone) phoneMap.set(p.id, { name: p.owner_name, phone: p.owner_phone });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of leads as any[]) {
      const prop = phoneMap.get(l.property_id);
      if (!prop) continue;

      const tag = (l.tags?.[0] ?? l.status ?? "Lead").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      setLead({
        name: prop.name,
        phone: prop.phone,
        reason: `${tag} — Score ${l.priority}`,
        compliant: ghostMode,
        blockedReasons: ghostMode ? [] : [],
        scrubLoading: !ghostMode,
      });
      setLoading(false);

      if (!ghostMode) {
        const scrub = await scrubLeadClient(prop.phone);
        setLead((prev) => prev ? {
          ...prev,
          compliant: scrub.allowed,
          blockedReasons: scrub.blockedReasons,
          scrubLoading: false,
        } : null);
      }
      return;
    }

    setLoading(false);
  }, [ghostMode]);

  useEffect(() => { fetchAndScrub(); }, [fetchAndScrub]);

  const handleCall = () => {
    setCalling(true);
    setTimeout(() => setCalling(false), 3000);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 p-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <Phone className="h-6 w-6 text-muted-foreground mb-2" />
        <p className="text-xs text-muted-foreground">
          No leads with phone numbers — skip trace a prospect to get started.
        </p>
      </div>
    );
  }

  const canDial = lead.compliant || ghostMode;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary/20">
        <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">{lead.name}</p>
          <p className="text-[10px] text-muted-foreground">{lead.phone}</p>
          <p className="text-[9px] text-neon">{lead.reason}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
        {lead.scrubLoading ? (
          <>
            <div className="h-3 w-3 rounded-full border-2 border-neon/40 border-t-neon animate-spin" />
            <span>Running compliance scrub...</span>
          </>
        ) : ghostMode ? (
          <>
            <Ghost className="h-3 w-3 text-yellow-400" />
            <span className="text-yellow-400">Ghost Mode — scrub bypassed (research only)</span>
          </>
        ) : (
          <>
            <Shield className={cn("h-3 w-3", lead.compliant ? "text-neon" : "text-destructive")} />
            {lead.compliant
              ? "Compliance cleared — DNC clean"
              : `BLOCKED — ${lead.blockedReasons.join(", ")}`}
          </>
        )}
      </div>

      {calling ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
          <div className="flex items-center justify-center gap-2 py-2">
            <span className="h-2 w-2 rounded-full bg-neon animate-pulse" style={{ boxShadow: "0 0 8px rgba(0,255,136,0.5), 0 0 16px rgba(0,255,136,0.2)" }} />
            <span className="text-xs text-neon font-medium" style={{ textShadow: "0 0 8px rgba(0,255,136,0.4)" }}>Calling...</span>
          </div>
          <Button variant="destructive" className="w-full h-8 text-xs gap-1" onClick={() => setCalling(false)}>
            <PhoneOff className="h-3 w-3" />
            Hang Up
          </Button>
        </motion.div>
      ) : (
        <Button
          className="w-full h-8 text-xs gap-1"
          onClick={handleCall}
          disabled={!canDial || lead.scrubLoading}
        >
          <Phone className="h-3 w-3" />
          {lead.scrubLoading ? "Checking..." : "Quick Call"}
        </Button>
      )}
    </div>
  );
}
