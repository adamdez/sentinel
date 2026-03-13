"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, DollarSign, Calendar, Ruler, Plus, X,
  Loader2, Filter, TrendingUp, Eye, MapPin,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
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

export interface CompSaleHistoryEntry {
  saleAmount: number;
  saleDate: string | null;
  buyer?: string | null;
  seller?: string | null;
  docType?: string | null;
  pricePerSqft?: number | null;
}

export interface CompAssessmentEntry {
  year: number;
  assessedValue: number;
  marketValue?: number | null;
  taxAmount?: number | null;
}

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
  photoUrl?: string | null;
  streetViewUrl?: string | null;
  // ── Enhanced ATTOM data (populated by /api/comps/enrich) ──
  saleHistory?: CompSaleHistoryEntry[] | null;
  assessmentHistory?: CompAssessmentEntry[] | null;
  avmTrend?: { date: string; value: number }[] | null;
  rentalAvm?: number | null;
  rentalAvmHigh?: number | null;
  rentalAvmLow?: number | null;
  pricePerSqft?: number | null;
  // County ArcGIS comp data
  countySales?: { date: string; price: number; year: number }[] | null;
  source?: string;
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
  radarId?: string | null;
  zip?: string | null;
  county?: string | null;
  state?: string | null;
}

interface CompsMapProps {
  subject: SubjectProperty;
  selectedComps: CompProperty[];
  onAddComp: (comp: CompProperty) => void;
  onRemoveComp: (apn: string) => void;
  focusedComp?: CompProperty | null;
}

interface CompFilters {
  beds: boolean;
  baths: boolean;
  sqft: boolean;
  yearBuilt: boolean;
  propertyType: boolean;
}

// ── 5-Minute Result Cache (module-level, survives re-renders) ────────

const CACHE_TTL = 5 * 60 * 1000;
const compsCache = new Map<string, { comps: CompProperty[]; ts: number }>();

function makeCacheKey(
  lat: number, lng: number, radius: number,
  filters: CompFilters, subject: SubjectProperty,
): string {
  return JSON.stringify({
    la: lat.toFixed(4), lo: lng.toFixed(4), r: radius,
    f: filters,
    b: subject.beds, ba: subject.baths, sq: subject.sqft,
    yb: subject.yearBuilt, pt: subject.propertyType,
    rid: subject.radarId ?? null,
  });
}

function getCached(key: string): CompProperty[] | null {
  const entry = compsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    compsCache.delete(key);
    return null;
  }
  return entry.comps;
}

function setCache(key: string, comps: CompProperty[]) {
  compsCache.set(key, { comps, ts: Date.now() });
  if (compsCache.size > 30) {
    const oldest = [...compsCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) compsCache.delete(oldest[0]);
  }
}

// ── Haversine distance (miles) ───────────────────────────────────────

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Comp quality classification ───────────────────────────────────────

export interface CompScore {
  total: number;
  distance: number;
  recency: number;
  size: number;
  bedBath: number;
  year: number;
  label: "good" | "marginal" | "outlier";
}

