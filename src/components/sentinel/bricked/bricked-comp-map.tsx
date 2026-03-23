"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Map as LMap } from "leaflet";
import type { BrickedComp } from "@/providers/bricked/adapter";

const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false },
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((m) => m.Tooltip),
  { ssr: false },
);

interface Props {
  subjectLat: number;
  subjectLng: number;
  subjectAddress: string;
  comps: BrickedComp[];
  selectedIndices: Set<number>;
  highlightedIndex: number | null;
  onPinClick: (idx: number) => void;
}

export function BrickedCompMap({
  subjectLat,
  subjectLng,
  subjectAddress,
  comps,
  selectedIndices,
  highlightedIndex,
  onPinClick,
}: Props) {
  const mapRef = useRef<LMap | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="rounded-[10px] border border-overlay-6 bg-overlay-2 h-[320px] flex items-center justify-center text-xs text-muted-foreground/40">
        Loading map…
      </div>
    );
  }

  return (
    <div className="rounded-[10px] overflow-hidden border border-overlay-6 h-[320px]">
      <MapContainer
        center={[subjectLat, subjectLng]}
        zoom={14}
        style={{ height: "100%", width: "100%", background: "var(--background)" }}
        ref={(map: LMap | null) => {
          mapRef.current = map;
        }}
        zoomControl
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        {/* Subject */}
        <CircleMarker
          center={[subjectLat, subjectLng]}
          radius={10}
          pathOptions={{
            color: "#f97316",
            fillColor: "#f97316",
            fillOpacity: 0.9,
            weight: 2,
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -12]}>
            <span className="text-[10px] font-semibold">Subject</span>
          </Tooltip>
        </CircleMarker>

        {/* Comps */}
        {comps.map((comp, i) => {
          if (comp.latitude == null || comp.longitude == null) return null;
          const isSel = selectedIndices.has(i);
          const isHl = highlightedIndex === i;
          return (
            <CircleMarker
              key={i}
              center={[comp.latitude, comp.longitude]}
              radius={isHl ? 10 : isSel ? 8 : 6}
              pathOptions={{
                color: isHl ? "#00d4ff" : isSel ? "#3b82f6" : "#6b7280",
                fillColor: isHl ? "#00d4ff" : isSel ? "#3b82f6" : "#6b7280",
                fillOpacity: isHl ? 1 : 0.75,
                weight: isHl ? 3 : 2,
              }}
              eventHandlers={{
                click: () => onPinClick(i),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <span className="text-[10px]">
                  #{i + 1} {comp.address?.fullAddress?.split(",")[0] ?? "Comp"}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
