"use client";

import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import type { BrickedComp } from "@/providers/bricked/adapter";

function ts(v?: number | null): string {
  if (v == null) return "—";
  return new Date(v * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dist(subLat: number, subLng: number, cLat?: number, cLng?: number): string | null {
  if (cLat == null || cLng == null) return null;
  const R = 3958.8;
  const dLat = ((cLat - subLat) * Math.PI) / 180;
  const dLng = ((cLng - subLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((subLat * Math.PI) / 180) *
      Math.cos((cLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return `${(R * c).toFixed(2)} mi`;
}

interface Props {
  comp: BrickedComp;
  index: number;
  selected: boolean;
  onToggle: (idx: number) => void;
  subjectLat: number;
  subjectLng: number;
  highlighted?: boolean;
}

export function BrickedCompCard({
  comp,
  index,
  selected,
  onToggle,
  subjectLat,
  subjectLng,
  highlighted,
}: Props) {
  const address = comp.address?.fullAddress ?? "Unknown address";
  const det = comp.details;
  const beds = det?.bedrooms;
  const baths = det?.bathrooms;
  const sqft = det?.squareFeet;
  const yearBuilt = det?.yearBuilt;
  const salePrice = det?.lastSaleAmount;
  const saleDate = det?.lastSaleDate;
  const dom = det?.daysOnMarket;
  const distance = dist(subjectLat, subjectLng, comp.latitude, comp.longitude);
  const photo = comp.images?.[0];

  return (
    <div
      id={`bricked-comp-${index}`}
      className={cn(
        "rounded-[10px] border p-3 transition-all",
        highlighted
          ? "border-cyan/40 bg-cyan/[0.04] shadow-[0_0_12px_rgba(0,212,255,0.08)]"
          : "border-white/[0.06] bg-[rgba(12,12,22,0.5)]",
      )}
    >
      <div className="flex items-start gap-3">
        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(index)}
            className="rounded border-white/20"
          />
          <span className="text-[10px] text-muted-foreground">Include</span>
        </label>
        {distance && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">{distance}</span>
        )}
        {comp.mls?.mlsNumber && (
          <Badge variant="outline" className="text-[8px] shrink-0">MLS</Badge>
        )}
        {comp.compType && (
          <Badge variant="outline" className="text-[8px] shrink-0 capitalize">{comp.compType}</Badge>
        )}
      </div>

      <div className="flex gap-3 mt-2">
        {photo ? (
          <img src={photo} alt={address} className="h-[72px] w-[96px] rounded-md object-cover shrink-0" />
        ) : (
          <div className="h-[72px] w-[96px] rounded-md bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-muted-foreground/30" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground truncate">{address}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {[
              beds != null ? `${beds} beds` : null,
              baths != null ? `${baths} bath` : null,
              sqft != null ? `${sqft.toLocaleString()} sqft` : null,
              yearBuilt != null ? `Built ${yearBuilt}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {[
              saleDate ? `Sold ${ts(saleDate)}` : null,
              dom != null ? `${dom} DOM` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold font-mono">
            {salePrice != null ? formatCurrency(salePrice) : "—"}
          </p>
          {comp.adjusted_value != null && comp.adjusted_value !== salePrice && (
            <p className="text-[10px] text-cyan/80 font-mono">
              Adj {formatCurrency(comp.adjusted_value)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
