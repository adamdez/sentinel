"use client";

import { MapPin, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function LiveMap() {
  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden bg-secondary/20 border border-glass-border aspect-[16/9] min-h-[180px]">
        <div className="absolute inset-0 sentinel-grid-bg opacity-30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Map View</p>
            <p className="text-[10px] text-muted-foreground/60">
              Mapbox / Google Maps integration
            </p>
          </div>
        </div>

        {/* Simulated pins */}
        <div className="absolute top-[30%] left-[40%] h-3 w-3 rounded-full bg-neon shadow-[0_0_10px_rgba(0,255,136,0.5)] animate-pulse" />
        <div className="absolute top-[50%] left-[60%] h-3 w-3 rounded-full bg-red-400 shadow-[0_0_10px_rgba(255,68,68,0.4)] animate-pulse" />
        <div className="absolute top-[65%] left-[35%] h-2.5 w-2.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.4)]" />
        <div className="absolute top-[25%] left-[70%] h-2 w-2 rounded-full bg-blue-400" />

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
