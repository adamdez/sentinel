"use client";

import { useMemo } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProspects, type ProspectRow } from "@/hooks/use-prospects";

function scoreColor(composite: number): { bg: string; ring: string } {
  if (composite >= 85) return { bg: "bg-cyan", ring: "rgba(0,212,255,0.4)" };
  if (composite >= 65) return { bg: "bg-red-400", ring: "rgba(255,68,68,0.35)" };
  if (composite >= 40) return { bg: "bg-yellow-400", ring: "rgba(234,179,8,0.3)" };
  return { bg: "bg-blue-400", ring: "rgba(59,130,246,0.3)" };
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
          <div className="bg-glass border border-glass-border rounded px-1.5 py-0.5 text-[8px] whitespace-nowrap backdrop-blur-sm">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveMap() {
  const { prospects, loading } = useProspects({
    sortField: "composite_score",
    sortDir: "desc",
  });

  const pins = useMemo(() => {
    return prospects.slice(0, 12).map((p: ProspectRow, i: number) => {
      const { bg, ring } = scoreColor(p.composite_score);
      const pos = hashToPosition(p.id + p.apn, i);
      const size = p.composite_score >= 85 ? "h-3 w-3" : p.composite_score >= 65 ? "h-3 w-3" : "h-2.5 w-2.5";
      return { ...pos, size, bg, ring, delay: i * 0.3, label: `${p.owner_name} — ${p.composite_score}` };
    });
  }, [prospects]);

  const fireCount = prospects.filter((p) => p.composite_score >= 85).length;
  const hotCount = prospects.filter((p) => p.composite_score >= 65 && p.composite_score < 85).length;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="rounded-lg aspect-[16/9] min-h-[180px]" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden bg-secondary/20 border border-glass-border aspect-[16/9] min-h-[180px]">
        <div className="absolute inset-0 sentinel-grid-bg opacity-30" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 45% 40%, rgba(0,212,255,0.04) 0%, transparent 50%), radial-gradient(ellipse at 60% 55%, rgba(255,68,68,0.03) 0%, transparent 40%)",
          }}
        />

        {pins.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No prospect data to map</p>
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
            <Badge variant="neon" className="text-[8px]">{fireCount} FIRE</Badge>
          )}
          {hotCount > 0 && (
            <Badge variant="outline" className="text-[8px] border-red-400/30 text-red-400">{hotCount} HOT</Badge>
          )}
          <Badge variant="outline" className="text-[8px]">{prospects.length} Total</Badge>
        </div>
      </div>
    </div>
  );
}
