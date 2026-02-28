"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, DollarSign, Calendar, Ruler, Plus, X,
  Loader2, Filter, TrendingUp, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import dynamic from "next/dynamic";
import type { Map as LMap } from "leaflet";

// Dynamic imports for Leaflet (no SSR)
const MapContainer = dynamic(
  () => import("react-leaflet").then((m) => m.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((m) => m.TileLayer),
  { ssr: false }
);
const CircleMarker = dynamic(
  () => import("react-leaflet").then((m) => m.CircleMarker),
  { ssr: false }
);
const Circle = dynamic(
  () => import("react-leaflet").then((m) => m.Circle),
  { ssr: false }
);
const Tooltip = dynamic(
  () => import("react-leaflet").then((m) => m.Tooltip),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────────────

export interface CompProperty {
  radarId: string | null;
  apn: string;
  address: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  lat: number | null;
  lng: number | null;
  owner: string;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSize: number | null;
  avm: number | null;
  assessedValue: number | null;
  equityPercent: number | null;
  availableEquity: number | null;
  totalLoanBalance: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  lastSaleType: string | null;
  isVacant: boolean;
  isAbsentee: boolean;
  isFreeAndClear: boolean;
  isHighEquity: boolean;
  isForeclosure: boolean;
  isTaxDelinquent: boolean;
  isListedForSale: boolean;
  isRecentSale: boolean;
}

export interface SubjectProperty {
  lat: number;
  lng: number;
  address: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  avm: number | null;
}

interface CompsMapProps {
  subject: SubjectProperty;
  selectedComps: CompProperty[];
  onAddComp: (comp: CompProperty) => void;
  onRemoveComp: (apn: string) => void;
}

interface CompFilters {
  beds: boolean;
  baths: boolean;
  sqft: boolean;
  yearBuilt: boolean;
  propertyType: boolean;
}

// ── Comp quality classification ───────────────────────────────────────

function classifyComp(comp: CompProperty, subject: SubjectProperty): "good" | "marginal" | "outlier" {
  let score = 0;
  let checks = 0;

  if (subject.beds != null && comp.beds != null) {
    checks++;
    if (Math.abs(comp.beds - subject.beds) <= 1) score++;
  }
  if (subject.baths != null && comp.baths != null) {
    checks++;
    if (Math.abs(comp.baths - subject.baths) <= 0.5) score++;
  }
  if (subject.sqft != null && comp.sqft != null) {
    checks++;
    const pct = Math.abs(comp.sqft - subject.sqft) / subject.sqft;
    if (pct <= 0.15) score++;
  }
  if (subject.yearBuilt != null && comp.yearBuilt != null) {
    checks++;
    if (Math.abs(comp.yearBuilt - subject.yearBuilt) <= 10) score++;
  }

  if (checks === 0) return "marginal";
  const ratio = score / checks;
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.4) return "marginal";
  return "outlier";
}

const QUALITY_COLORS = {
  good: { fill: "#00ff88", stroke: "#00cc6a", label: "Good Comp" },
  marginal: { fill: "#facc15", stroke: "#ca8a04", label: "Marginal" },
  outlier: { fill: "#f87171", stroke: "#dc2626", label: "Outlier" },
};

// ── Main Component ────────────────────────────────────────────────────

export function CompsMap({ subject, selectedComps, onAddComp, onRemoveComp }: CompsMapProps) {
  const [comps, setComps] = useState<CompProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(4);
  const [selectedComp, setSelectedComp] = useState<CompProperty | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<CompFilters>({
    beds: true, baths: true, sqft: true, yearBuilt: false, propertyType: false,
  });
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<LMap | null>(null);
  const fetchIdRef = useRef(0);

  const selectedApns = useMemo(
    () => new Set(selectedComps.map((c) => c.apn)),
    [selectedComps]
  );

  const fetchComps = useCallback(async () => {
    fetchIdRef.current++;
    const thisId = fetchIdRef.current;
    setLoading(true);

    try {
      const res = await fetch("/api/comps/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: subject.lat,
          lng: subject.lng,
          radiusMiles,
          beds: filters.beds ? subject.beds : undefined,
          baths: filters.baths ? subject.baths : undefined,
          sqft: filters.sqft ? subject.sqft : undefined,
          yearBuilt: filters.yearBuilt ? subject.yearBuilt : undefined,
          propertyType: filters.propertyType ? subject.propertyType : undefined,
          limit: 80,
        }),
      });

      const data = await res.json();
      if (thisId !== fetchIdRef.current) return;

      if (data.success) {
        setComps(data.comps.filter((c: CompProperty) => c.lat != null && c.lng != null));
      }
    } catch (err) {
      console.error("[CompsMap] Fetch error:", err);
    } finally {
      if (thisId === fetchIdRef.current) setLoading(false);
    }
  }, [subject.lat, subject.lng, subject.beds, subject.baths, subject.sqft, subject.yearBuilt, subject.propertyType, radiusMiles, filters]);

  useEffect(() => {
    if (subject.lat && subject.lng) fetchComps();
  }, [fetchComps, subject.lat, subject.lng]);

  useEffect(() => {
    if (typeof window !== "undefined") setMapReady(true);
  }, []);

  const radiusMeters = radiusMiles * 1609.34;

  return (
    <div className="space-y-3">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] gap-1.5"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="h-3 w-3" />
            Filters {filtersOpen ? "▾" : "▸"}
          </Button>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Radius:</span>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(Number(e.target.value))}
              className="w-24 h-1 accent-[#00ff88] bg-secondary rounded-full"
            />
            <span className="font-mono text-neon font-semibold w-10">{radiusMiles}mi</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-neon" />}
          <Badge variant="outline" className="text-[10px]">
            {comps.length} properties
          </Badge>
          <Badge variant="neon" className="text-[10px]">
            {selectedComps.length} comps selected
          </Badge>
        </div>
      </div>

      {/* Filters panel */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-glass-border bg-glass/50 text-[11px]">
              <span className="text-muted-foreground font-medium">Match subject on:</span>
              {([
                ["beds", "Beds ±1"],
                ["baths", "Baths ±0.5"],
                ["sqft", "Sqft ±15%"],
                ["yearBuilt", "Year ±10"],
                ["propertyType", "Property Type"],
              ] as [keyof CompFilters, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
                  className={cn(
                    "px-2 py-1 rounded-md border transition-all",
                    filters[key]
                      ? "border-neon/40 bg-neon/10 text-neon"
                      : "border-glass-border bg-secondary/20 text-muted-foreground hover:border-white/20"
                  )}
                >
                  {label}
                  {filters[key] && subject[key === "propertyType" ? "propertyType" : key] != null && (
                    <span className="ml-1 opacity-60">
                      ({key === "propertyType" ? subject.propertyType : subject[key]})
                    </span>
                  )}
                </button>
              ))}
              <Button size="sm" variant="ghost" className="text-[10px] h-6 ml-auto" onClick={fetchComps}>
                Re-search
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map + detail panel side by side */}
      <div className="flex gap-3" style={{ height: 420 }}>
        {/* Leaflet map */}
        <div className="flex-1 rounded-lg overflow-hidden border border-glass-border relative">
          {mapReady ? (
            <MapContainer
              center={[subject.lat, subject.lng]}
              zoom={12}
              style={{ height: "100%", width: "100%", background: "#0a0a14" }}
              ref={(map: LMap | null) => { mapRef.current = map; }}
              zoomControl={true}
              scrollWheelZoom={true}
              dragging={true}
              doubleClickZoom={true}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              />

              {/* Radius circle */}
              <Circle
                center={[subject.lat, subject.lng]}
                radius={radiusMeters}
                pathOptions={{
                  color: "#00ff88",
                  weight: 1.5,
                  opacity: 0.5,
                  fillColor: "#00ff88",
                  fillOpacity: 0.04,
                  dashArray: "6 4",
                }}
              />

              {/* Subject property marker */}
              <CircleMarker
                center={[subject.lat, subject.lng]}
                radius={10}
                pathOptions={{
                  color: "#00ff88",
                  weight: 3,
                  fillColor: "#00ff88",
                  fillOpacity: 0.9,
                }}
              >
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -12]}
                  className="!bg-transparent !border-0 !shadow-none !p-0"
                >
                  <div className="bg-glass border border-neon/40 rounded px-2 py-0.5 text-[10px] text-neon font-bold backdrop-blur-sm whitespace-nowrap">
                    ★ SUBJECT
                  </div>
                </Tooltip>
              </CircleMarker>

              {/* Comp markers */}
              {comps.map((comp) => {
                if (!comp.lat || !comp.lng) return null;
                const quality = classifyComp(comp, subject);
                const colors = QUALITY_COLORS[quality];
                const isSelected = selectedApns.has(comp.apn);

                return (
                  <CircleMarker
                    key={comp.apn + comp.radarId}
                    center={[comp.lat, comp.lng]}
                    radius={isSelected ? 8 : 6}
                    pathOptions={{
                      color: isSelected ? "#00ff88" : colors.stroke,
                      weight: isSelected ? 3 : 1.5,
                      fillColor: isSelected ? "#00ff88" : colors.fill,
                      fillOpacity: isSelected ? 1 : 0.7,
                    }}
                    eventHandlers={{
                      click: () => setSelectedComp(comp),
                    }}
                  >
                    <Tooltip
                      direction="top"
                      offset={[0, -8]}
                      className="!bg-transparent !border-0 !shadow-none !p-0"
                    >
                      <div className="bg-glass border border-glass-border rounded px-1.5 py-0.5 text-[9px] backdrop-blur-sm whitespace-nowrap max-w-[200px] truncate">
                        {comp.streetAddress} — {comp.avm ? formatCurrency(comp.avm) : "N/A"}
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}

            </MapContainer>
          ) : (
            <Skeleton className="h-full w-full" />
          )}

          {/* Map legend overlay */}
          <div className="absolute bottom-2 left-2 z-[1000] flex gap-1.5 pointer-events-none">
            {Object.entries(QUALITY_COLORS).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1 bg-glass/80 backdrop-blur-sm border border-glass-border rounded px-1.5 py-0.5 text-[8px]">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: val.fill }} />
                {val.label}
              </div>
            ))}
          </div>
        </div>

        {/* Detail side panel */}
        <AnimatePresence mode="wait">
          {selectedComp ? (
            <motion.div
              key={selectedComp.apn}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-[280px] shrink-0 rounded-lg border border-glass-border bg-glass/50 backdrop-blur-xl overflow-y-auto"
            >
              <CompDetailPanel
                comp={selectedComp}
                subject={subject}
                isSelected={selectedApns.has(selectedComp.apn)}
                onAdd={() => onAddComp(selectedComp)}
                onRemove={() => onRemoveComp(selectedComp.apn)}
                onClose={() => setSelectedComp(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-[280px] shrink-0 rounded-lg border border-glass-border bg-glass/50 backdrop-blur-xl flex items-center justify-center"
            >
              <div className="text-center p-4">
                <Eye className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  Click any marker on the map to view property details
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Comp detail panel ─────────────────────────────────────────────────

function CompDetailPanel({
  comp, subject, isSelected, onAdd, onRemove, onClose,
}: {
  comp: CompProperty;
  subject: SubjectProperty;
  isSelected: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const quality = classifyComp(comp, subject);
  const colors = QUALITY_COLORS[quality];

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ textShadow: "0 0 8px rgba(0,255,136,0.12)" }}>
            {comp.streetAddress || comp.address}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {comp.city}, {comp.state} {comp.zip}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary/40 shrink-0">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Quality badge */}
      <div className="flex items-center gap-2">
        <Badge
          className="text-[9px] gap-1"
          style={{
            backgroundColor: `${colors.fill}15`,
            borderColor: `${colors.fill}40`,
            color: colors.fill,
          }}
        >
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.fill }} />
          {colors.label}
        </Badge>
        {comp.isRecentSale && (
          <Badge variant="outline" className="text-[9px] gap-0.5 text-blue-400 border-blue-400/30">
            Recent Sale
          </Badge>
        )}
        {comp.isListedForSale && (
          <Badge variant="outline" className="text-[9px] gap-0.5 text-purple-400 border-purple-400/30">
            Listed
          </Badge>
        )}
      </div>

      {/* Key stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox icon={Home} label="Beds" value={comp.beds != null ? String(comp.beds) : "—"} match={subject.beds != null && comp.beds != null && Math.abs(comp.beds - subject.beds) <= 1} />
        <StatBox icon={Home} label="Baths" value={comp.baths != null ? String(comp.baths) : "—"} match={subject.baths != null && comp.baths != null && Math.abs(comp.baths - subject.baths) <= 0.5} />
        <StatBox icon={Ruler} label="Sqft" value={comp.sqft ? comp.sqft.toLocaleString() : "—"} match={subject.sqft != null && comp.sqft != null && Math.abs(comp.sqft - subject.sqft) / subject.sqft <= 0.15} />
        <StatBox icon={Calendar} label="Year" value={comp.yearBuilt ? String(comp.yearBuilt) : "—"} match={subject.yearBuilt != null && comp.yearBuilt != null && Math.abs(comp.yearBuilt - subject.yearBuilt) <= 10} />
      </div>

      {/* Financials */}
      <div className="space-y-1.5 p-2 rounded-md border border-glass-border bg-secondary/10">
        <div className="flex justify-between">
          <span className="text-muted-foreground">AVM / ARV</span>
          <span className="font-semibold text-neon">{comp.avm ? formatCurrency(comp.avm) : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Sale</span>
          <span className="font-medium">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "—"}</span>
        </div>
        {comp.lastSaleDate && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sale Date</span>
            <span className="font-medium">{new Date(comp.lastSaleDate).toLocaleDateString()}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Equity</span>
          <span className="font-medium">{comp.equityPercent != null ? `${comp.equityPercent}%` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Assessed</span>
          <span className="font-medium">{comp.assessedValue ? formatCurrency(comp.assessedValue) : "—"}</span>
        </div>
      </div>

      {/* Property details */}
      <div className="space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Type</span>
          <span>{comp.propertyType ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Lot Size</span>
          <span>{comp.lotSize ? `${comp.lotSize.toLocaleString()} sqft` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Owner</span>
          <span className="truncate ml-2">{comp.owner}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">County</span>
          <span>{comp.county}</span>
        </div>
      </div>

      {/* Owner flags */}
      {(comp.isVacant || comp.isAbsentee || comp.isFreeAndClear || comp.isForeclosure || comp.isTaxDelinquent) && (
        <div className="flex flex-wrap gap-1">
          {comp.isVacant && <MicroBadge text="Vacant" color="text-purple-400" />}
          {comp.isAbsentee && <MicroBadge text="Absentee" color="text-blue-400" />}
          {comp.isFreeAndClear && <MicroBadge text="Free & Clear" color="text-green-400" />}
          {comp.isForeclosure && <MicroBadge text="Foreclosure" color="text-red-400" />}
          {comp.isTaxDelinquent && <MicroBadge text="Tax Delinquent" color="text-amber-400" />}
        </div>
      )}

      {/* Action button */}
      {isSelected ? (
        <Button variant="outline" size="sm" className="w-full text-[11px] gap-1.5 text-red-400 border-red-400/30 hover:bg-red-500/10" onClick={onRemove}>
          <X className="h-3 w-3" />
          Remove Comp
        </Button>
      ) : (
        <Button variant="neon" size="sm" className="w-full text-[11px] gap-1.5" onClick={onAdd}>
          <Plus className="h-3 w-3" />
          Add as Comp
        </Button>
      )}
    </div>
  );
}

function StatBox({ icon: Icon, label, value, match }: {
  icon: typeof Home; label: string; value: string; match: boolean;
}) {
  return (
    <div className={cn(
      "p-1.5 rounded-md border text-center",
      match ? "border-neon/30 bg-neon/5" : "border-glass-border bg-secondary/10"
    )}>
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", match && "text-neon")}>{value}</p>
    </div>
  );
}

function MicroBadge({ text, color }: { text: string; color: string }) {
  return (
    <span className={cn("text-[8px] px-1.5 py-0.5 rounded border border-glass-border bg-secondary/20", color)}>
      {text}
    </span>
  );
}