export function scoreComp(comp: CompProperty, subject: SubjectProperty): CompScore {
  const W = { distance: 30, recency: 25, size: 20, bedBath: 15, year: 10 };

  // Distance (30 pts): 0 mi = 30, 1 mi = 20, 3+ mi = 0
  let distPts = 0;
  if (comp.lat && comp.lng) {
    const dist = haversine(subject.lat, subject.lng, comp.lat, comp.lng);
    distPts = dist <= 0.25 ? W.distance : dist >= 3 ? 0 : Math.round(W.distance * (1 - (dist / 3)));
  }

  // Recency (25 pts): sold today = 25, 6mo = 15, 12mo = 5, 18+mo = 0
  let recPts = 0;
  if (comp.lastSaleDate) {
    const daysAgo = Math.max(0, (Date.now() - new Date(comp.lastSaleDate).getTime()) / 86400000);
    recPts = daysAgo <= 90 ? W.recency : daysAgo >= 540 ? 0 : Math.round(W.recency * (1 - daysAgo / 540));
  }

  // Size (20 pts): within 5% = 20, 20%+ diff = 0
  let sizePts = 0;
  if (subject.sqft && comp.sqft && subject.sqft > 0) {
    const pctDiff = Math.abs(comp.sqft - subject.sqft) / subject.sqft;
    sizePts = pctDiff <= 0.05 ? W.size : pctDiff >= 0.25 ? 0 : Math.round(W.size * (1 - pctDiff / 0.25));
  } else {
    sizePts = Math.round(W.size * 0.3);
  }

  // Bed/Bath (15 pts): exact = 15, ±1 = 10, ±2 = 3, ±3+ = 0
  let bbPts = 0;
  let bbChecks = 0;
  if (subject.beds != null && comp.beds != null) {
    bbChecks++;
    const diff = Math.abs(comp.beds - subject.beds);
    bbPts += diff === 0 ? W.bedBath / 2 : diff === 1 ? (W.bedBath / 2) * 0.66 : diff === 2 ? (W.bedBath / 2) * 0.2 : 0;
  }
  if (subject.baths != null && comp.baths != null) {
    bbChecks++;
    const diff = Math.abs(comp.baths - subject.baths);
    bbPts += diff <= 0.5 ? W.bedBath / 2 : diff <= 1 ? (W.bedBath / 2) * 0.66 : diff <= 2 ? (W.bedBath / 2) * 0.2 : 0;
  }
  if (bbChecks === 0) bbPts = Math.round(W.bedBath * 0.3);
  bbPts = Math.round(bbPts);

  // Year built (10 pts): within 5yr = 10, 15yr = 5, 30+ = 0
  let yrPts = 0;
  if (subject.yearBuilt != null && comp.yearBuilt != null) {
    const diff = Math.abs(comp.yearBuilt - subject.yearBuilt);
    yrPts = diff <= 5 ? W.year : diff >= 30 ? 0 : Math.round(W.year * (1 - diff / 30));
  } else {
    yrPts = Math.round(W.year * 0.3);
  }

  const total = distPts + recPts + sizePts + bbPts + yrPts;
  const label: CompScore["label"] = total >= 55 ? "good" : total >= 30 ? "marginal" : "outlier";

  return { total, distance: distPts, recency: recPts, size: sizePts, bedBath: bbPts, year: yrPts, label };
}

function classifyComp(comp: CompProperty, subject: SubjectProperty): "good" | "marginal" | "outlier" {
  return scoreComp(comp, subject).label;
}

/** Translate numeric comp score into operator-friendly label */
export function getCompQualityLabel(score: number, isDistressed?: boolean): "Strong" | "Usable" | "Weak" {
  if (isDistressed) {
    // Foreclosure/tax-delinquent comps capped at Usable — not arm's-length sales
    if (score >= 30) return "Usable";
    return "Weak";
  }
  if (score >= 55) return "Strong";
  if (score >= 30) return "Usable";
  return "Weak";
}

