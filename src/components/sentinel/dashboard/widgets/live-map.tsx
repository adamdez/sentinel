"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";

const ACTIVE_STATUSES = ["lead", "negotiation", "disposition", "working"];

interface PipelineLead {
  id: string;
  priority: number | null;
  properties: { address: string | null; owner_name: string | null; apn: string | null } | null;
}

function scoreColor(composite: number): { bg: string; ring: string } {
  if (composite >= 85) return { bg: "bg-red-500", ring: "rgba(239,68,68,0.4)" };
  if (composite >= 65) return { bg: "bg-amber-500", ring: "rgba(245,158,11,0.35)" };
  if (composite >= 40) return { bg: "bg-sky-500", ring: "rgba(14,165,233,0.3)" };
  return { bg: "bg-muted-foreground/50", ring: "rgba(148,163,184,0.2)" };
}

function hashToPosition(str: string, seed: number): { top: string; left: string } {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  const top = 15 + Math.abs(h % 60);
  const left = 10 + Math.abs((h * 7 + 13) % 70);
  return { top: `${top}%`, left: `${left}%` };
}

function PinWithRing({ top, left, size, color, ringColor, delay = 0, label }: {
  top: string; left: string; size: string; color: string; ringColor: string; delay?: number; label?: string;
}) {
  return (
    <div className="absolute group/pin" style={{ top, left }}>
      <div className={`${size} rounded-full ${color} relative`} style={{ boxShadow: `0 0 10px ${ringColor}` }}>
        <div
          className="absolute inset-[-3px] rounded-full border pointer-events-none"
          style={{
            borderColor: ringColor,
            animation: `ring-expand 2.5s ease-out ${delay}s infinite`,
          }}
        />
        <div
          className="absolute inset-[-3px] rounded-full border pointer-events-none"
          style={{
            borderColor: ringColor,
            animation: `ring-expand 2.5s ease-out ${delay + 1.2}s infinite`,
          }}
        />
      </div>
      {label && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover/pin:opacity-100 transition-opacity pointer-events-none z-10">
          <div className="bg-[rgba(12,12,22,0.4)] border border-white/[0.06] rounded px-1.5 py-0.5 text-xs whitespace-nowrap backdrop-blur-sm">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveMap() {
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("leads") as any)
        .select("id, priority, properties(address, owner_name, apn)")
        .in("status", ACTIVE_STATUSES)
        .order("priority", { ascending: false, nullsFirst: false })
        .limit(30);

      setLeads((data as PipelineLead[]) ?? []);
    } catch (err) {
      console.error("[LiveMap] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const pins = useMemo(() => {
    return leads.slice(0, 12).map((l, i) => {
      const score = l.priority ?? 0;
      const prop = Array.isArray(l.properties) ? l.properties[0] : l.properties;
      const apn = prop?.apn ?? "";
      const ownerName = prop?.owner_name ?? "Unknown";
      const { bg, ring } = scoreColor(score);
      const pos = hashToPosition(l.id + apn, i);
      const size = score >= 85 ? "h-3 w-3" : score >= 65 ? "h-3 w-3" : "h-2.5 w-2.5";
      return { ...pos, size, bg, ring, delay: i * 0.3, label: `${ownerName} — ${score}` };
    });
  }, [leads]);

  const fireCount = leads.filter((l) => (l.priority ?? 0) >= 85).length;
  const hotCount = leads.filter((l) => (l.priority ?? 0) >= 65 && (l.priority ?? 0) < 85).length;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="rounded-[10px] aspect-[16/9] min-h-[180px]" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-[10px] overflow-hidden bg-white/[0.02] border border-white/[0.06] aspect-[16/9] min-h-[180px]">
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at 45% 40%, rgba(255,255,255,0.03) 0%, transparent 55%)",
          }}
        />

        {pins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No active pipeline leads to map</p>
            </div>
          </div>
        )}

        {pins.map((pin, i) => (
          <PinWithRing
            key={i}
            top={pin.top}
            left={pin.left}
            size={pin.size}
            color={pin.bg}
            ringColor={pin.ring}
            delay={pin.delay}
            label={pin.label}
          />
        ))}

        <div className="absolute bottom-2 left-2 flex gap-1.5">
          {fireCount > 0 && (
            <Badge variant="neon" className="text-xs">{fireCount} FIRE</Badge>
          )}
          {hotCount > 0 && (
            <Badge variant="outline" className="text-xs border-border/30 text-foreground">{hotCount} HOT</Badge>
          )}
          <Badge variant="outline" className="text-xs">{leads.length} Pipeline</Badge>
        </div>
      </div>
    </div>
  );
}
