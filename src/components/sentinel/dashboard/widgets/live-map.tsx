"use client";

import { MapPin, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function PinWithRing({ top, left, size, color, ringColor, delay = 0 }: {
  top: string; left: string; size: string; color: string; ringColor: string; delay?: number;
}) {
  return (
    <div className="absolute" style={{ top, left }}>
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
    </div>
  );
}

export function LiveMap() {
  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden bg-secondary/20 border border-glass-border aspect-[16/9] min-h-[180px]">
        <div className="absolute inset-0 sentinel-grid-bg opacity-30" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 45% 40%, rgba(0,255,136,0.04) 0%, transparent 50%), radial-gradient(ellipse at 60% 55%, rgba(255,68,68,0.03) 0%, transparent 40%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Map View</p>
            <p className="text-[10px] text-muted-foreground/60">
              Mapbox / Google Maps integration
            </p>
          </div>
        </div>

        <PinWithRing top="30%" left="40%" size="h-3 w-3" color="bg-neon" ringColor="rgba(0,255,136,0.4)" delay={0} />
        <PinWithRing top="50%" left="60%" size="h-3 w-3" color="bg-red-400" ringColor="rgba(255,68,68,0.35)" delay={0.5} />
        <PinWithRing top="65%" left="35%" size="h-2.5 w-2.5" color="bg-yellow-400" ringColor="rgba(234,179,8,0.3)" delay={1} />
        <div className="absolute top-[25%] left-[70%] h-2 w-2 rounded-full bg-blue-400" style={{ boxShadow: "0 0 6px rgba(59,130,246,0.4)" }} />

        <div className="absolute bottom-2 left-2 flex gap-1.5">
          <Badge variant="neon" className="text-[8px]">4 Active</Badge>
          <Badge variant="outline" className="text-[8px]">12 Prospects</Badge>
        </div>
      </div>
      {/* TODO: Mapbox GL JS / Google Maps integration */}
      {/* TODO: Property pins colored by AI score (fire/hot/warm/cold) */}
      {/* TODO: Click pin → lead detail flyout */}
      {/* TODO: Territory/county boundary overlay */}
      {/* TODO: Heatmap layer for distress density */}
    </div>
  );
}
