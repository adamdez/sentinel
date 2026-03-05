"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  MapPin,
  User,
  Home,
  DollarSign,
  AlertTriangle,
  Loader2,
  UserPlus,
  Bed,
  Bath,
  Ruler,
  Calendar,
  Building2,
  TrendingDown,
  Shield,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────

interface PropertySignal {
  type: string;
  label: string;
  severity: number;
}

interface PropertyData {
  radarId: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  latitude: number | null;
  longitude: number | null;
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerAge: number | null;
  mailAddress: string | null;
  mailCity: string | null;
  mailState: string | null;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSize: number | null;
  units: number | null;
  estimatedValue: number | null;
  equityPercent: number | null;
  availableEquity: number | null;
  loanBalance: number | null;
  isUnderwater: boolean;
  isFreeAndClear: boolean;
  saleDate: string | null;
  salePrice: number | null;
  lastTransferType: string | null;
  isAbsentee: boolean;
  isVacant: boolean;
  isListed: boolean;
  isOutOfState: boolean;
  signals: PropertySignal[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prRaw: any;
}

// ── Signal styling ─────────────────────────────────────────────────────

const SIGNAL_COLORS: Record<string, string> = {
  pre_foreclosure: "bg-red-500/20 text-red-300 border-red-500/30",
  foreclosure: "bg-red-600/20 text-red-200 border-red-600/30",
  probate: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  tax_lien: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  bankruptcy: "bg-red-500/20 text-red-300 border-red-500/30",
  divorce: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  vacant: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  absentee: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  underwater: "bg-red-500/20 text-red-300 border-red-500/30",
  tired_landlord: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

// ── Currency formatter ─────────────────────────────────────────────────

function fmt(val: number | null | undefined): string {
  if (val == null) return "N/A";
  return "$" + val.toLocaleString();
}

function fmtNum(val: number | null | undefined): string {
  if (val == null) return "N/A";
  return val.toLocaleString();
}

// ── Component ──────────────────────────────────────────────────────────

export function PropertyPreviewModal() {
  const router = useRouter();
  const { currentUser } = useSentinelStore();
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for the custom event from GlobalSearch
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      setProperty(e.detail);
      setOpen(true);
      setClaimed(false);
      setError(null);
    };
    window.addEventListener("open-property-preview", handler);
    return () => window.removeEventListener("open-property-preview", handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      setProperty(null);
      setClaimed(false);
      setError(null);
    }, 200);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close]);

  const handleClaim = async () => {
    if (!property || claiming || claimed) return;
    setClaiming(true);
    setError(null);

    try {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apn: property.apn,
          county: property.county,
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
          owner_name: property.ownerName,
          owner_phone: property.ownerPhone,
          owner_email: property.ownerEmail,
          estimated_value: property.estimatedValue,
          equity_percent: property.equityPercent,
          property_type: property.propertyType,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          sqft: property.sqft,
          year_built: property.yearBuilt,
          lot_size: property.lotSize,
          distress_tags: property.signals.map((s) => s.type),
          source: "property_lookup",
          assign_to: currentUser.id || null,
          actor_id: currentUser.id || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }

      setClaimed(true);
      // Navigate to prospects after a brief delay
      setTimeout(() => {
        close();
        router.push("/sales-funnel/prospects");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim lead");
    } finally {
      setClaiming(false);
    }
  };

  if (!open || !property) return null;

  const streetViewUrl = property.latitude && property.longitude
    ? `/api/street-view?lat=${property.latitude}&lng=${property.longitude}&size=800x400`
    : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={close}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl glass-strong border border-glass-border shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header with Street View ────────────────────────────── */}
              <div className="relative">
                {streetViewUrl ? (
                  <div className="relative h-52 overflow-hidden rounded-t-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={streetViewUrl}
                      alt="Street View"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  </div>
                ) : (
                  <div className="h-32 rounded-t-2xl bg-gradient-to-br from-cyan/10 to-purple-500/10 flex items-center justify-center">
                    <Home className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                )}

                {/* Close button */}
                <button
                  onClick={close}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Address overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="flex items-center gap-2 text-white">
                    <MapPin className="h-4 w-4 text-cyan shrink-0" />
                    <h2 className="text-lg font-bold truncate">{property.address}</h2>
                  </div>
                  <p className="text-white/70 text-sm ml-6">
                    {property.city}, {property.state} {property.zip}
                  </p>
                </div>
              </div>

              {/* ── Content ────────────────────────────────────────────── */}
              <div className="p-5 space-y-4">

                {/* MLS Warning */}
                {property.isListed && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>This property has an active MLS listing. Cannot wholesale listed properties.</span>
                  </div>
                )}

                {/* Distress Signals */}
                {property.signals.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {property.signals.map((signal) => (
                      <span
                        key={signal.type}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border",
                          SIGNAL_COLORS[signal.type] ?? "bg-cyan/10 text-cyan border-cyan/20"
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {signal.label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Owner Info */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                    <User className="h-3.5 w-3.5" />
                    Owner
                  </div>
                  <p className="text-base font-semibold">{property.ownerName}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {property.ownerAge && <span>Age: {property.ownerAge}</span>}
                    {property.isAbsentee && (
                      <span className="text-blue-400">
                        Absentee{property.isOutOfState ? " (Out-of-State)" : ""}
                      </span>
                    )}
                    {property.ownerPhone && <span>{property.ownerPhone}</span>}
                  </div>
                </div>

                {/* Property Specs */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                    <Home className="h-3.5 w-3.5" />
                    Property Details
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Stat icon={Bed} label="Beds" value={fmtNum(property.bedrooms)} />
                    <Stat icon={Bath} label="Baths" value={property.bathrooms != null ? String(property.bathrooms) : "N/A"} />
                    <Stat icon={Ruler} label="SqFt" value={fmtNum(property.sqft)} />
                    <Stat icon={Calendar} label="Year Built" value={fmtNum(property.yearBuilt)} />
                    <Stat icon={Building2} label="Type" value={property.propertyType} />
                    <Stat icon={Ruler} label="Lot" value={property.lotSize ? fmtNum(property.lotSize) + " sf" : "N/A"} />
                  </div>
                </div>

                {/* Financials */}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                    <DollarSign className="h-3.5 w-3.5" />
                    Financials
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FinStat label="Est. Value (AVM)" value={fmt(property.estimatedValue)} />
                    <FinStat
                      label="Equity"
                      value={property.equityPercent != null ? `${Math.round(property.equityPercent)}%` : "N/A"}
                      highlight={property.isUnderwater ? "text-red-400" : property.equityPercent && property.equityPercent > 50 ? "text-green-400" : undefined}
                    />
                    <FinStat label="Loan Balance" value={fmt(property.loanBalance)} />
                    <FinStat label="Available Equity" value={fmt(property.availableEquity)} />
                    {property.isFreeAndClear && (
                      <div className="col-span-2 flex items-center gap-2 text-green-400 text-sm">
                        <Shield className="h-3.5 w-3.5" />
                        Free & Clear
                      </div>
                    )}
                    {property.isUnderwater && (
                      <div className="col-span-2 flex items-center gap-2 text-red-400 text-sm">
                        <TrendingDown className="h-3.5 w-3.5" />
                        Underwater — owes more than property is worth
                      </div>
                    )}
                  </div>
                </div>

                {/* Sale History */}
                {(property.saleDate || property.salePrice) && (
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                      <Tag className="h-3.5 w-3.5" />
                      Last Sale
                    </div>
                    <div className="flex gap-4 text-sm">
                      {property.saleDate && <span>Date: {property.saleDate}</span>}
                      {property.salePrice && <span>Price: {fmt(property.salePrice)}</span>}
                      {property.lastTransferType && <span>Type: {property.lastTransferType}</span>}
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="text-sm text-red-400 text-center">{error}</div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={close}
                  >
                    Close
                  </Button>
                  <Button
                    className={cn(
                      "flex-1 gap-2",
                      claimed
                        ? "bg-green-600 hover:bg-green-600 text-white"
                        : property.isListed
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-cyan hover:bg-cyan/90 text-black font-semibold"
                    )}
                    onClick={handleClaim}
                    disabled={claiming || claimed || property.isListed}
                  >
                    {claiming ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Claiming...
                      </>
                    ) : claimed ? (
                      "Claimed!"
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Claim Lead
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Stat({ icon: Icon, label, value }: { icon: typeof Bed; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function FinStat({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", highlight)}>{value}</p>
    </div>
  );
}