/** Generate a one-line rationale explaining why this comp was selected */
export function getCompRationale(
  compScore: CompScore,
  comp: CompProperty,
  subject: SubjectProperty,
): string {
  const { distance, recency, size, bedBath, year, total } = compScore;

  // Identify the strongest and weakest dimensions (by % of max)
  const dims = [
    { name: "distance", pct: distance / 30, label: "nearby match" },
    { name: "recency", pct: recency / 25, label: "recent sale" },
    { name: "size", pct: size / 20, label: "size match" },
    { name: "bedBath", pct: bedBath / 15, label: "bed/bath match" },
    { name: "year", pct: year / 10, label: "age match" },
  ];
  const sorted = [...dims].sort((a, b) => b.pct - a.pct);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  // Sale age for staleness warning
  const saleMonthsAgo = comp.lastSaleDate
    ? Math.round((Date.now() - new Date(comp.lastSaleDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    : null;

  // Borderline comp (30-40 score)
  if (total >= 30 && total < 40) {
    return `Borderline — weak ${weakest.label}`;
  }

  // Good match but old sale
  if (total >= 55 && saleMonthsAgo != null && saleMonthsAgo > 12) {
    return `Good match but ${saleMonthsAgo}mo old sale`;
  }

  // Top dimension determines the rationale
  if (strongest.name === "distance" && distance >= 24) return "Best nearby match";
  if (strongest.name === "recency" && recency >= 20) return "Most recent sale";
  if (strongest.name === "size" && size >= 16) return "Closest size match";

  // High overall score
  if (total >= 70) return "Strongest overall match";
  if (total >= 55) return "Strong comparable";

  // Usable but not strong
  if (total >= 40) return `Usable — best ${strongest.label}`;

  // Weak
  return `Weak — ${weakest.label} lacking`;
}

const QUALITY_COLORS = {
  good: { fill: "#00d4ff", stroke: "#00a8cc", label: "Good Comp" },
  marginal: { fill: "#facc15", stroke: "#ca8a04", label: "Marginal" },
  outlier: { fill: "#f87171", stroke: "#dc2626", label: "Outlier" },
};

export function getSatelliteTileUrl(lat: number, lng: number, zoom = 18): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
}

export function getGoogleStreetViewLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/@${lat},${lng},3a,75y,0h,90t/data=!3m4!1e1!3m2!1s!2e0`;
}

const NO_FILTERS: CompFilters = { beds: false, baths: false, sqft: false, yearBuilt: false, propertyType: false };

// ── Main Component ────────────────────────────────────────────────────

export function CompsMap({ subject, selectedComps, onAddComp, onRemoveComp, focusedComp }: CompsMapProps) {
  const [comps, setComps] = useState<CompProperty[]>([]);
  const [loading, setLoading] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(1);
  const [searchRadius, setSearchRadius] = useState(1);
  const [selectedComp, setSelectedComp] = useState<CompProperty | null>(null);
  const [showSubject, setShowSubject] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [filters, setFilters] = useState<CompFilters>(NO_FILTERS);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<LMap | null>(null);
  const fetchIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync focusedComp from parent (e.g. clicking a row in the Selected Comps table)
  useEffect(() => {
    if (focusedComp) {
      setSelectedComp(focusedComp);
      setShowSubject(false);
    }
  }, [focusedComp]);

  const selectedApns = useMemo(
    () => new Set(selectedComps.map((c) => c.apn)),
    [selectedComps]
  );

  // Debounce radius slider → actual search radius (400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchRadius(radiusMiles), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [radiusMiles]);

  // Core fetch with cache
  const doFetch = useCallback(async (
    overrideFilters?: CompFilters,
  ): Promise<CompProperty[]> => {
    const f = overrideFilters ?? filters;
    const key = makeCacheKey(subject.lat, subject.lng, searchRadius, f, subject);

    const cached = getCached(key);
    if (cached) return cached;

    // Get auth token for the API call
    const { data: { session } } = await supabase.auth.getSession();
    const fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
      fetchHeaders["Authorization"] = `Bearer ${session.access_token}`;
    }

    const res = await fetch("/api/comps/search", {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify({
        radarId: subject.radarId || undefined,
        lat: subject.lat,
        lng: subject.lng,
        zip: subject.zip || undefined,
        county: subject.county || undefined,
        state: subject.state || undefined,
        radiusMiles: searchRadius,
        beds: f.beds ? subject.beds : undefined,
        baths: f.baths ? subject.baths : undefined,
        sqft: f.sqft ? subject.sqft : undefined,
        yearBuilt: f.yearBuilt ? subject.yearBuilt : undefined,
        propertyType: f.propertyType ? subject.propertyType : undefined,
        limit: 100,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error("[CompsMap] API error:", res.status, data.error ?? data);
      toast.error(`Comps search failed: ${data.error ?? `HTTP ${res.status}`}`);
      return [];
    }

    if (data.success) {
      const results = (data.comps as CompProperty[]).filter((c) => c.lat != null && c.lng != null);
      setCache(key, results);
      return results;
    }
    return [];
  }, [subject.lat, subject.lng, subject.beds, subject.baths, subject.sqft, subject.yearBuilt, subject.propertyType, searchRadius, filters]);

  const fetchComps = useCallback(async () => {
    fetchIdRef.current++;
    const thisId = fetchIdRef.current;
    setLoading(true);

    try {
      let results = await doFetch();
      if (thisId !== fetchIdRef.current) return;

      const anyFilterActive = Object.values(filters).some(Boolean);
      if (results.length === 0 && anyFilterActive) {
        results = await doFetch(NO_FILTERS);
        if (thisId !== fetchIdRef.current) return;
        if (results.length > 0) {
          toast.info("Showing all properties — filters loosened");
        }
      }

      setComps(results);
    } catch (err) {
      console.error("[CompsMap] Fetch error:", err);
      toast.error("Failed to search for comparable properties");
    } finally {
      if (thisId === fetchIdRef.current) setLoading(false);
    }
  }, [doFetch, filters]);

  useEffect(() => {
    if (subject.lat && subject.lng) fetchComps();
  }, [fetchComps, subject.lat, subject.lng]);

  useEffect(() => {
    if (typeof window !== "undefined") setMapReady(true);
  }, []);

  const radiusMeters = radiusMiles * 1609.34;

  // ── Client-side post-filtering (makes filters work with Strategy 1 comps/sales) ──
  const filteredComps = useMemo(() => {
    let result = comps;

    // Radius filter — always active based on slider
    if (subject.lat && subject.lng) {
      result = result.filter((c) => {
        if (!c.lat || !c.lng) return true;
        return haversine(subject.lat, subject.lng, c.lat, c.lng) <= radiusMiles;
      });
    }

    // "Match subject on" filters — only when toggled ON and subject has data
    if (filters.beds && subject.beds != null) {
      result = result.filter((c) => c.beds != null && Math.abs(c.beds - subject.beds!) <= 1);
    }
    if (filters.baths && subject.baths != null) {
      result = result.filter((c) => c.baths != null && Math.abs(c.baths - subject.baths!) <= 0.5);
    }
    if (filters.sqft && subject.sqft != null && subject.sqft > 0) {
      result = result.filter((c) => c.sqft != null && Math.abs(c.sqft - subject.sqft!) / subject.sqft! <= 0.15);
    }
    if (filters.yearBuilt && subject.yearBuilt != null) {
      result = result.filter((c) => c.yearBuilt != null && Math.abs(c.yearBuilt - subject.yearBuilt!) <= 10);
    }
    if (filters.propertyType && subject.propertyType) {
      result = result.filter((c) => c.propertyType === subject.propertyType);
    }

    return result;
  }, [comps, filters, subject, radiusMiles]);

  // Info toast when post-filtering eliminates all results
  const prevFilteredLen = useRef(filteredComps.length);
  useEffect(() => {
    const anyFilterActive = Object.values(filters).some(Boolean);
    if (comps.length > 0 && filteredComps.length === 0 && anyFilterActive && prevFilteredLen.current > 0) {
      toast.info(`Filters eliminated all ${comps.length} results — try loosening filters`);
    }
    prevFilteredLen.current = filteredComps.length;
  }, [filteredComps.length, comps.length, filters]);

  // Sort comps: good first, then marginal, then outlier — cap visible markers
  const MAX_MARKERS = 80;
  const scoredComps = useMemo(() => {
    return filteredComps.map((c) => ({ comp: c, score: scoreComp(c, subject) }));
  }, [filteredComps, subject]);

  const sortedComps = useMemo(() => {
    return [...scoredComps]
      .sort((a, b) => b.score.total - a.score.total)
      .map((s) => s.comp);
  }, [scoredComps]);

  // Auto-suggest top 3 comps on first load when none are selected
  const autoSuggestedRef = useRef(false);
  useEffect(() => {
    if (autoSuggestedRef.current || selectedComps.length > 0 || scoredComps.length === 0) return;
    autoSuggestedRef.current = true;

    const top3 = [...scoredComps]
      .sort((a, b) => b.score.total - a.score.total)
      .filter((s) => s.score.total >= 50 && (s.comp.lastSalePrice ?? s.comp.avm ?? 0) > 0)
      .slice(0, 3);

    if (top3.length > 0) {
      top3.forEach((s) => onAddComp(s.comp));
      toast.success(`Auto-selected ${top3.length} best comp${top3.length > 1 ? "s" : ""}`);
    }
  }, [scoredComps, selectedComps.length, onAddComp]);

  const visibleComps = useMemo(
    () => sortedComps.slice(0, MAX_MARKERS),
    [sortedComps]
  );
  const hiddenCount = Math.max(0, filteredComps.length - MAX_MARKERS);

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
              className="w-24 h-1 accent-[#00d4ff] bg-secondary rounded-full"
            />
            <span className="font-mono text-cyan font-semibold w-10">{radiusMiles}mi</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-cyan" />}
          <Badge variant="outline" className="text-[10px]">
            {filteredComps.length}{filteredComps.length !== comps.length ? `/${comps.length}` : ""} properties{hiddenCount > 0 && ` (${MAX_MARKERS} shown)`}
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
            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-[12px] border border-glass-border bg-glass/50 text-[11px]">
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
                      ? "border-cyan/20 bg-cyan/8 text-cyan"
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
              <Button size="sm" variant="ghost" className="text-[10px] h-6 ml-auto gap-1" onClick={fetchComps}>
                <RotateCcw className="h-2.5 w-2.5" />
                Re-search
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map + detail panel side by side */}
      <div className="flex gap-3" style={{ height: 440 }}>
        {/* Leaflet map */}
        <div className="flex-1 rounded-[10px] overflow-hidden border border-white/[0.06] relative">
          {mapReady ? (
            <MapContainer
              center={[subject.lat, subject.lng]}
              zoom={15}
              style={{ height: "100%", width: "100%", background: "#0a0a14" }}
              ref={(map: LMap | null) => { mapRef.current = map; }}
              zoomControl={true}
              scrollWheelZoom={true}
              dragging={true}
              doubleClickZoom={true}
              preferCanvas={true}
            >
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='&copy; Esri, Maxar, Earthstar Geographics'
                updateWhenIdle={false}
                updateWhenZooming={false}
                keepBuffer={6}
                maxZoom={19}
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                attribution=""
                updateWhenIdle={false}
                updateWhenZooming={false}
                keepBuffer={6}
                maxZoom={19}
              />

              {/* Radius circle */}
              <Circle
                center={[subject.lat, subject.lng]}
                radius={radiusMeters}
                pathOptions={{
                  color: "#00d4ff",
                  weight: 1.5,
                  opacity: 0.5,
                  fillColor: "#00d4ff",
                  fillOpacity: 0.04,
                  dashArray: "6 4",
                }}
              />

              {/* Subject property marker — clickable */}
              <CircleMarker
                center={[subject.lat, subject.lng]}
                radius={10}
                pathOptions={{
                  color: "#00d4ff",
                  weight: 3,
                  fillColor: "#00d4ff",
                  fillOpacity: 0.9,
                }}
                eventHandlers={{
                  click: () => { setSelectedComp(null); setShowSubject(true); },
                }}
              >
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -12]}
                  className="!bg-transparent !border-0 !shadow-none !p-0"
                >
                  <div className="bg-glass border border-cyan/20 rounded px-2 py-0.5 text-[10px] text-cyan font-bold backdrop-blur-sm whitespace-nowrap cursor-pointer">
                    ★ SUBJECT
                  </div>
                </Tooltip>
              </CircleMarker>

              {/* Comp markers (capped for performance) */}
              {visibleComps.map((comp) => {
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
color: isSelected ? "#00d4ff" : colors.stroke,
                    weight: isSelected ? 3 : 1.5,
                    fillColor: isSelected ? "#00d4ff" : colors.fill,
                      fillOpacity: isSelected ? 1 : 0.7,
                    }}
                    eventHandlers={{
                      click: () => { setShowSubject(false); setSelectedComp(comp); },
                    }}
                  >
                    <Tooltip
                      direction="top"
                      offset={[0, -8]}
                      className="!bg-transparent !border-0 !shadow-none !p-0"
                    >
                      <div className="bg-[rgba(12,12,22,0.4)] border border-white/[0.06] rounded px-1.5 py-0.5 text-[9px] backdrop-blur-sm whitespace-nowrap max-w-[200px] truncate">
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

          {/* Loading overlay */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[1000] bg-black/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
              >
                <div className="flex items-center gap-2 bg-[rgba(12,12,22,0.9)] border border-white/[0.06] rounded-[10px] px-3 py-2 backdrop-blur-xl">
                  <Loader2 className="h-4 w-4 animate-spin text-neon" />
                  <span className="text-xs text-neon font-medium">Searching radius…</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Map legend overlay */}
          <div className="absolute bottom-2 left-2 z-[1000] flex gap-1.5 pointer-events-none">
            {Object.entries(QUALITY_COLORS).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1 bg-[rgba(12,12,22,0.8)] backdrop-blur-sm border border-white/[0.06] rounded px-1.5 py-0.5 text-[8px]">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: val.fill }} />
                {val.label}
              </div>
            ))}
          </div>

          {/* Cached indicator */}
          {!loading && comps.length > 0 && (
            <div className="absolute top-2 right-2 z-[1000] pointer-events-none">
              <div className="bg-[rgba(12,12,22,0.7)] backdrop-blur-sm border border-white/[0.06] rounded px-1.5 py-0.5 text-[8px] text-muted-foreground">
                {comps.length} results • 5m cache
              </div>
            </div>
          )}
        </div>

        {/* Detail side panel */}
        <AnimatePresence mode="wait">
          {selectedComp ? (
            <motion.div
              key={selectedComp.apn}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
              className="w-[290px] shrink-0 rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] backdrop-blur-xl overflow-y-auto scrollbar-none"
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
          ) : showSubject ? (
            <motion.div
              key="subject-detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.15 }}
              className="w-[290px] shrink-0 rounded-[10px] border border-cyan/20 bg-[rgba(12,12,22,0.5)] backdrop-blur-xl overflow-y-auto scrollbar-none"
            >
              <SubjectDetailPanel subject={subject} onClose={() => setShowSubject(false)} />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-[290px] shrink-0 rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] backdrop-blur-xl flex items-center justify-center"
            >
              <div className="text-center p-4">
                <Eye className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  Click any marker on the map to view property details
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">
                  All properties in {radiusMiles}mi radius are clickable
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Comp detail panel (enhanced with distance, $/sqft, distress) ─────

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
  const compScore = scoreComp(comp, subject);
  const colors = QUALITY_COLORS[compScore.label];
  const distance = comp.lat && comp.lng
    ? haversine(subject.lat, subject.lng, comp.lat, comp.lng)
    : null;
  const salePrice = comp.lastSalePrice ?? comp.avm ?? 0;
  const pricePerSqft = salePrice > 0 && comp.sqft ? Math.round(salePrice / comp.sqft) : null;
  const subjectPpsf = subject.avm && subject.sqft ? Math.round(subject.avm / subject.sqft) : null;

  const zillowUrl = comp.streetAddress && comp.city && comp.state
    ? `https://www.zillow.com/homes/${encodeURIComponent(comp.streetAddress + " " + comp.city + " " + comp.state)}`
    : null;
  const redfinUrl = comp.streetAddress && comp.city && comp.state
    ? `https://www.redfin.com/search#query=${encodeURIComponent(comp.streetAddress + " " + comp.city + " " + comp.state)}`
    : null;

  const distressSignals: { label: string; color: string }[] = [];
  if (comp.isForeclosure) distressSignals.push({ label: "Foreclosure", color: "text-red-400 border-red-400/30 bg-red-500/10" });
  if (comp.isTaxDelinquent) distressSignals.push({ label: "Tax Delinquent", color: "text-amber-400 border-amber-400/30 bg-amber-500/10" });
  if (comp.isVacant) distressSignals.push({ label: "Vacant", color: "text-purple-400 border-purple-400/30 bg-purple-500/10" });
  if (comp.isAbsentee) distressSignals.push({ label: "Absentee", color: "text-blue-400 border-blue-400/30 bg-blue-500/10" });
  if (comp.isFreeAndClear) distressSignals.push({ label: "Free & Clear", color: "text-green-400 border-green-400/30 bg-green-500/10" });
  if (comp.isHighEquity) distressSignals.push({ label: "High Equity", color: "text-neon border-cyan/20 bg-cyan/[0.08]" });

  const photoSrc = comp.photoUrl
    ?? comp.streetViewUrl
    ?? (comp.lat && comp.lng ? getSatelliteTileUrl(comp.lat, comp.lng) : null);
  const streetViewLink = comp.lat && comp.lng
    ? getGoogleStreetViewLink(comp.lat, comp.lng)
    : null;

  return (
    <div className="space-y-3 text-xs">
      {/* Property photo / satellite thumbnail */}
      {photoSrc && (
        <div className="relative w-full h-[120px] overflow-hidden rounded-t-[10px] bg-black/40">
          <img
            src={photoSrc}
            alt={comp.streetAddress || "Property"}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              if (comp.lat && comp.lng && !target.dataset.fallback) {
                target.dataset.fallback = "1";
                target.src = getSatelliteTileUrl(comp.lat, comp.lng, 17);
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(12,12,22,0.8)] to-transparent" />
          {comp.lastSalePrice && (
            <div className="absolute bottom-1.5 left-2 text-[11px] font-bold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>
              Sold {formatCurrency(comp.lastSalePrice)}
              {comp.lastSaleDate && (
                <span className="font-normal text-white/70 ml-1">
                  {new Date(comp.lastSaleDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          )}
          {streetViewLink && (
            <a
              href={streetViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-1.5 right-1.5 bg-black/50 backdrop-blur-sm border border-white/10 rounded px-1.5 py-0.5 text-[8px] text-white/80 hover:text-white hover:bg-black/70 transition-colors flex items-center gap-1"
            >
              <Eye className="h-2.5 w-2.5" />
              Street View
            </a>
          )}
        </div>
      )}

      <div className="px-3 pb-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ textShadow: "0 0 8px rgba(0,212,255,0.12)" }}>
            {comp.streetAddress || comp.address}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {comp.city}, {comp.state} {comp.zip}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.08] shrink-0">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Quality score + distance + badges row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          className="text-[9px] gap-1"
          style={{
            backgroundColor: `${colors.fill}15`,
            borderColor: `${colors.fill}40`,
            color: colors.fill,
          }}
        >
          <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.fill }} />
          {getCompQualityLabel(compScore.total, comp.isForeclosure || comp.isTaxDelinquent)} &middot; {compScore.total}/100
        </Badge>
        {distance != null && (
          <Badge variant="outline" className="text-[9px] gap-0.5">
            <MapPin className="h-2.5 w-2.5" />
            {distance.toFixed(1)}mi
          </Badge>
        )}
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

      {/* Distress signals (prominent) */}
      {distressSignals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {distressSignals.map((s) => (
            <span key={s.label} className={cn("text-[8px] px-1.5 py-0.5 rounded border font-medium", s.color)}>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Key stats grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <StatBox icon={Home} label="Beds" value={comp.beds != null ? String(comp.beds) : "—"} match={subject.beds != null && comp.beds != null && Math.abs(comp.beds - subject.beds) <= 1} />
        <StatBox icon={Home} label="Baths" value={comp.baths != null ? String(comp.baths) : "—"} match={subject.baths != null && comp.baths != null && Math.abs(comp.baths - subject.baths) <= 0.5} />
        <StatBox icon={Ruler} label="Sqft" value={comp.sqft ? comp.sqft.toLocaleString() : "—"} match={subject.sqft != null && comp.sqft != null && Math.abs(comp.sqft - subject.sqft) / subject.sqft <= 0.15} />
        <StatBox icon={Calendar} label="Year" value={comp.yearBuilt ? String(comp.yearBuilt) : "—"} match={subject.yearBuilt != null && comp.yearBuilt != null && Math.abs(comp.yearBuilt - subject.yearBuilt) <= 10} />
      </div>

      {/* $/sqft comparison */}
      {pricePerSqft != null && (
        <div className="flex items-center justify-between p-1.5 rounded-md border border-white/[0.06] bg-white/[0.04]">
          <span className="text-[10px] text-muted-foreground">$/sqft</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neon">${pricePerSqft}</span>
            {subjectPpsf != null && (
              <span className={cn(
                "text-[9px]",
                pricePerSqft > subjectPpsf ? "text-red-400" : "text-green-400"
              )}>
                vs ${subjectPpsf} subj
              </span>
            )}
          </div>
        </div>
      )}

      {/* Financials */}
      <div className="space-y-1.5 p-2 rounded-md border border-white/[0.06] bg-white/[0.04]">
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
          <span className={cn("font-medium", comp.equityPercent != null && comp.equityPercent >= 50 && "text-neon")}>
            {comp.equityPercent != null ? `${comp.equityPercent}%` : "—"}
          </span>
        </div>
        {comp.availableEquity != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avail. Equity</span>
            <span className="font-medium">{formatCurrency(comp.availableEquity)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Assessed</span>
          <span className="font-medium">{comp.assessedValue ? formatCurrency(comp.assessedValue) : "—"}</span>
        </div>
        {comp.totalLoanBalance != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Loan Bal.</span>
            <span className="font-medium">{formatCurrency(comp.totalLoanBalance)}</span>
          </div>
        )}
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
        {comp.lastSaleType && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sale Type</span>
            <span>{comp.lastSaleType}</span>
          </div>
        )}
      </div>

      {/* Score breakdown */}
      <div className="space-y-1 p-2 rounded-md border border-white/[0.06] bg-white/[0.04]">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Comp Quality Score</p>
        {[
          { label: "Distance", pts: compScore.distance, max: 30 },
          { label: "Recency", pts: compScore.recency, max: 25 },
          { label: "Size", pts: compScore.size, max: 20 },
          { label: "Bed/Bath", pts: compScore.bedBath, max: 15 },
          { label: "Year Built", pts: compScore.year, max: 10 },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground w-14 shrink-0">{row.label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${(row.pts / row.max) * 100}%`, backgroundColor: colors.fill }} />
            </div>
            <span className="text-[9px] font-mono w-8 text-right">{row.pts}/{row.max}</span>
          </div>
        ))}
      </div>

      {/* External research links */}
      <div className="flex gap-1.5">
        {zillowUrl && (
          <a href={zillowUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-center text-[9px] font-medium py-1.5 rounded-md border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-blue-400">
            Zillow
          </a>
        )}
        {redfinUrl && (
          <a href={redfinUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-center text-[9px] font-medium py-1.5 rounded-md border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-red-400">
            Redfin
          </a>
        )}
        {comp.lat && comp.lng && (
          <a href={`https://www.google.com/maps/@${comp.lat},${comp.lng},18z`} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-center text-[9px] font-medium py-1.5 rounded-md border border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] transition-colors text-green-400">
            Google Maps
          </a>
        )}
      </div>

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
    </div>
  );
}

function SubjectDetailPanel({ subject, onClose }: { subject: SubjectProperty; onClose: () => void }) {
  const photoSrc = subject.lat && subject.lng ? getSatelliteTileUrl(subject.lat, subject.lng) : null;
  const ppsqft = subject.avm && subject.sqft ? Math.round(subject.avm / subject.sqft) : null;

  return (
    <div className="space-y-3 text-xs">
      {photoSrc && (
        <div className="relative w-full h-[120px] overflow-hidden rounded-t-[10px] bg-black/40">
          <img src={photoSrc} alt="Subject" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(12,12,22,0.8)] to-transparent" />
          <div className="absolute bottom-1.5 left-2 text-[11px] font-bold text-cyan" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>
            ★ Subject Property
          </div>
        </div>
      )}
      <div className="px-3 pb-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate text-cyan" style={{ textShadow: "0 0 8px rgba(0,212,255,0.2)" }}>
              {subject.address}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.08] shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <StatBox icon={Home} label="Beds" value={subject.beds != null ? String(subject.beds) : "—"} match={false} />
          <StatBox icon={Home} label="Baths" value={subject.baths != null ? String(subject.baths) : "—"} match={false} />
          <StatBox icon={Ruler} label="Sqft" value={subject.sqft ? subject.sqft.toLocaleString() : "—"} match={false} />
          <StatBox icon={Calendar} label="Year" value={subject.yearBuilt ? String(subject.yearBuilt) : "—"} match={false} />
        </div>
        <div className="space-y-1.5 p-2 rounded-md border border-cyan/15 bg-cyan/4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">AVM</span>
            <span className="font-bold text-neon">{subject.avm ? formatCurrency(subject.avm) : "—"}</span>
          </div>
          {ppsqft && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">$/sqft</span>
              <span className="font-semibold text-neon">${ppsqft}</span>
            </div>
          )}
          {subject.propertyType && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>{subject.propertyType}</span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground/60 text-center">This is the subject property — click comp markers to compare</p>
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, match }: {
  icon: typeof Home; label: string; value: string; match: boolean;
}) {
  return (
    <div className={cn(
      "p-1.5 rounded-md border text-center",
      match ? "border-cyan/20 bg-cyan/4" : "border-glass-border bg-secondary/10"
    )}>
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", match && "text-cyan")}>{value}</p>
    </div>
  );
}
