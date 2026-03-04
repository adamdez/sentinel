"use client";

import { Fragment, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, User, Phone, Mail, DollarSign, Home, TrendingUp,
  Calendar, Tag, Shield, Zap, ExternalLink, Clock, AlertTriangle,
  Copy, CheckCircle2, Search, Loader2, Building, Ruler, LandPlot,
  Banknote, Scale, UserX, Eye, FileText, Calculator, Globe, Send,
  Radar, LayoutDashboard, Map, Printer, ImageIcon, ChevronLeft, ChevronRight,
  Pencil, Save, Voicemail, PhoneForwarded, Brain, Crosshair, MapPinned,
  MessageSquare, Flame, Smartphone, ShieldAlert, PhoneOff, Circle,
  RefreshCw, Target, ArrowRight, ChevronDown, Trash2, Lock, Contact2, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import type { ProspectRow } from "@/hooks/use-prospects";
import type { LeadRow } from "@/lib/leads-data";
import type { AIScore, DistressType } from "@/lib/types";
import { SIGNAL_WEIGHTS } from "@/lib/scoring";
import { getSequenceLabel, getSequenceProgress } from "@/lib/call-scheduler";
import { useCallNotes, type CallNote } from "@/hooks/use-call-notes";
import { CompsMap, getSatelliteTileUrl, getGoogleStreetViewLink, type CompProperty, type SubjectProperty } from "@/components/sentinel/comps/comps-map";
import { PredictiveDistressBadge, type PredictiveDistressData } from "@/components/sentinel/predictive-distress-badge";
import { RelationshipBadge } from "@/components/sentinel/relationship-badge";
import { NumericInput } from "@/components/sentinel/numeric-input";
import { usePreCallBrief } from "@/hooks/use-pre-call-brief";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// ═══════════════════════════════════════════════════════════════════════
// ClientFile — single unified shape for every funnel stage
// ═══════════════════════════════════════════════════════════════════════

export interface ClientFile {
  id: string;
  propertyId: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  status: string;
  assignedTo: string | null;
  source: string;
  tags: string[];
  notes: string | null;
  promotedAt: string | null;
  lastContactAt: string | null;
  followUpDate: string | null;
  complianceClean: boolean;
  compositeScore: number;
  motivationScore: number;
  dealScore: number;
  scoreLabel: AIScore["label"];
  aiBoost: number;
  factors: unknown[];
  modelVersion: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  lotSize: number | null;
  estimatedValue: number | null;
  equityPercent: number | null;
  availableEquity: number | null;
  totalLoanBalance: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  foreclosureStage: string | null;
  defaultAmount: number | null;
  delinquentAmount: number | null;
  isVacant: boolean;
  isAbsentee: boolean;
  isFreeClear: boolean;
  isHighEquity: boolean;
  isCashBuyer: boolean;
  ownerFlags: Record<string, unknown>;
  radarId: string | null;
  enriched: boolean;
  lockVersion?: number;
  nextCallScheduledAt: string | null;
  callSequenceStep: number;
  totalCalls: number;
  liveAnswers: number;
  voicemailsLeft: number;
  prediction?: {
    predictiveScore: number;
    daysUntilDistress: number;
    confidence: number;
    label: "imminent" | "likely" | "possible" | "unlikely";
    ownerAgeInference: number | null;
    equityBurnRate: number | null;
    lifeEventProbability: number | null;
  } | null;
}

// ═══════════════════════════════════════════════════════════════════════
// Adapters
// ═══════════════════════════════════════════════════════════════════════

function buildAddress(...parts: (string | null | undefined)[]) {
  const filtered = parts.filter((p): p is string => !!p);
  if (filtered.length <= 1) return filtered[0] ?? "";
  const [street, ...rest] = filtered;
  const sl = street.toLowerCase();
  const unique = rest.filter((p) => !sl.includes(p.toLowerCase()));
  return [street, ...unique].join(", ");
}

export function clientFileFromProspect(p: ProspectRow): ClientFile {
  return {
    id: p.id, propertyId: p.property_id, apn: p.apn,
    county: (p.owner_flags?.inferred_county as string) || p.county,
    address: p.address, city: p.city, state: p.state, zip: p.zip,
    fullAddress: buildAddress(p.address, p.city, p.state, p.zip),
    ownerName: p.owner_name, ownerPhone: p.owner_phone, ownerEmail: p.owner_email,
    status: p.status, assignedTo: p.assigned_to, source: p.source,
    tags: p.tags, notes: p.notes, promotedAt: p.promoted_at,
    lastContactAt: null, followUpDate: null, complianceClean: true,
    compositeScore: p.composite_score, motivationScore: p.motivation_score,
    dealScore: p.deal_score, scoreLabel: p.score_label,
    aiBoost: p.ai_boost, factors: p.factors, modelVersion: p.model_version,
    propertyType: p.property_type, bedrooms: p.bedrooms, bathrooms: p.bathrooms,
    sqft: p.sqft, yearBuilt: p.year_built, lotSize: p.lot_size,
    estimatedValue: p.estimated_value, equityPercent: p.equity_percent,
    availableEquity: p.available_equity, totalLoanBalance: p.total_loan_balance,
    lastSalePrice: p.last_sale_price, lastSaleDate: p.last_sale_date,
    foreclosureStage: p.foreclosure_stage, defaultAmount: p.default_amount,
    delinquentAmount: p.delinquent_amount, isVacant: p.is_vacant,
    isAbsentee: p.is_absentee, isFreeClear: p.is_free_clear,
    isHighEquity: p.is_high_equity, isCashBuyer: p.is_cash_buyer,
    ownerFlags: p.owner_flags, radarId: p.radar_id, enriched: p.enriched,
    nextCallScheduledAt: null, callSequenceStep: 1, totalCalls: 0, liveAnswers: 0, voicemailsLeft: 0,
    prediction: p._prediction ?? null,
  };
}

export function clientFileFromLead(l: LeadRow): ClientFile {
  return {
    id: l.id, propertyId: l.propertyId, apn: l.apn, county: l.county,
    address: l.address, city: l.city, state: l.state, zip: l.zip,
    fullAddress: buildAddress(l.address, l.city, l.state, l.zip),
    ownerName: l.ownerName, ownerPhone: l.ownerPhone, ownerEmail: l.ownerEmail,
    status: l.status, assignedTo: l.assignedTo, source: l.source,
    tags: l.tags, notes: l.notes, promotedAt: l.promotedAt,
    lastContactAt: l.lastContactAt, followUpDate: l.followUpDate,
    complianceClean: l.complianceClean,
    compositeScore: l.score.composite, motivationScore: l.score.motivation,
    dealScore: Math.round(l.score.composite * 0.75), scoreLabel: l.score.label,
    aiBoost: l.score.aiBoost, factors: [], modelVersion: null,
    propertyType: null, bedrooms: null, bathrooms: null,
    sqft: null, yearBuilt: null, lotSize: null,
    estimatedValue: l.estimatedValue, equityPercent: l.equityPercent,
    availableEquity: null, totalLoanBalance: null,
    lastSalePrice: null, lastSaleDate: null,
    foreclosureStage: null, defaultAmount: null, delinquentAmount: null,
    isVacant: false, isAbsentee: l.ownerBadge === "absentee",
    isFreeClear: false, isHighEquity: false, isCashBuyer: false,
    ownerFlags: {}, radarId: null, enriched: false,
    nextCallScheduledAt: null, callSequenceStep: 1, totalCalls: 0, liveAnswers: 0, voicemailsLeft: 0,
    prediction: null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clientFileFromRaw(lead: Record<string, any>, prop: Record<string, any>): ClientFile {
  const flags = prop.owner_flags ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (flags.pr_raw ?? {}) as Record<string, any>;
  const composite = lead.priority ?? 0;
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
    return isNaN(n) ? null : n;
  };
  const toBool = (v: unknown) => v === true || v === 1 || v === "1" || v === "Yes" || v === "True" || v === "true";
  const sl = (n: number): AIScore["label"] => n >= 85 ? "platinum" : n >= 65 ? "gold" : n >= 40 ? "silver" : "bronze";

  return {
    id: lead.id, propertyId: lead.property_id ?? "", apn: prop.apn ?? "",
    // Prefer inferred county from crawler rawData over the default market county (upsert key)
    county: (prop.owner_flags?.inferred_county as string) || prop.county || "",
    address: prop.address ?? "", city: prop.city ?? "", state: prop.state ?? "", zip: prop.zip ?? "",
    fullAddress: buildAddress(prop.address, prop.city, prop.state, prop.zip),
    ownerName: prop.owner_name ?? "Unknown", ownerPhone: prop.owner_phone ?? null, ownerEmail: prop.owner_email ?? null,
    status: lead.status ?? "prospect", assignedTo: lead.assigned_to ?? null,
    source: lead.source ?? "unknown", tags: lead.tags ?? [], notes: lead.notes ?? null,
    promotedAt: lead.promoted_at ?? null, lastContactAt: lead.last_contact_at ?? null,
    followUpDate: lead.follow_up_date ?? null, complianceClean: true,
    compositeScore: composite, motivationScore: Math.round(composite * 0.85),
    dealScore: Math.round(composite * 0.75), scoreLabel: sl(composite),
    aiBoost: 0, factors: [], modelVersion: null,
    propertyType: prop.property_type ?? null, bedrooms: prop.bedrooms ?? null,
    bathrooms: prop.bathrooms != null ? Number(prop.bathrooms) : null,
    sqft: prop.sqft ?? null, yearBuilt: prop.year_built ?? null, lotSize: prop.lot_size ?? null,
    estimatedValue: prop.estimated_value ?? null,
    equityPercent: prop.equity_percent != null ? Number(prop.equity_percent) : null,
    availableEquity: toNum(prRaw.AvailableEquity) ?? toNum(flags.available_equity),
    totalLoanBalance: toNum(prRaw.TotalLoanBalance) ?? toNum(flags.total_loan_balance),
    lastSalePrice: toNum(prRaw.LastTransferValue) ?? toNum(flags.last_sale_price),
    lastSaleDate: (prRaw.LastTransferRecDate as string) ?? (flags.last_sale_date as string) ?? null,
    foreclosureStage: (prRaw.ForeclosureStage as string) ?? null,
    defaultAmount: toNum(prRaw.DefaultAmount), delinquentAmount: toNum(prRaw.DelinquentAmount),
    isVacant: toBool(flags.vacant) || toBool(prRaw.isSiteVacant),
    isAbsentee: toBool(flags.absentee) || toBool(prRaw.isNotSameMailingOrExempt),
    isFreeClear: toBool(flags.freeAndClear) || toBool(prRaw.isFreeAndClear),
    isHighEquity: toBool(flags.highEquity) || toBool(prRaw.isHighEquity),
    isCashBuyer: toBool(flags.cashBuyer) || toBool(prRaw.isCashBuyer),
    ownerFlags: flags, radarId: (flags.radar_id as string) ?? null,
    enriched: !!flags.skip_traced || (flags.all_phones as unknown[])?.length > 0,
    lockVersion: lead.lock_version ?? 0,
    nextCallScheduledAt: lead.next_call_scheduled_at ?? null,
    callSequenceStep: lead.call_sequence_step ?? 1,
    totalCalls: lead.total_calls ?? 0,
    liveAnswers: lead.live_answers ?? 0,
    voicemailsLeft: lead.voicemails_left ?? 0,
    prediction: lead._prediction ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "contact", label: "Contact", icon: Contact2 },
  { id: "comps", label: "Comps & ARV", icon: Map },
  { id: "calculator", label: "Deal Calculator", icon: Calculator },
  { id: "documents", label: "Documents / PSA", icon: FileText },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DISTRESS_CFG: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  probate:          { label: "Probate",          icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  pre_foreclosure:  { label: "Pre-Foreclosure",  icon: AlertTriangle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  tax_lien:         { label: "Tax Lien",          icon: Banknote,      color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  code_violation:   { label: "Code Violation",    icon: Shield,        color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  vacant:           { label: "Vacant",            icon: Home,          color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  divorce:          { label: "Divorce",           icon: Scale,         color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  bankruptcy:       { label: "Bankruptcy",        icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  fsbo:             { label: "FSBO",              icon: Building,      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  absentee:         { label: "Absentee",          icon: UserX,         color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  inherited:        { label: "Inherited",         icon: User,          color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  water_shutoff:    { label: "Water Shut-Off",   icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  condemned:        { label: "Condemned",        icon: AlertTriangle, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
};

const SCORE_LABEL_CFG: Record<AIScore["label"], { text: string; color: string; bg: string }> = {
  platinum: { text: "PLATINUM", color: "text-cyan-300",    bg: "bg-cyan-400/10 border-cyan-400/30" },
  gold:     { text: "GOLD",    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  silver:   { text: "SILVER",  color: "text-slate-300",   bg: "bg-slate-400/10 border-slate-400/30" },
  bronze:   { text: "BRONZE",  color: "text-orange-500",  bg: "bg-orange-600/10 border-orange-600/30" },
};

const COUNTY_LINKS: Record<string, { name: string; gis: (apn: string) => string; assessor: (apn: string) => string; treasurer?: (apn: string) => string }> = {
  spokane: {
    name: "Spokane County",
    gis: (apn) => `https://cp.spokanecounty.org/SCOUT/Map/?PID=${encodeURIComponent(apn)}`,
    assessor: (apn) => `https://cp.spokanecounty.org/SCOUT/propertyinformation/Summary.aspx?PID=${encodeURIComponent(apn)}`,
    treasurer: (apn) => `https://cp.spokanecounty.org/SCOUT/propertyinformation/Summary.aspx?PID=${encodeURIComponent(apn)}`,
  },
  kootenai: {
    name: "Kootenai County",
    gis: () => `https://gis.kcgov.us/app/kcearth/`,
    assessor: () => `https://ftp.kcgov.us/departments/mapping/mapSearch/`,
    treasurer: () => `https://id-kootenai.publicaccessnow.com/Treasurer/TaxSearch.aspx`,
  },
  ada: {
    name: "Ada County",
    gis: (apn) => `https://www.adacountyassessor.org/adamaps/?run=ZoomToParcel&query=parcel%3D'${encodeURIComponent(apn)}'&LayerTheme=AerialsOn`,
    assessor: () => `https://apps.adacounty.id.gov/PropertyLookup/`,
    treasurer: () => `https://adacounty.id.gov/treasurer/`,
  },
};

// ═══════════════════════════════════════════════════════════════════════
// Shared sub-components
// ═══════════════════════════════════════════════════════════════════════

function InfoRow({ icon: Icon, label, value, mono, highlight }: {
  icon: typeof MapPin; label: string; value: string | number | null | undefined; mono?: boolean; highlight?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", highlight ? "text-cyan" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("text-sm truncate", mono && "font-mono", highlight ? "text-neon font-semibold" : "text-foreground")}>{value}</p>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-glass-border bg-secondary/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="p-0.5 rounded hover:bg-white/[0.06] transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-cyan" /> : <Copy className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground" />}
    </button>
  );
}

type ScoreType = "composite" | "motivation" | "deal";

const TIER_COLORS = {
  platinum: { bar: "bg-cyan-400", border: "border-cyan-400/30", glow: "rgba(0,212,255,0.3)", text: "text-cyan-300", hoverBorder: "hover:border-cyan-400/50" },
  gold:     { bar: "bg-amber-400", border: "border-amber-500/30", glow: "rgba(245,158,11,0.3)", text: "text-amber-400", hoverBorder: "hover:border-amber-400/50" },
  silver:   { bar: "bg-slate-300", border: "border-slate-400/30", glow: "rgba(148,163,184,0.3)", text: "text-slate-300", hoverBorder: "hover:border-slate-300/50" },
  bronze:   { bar: "bg-orange-500", border: "border-orange-600/30", glow: "rgba(249,115,22,0.3)", text: "text-orange-400", hoverBorder: "hover:border-orange-500/50" },
} as const;

function getTier(score: number): keyof typeof TIER_COLORS {
  if (score >= 85) return "platinum";
  if (score >= 65) return "gold";
  if (score >= 40) return "silver";
  return "bronze";
}

function ScoreCard({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const pct = Math.min(value, 100);
  const tier = getTier(value);
  const tc = TIER_COLORS[tier];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[10px] border bg-white/[0.04] p-3 text-center transition-all duration-200 w-full",
        tc.border, tc.hoverBorder,
        "cursor-pointer hover:bg-white/[0.06] hover:shadow-[0_0_20px_var(--glow)] active:scale-[0.97]",
        "group relative overflow-hidden"
      )}
      style={{ "--glow": tc.glow } as React.CSSProperties}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className={cn("text-[10px] uppercase tracking-wider mb-1 transition-colors relative z-10", tc.text)}>{label}</p>
      <p className="text-xl font-bold relative z-10 transition-all" style={{ textShadow: `0 0 10px ${tc.glow}` }}>{value}</p>
      <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden relative z-10">
        <div className={cn("h-full rounded-full transition-all", tc.bar)} style={{ width: `${pct}%` }} />
      </div>
      <p className={cn("text-[8px] mt-1.5 transition-colors relative z-10 uppercase tracking-widest font-semibold", tc.text, "opacity-60 group-hover:opacity-100")}>
        {tier.toUpperCase()} — tap to drill
      </p>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Score Breakdown Modal — full score intelligence overlay
// ═══════════════════════════════════════════════════════════════════════

const SIGNAL_WEIGHT_LABELS: Record<string, string> = {
  probate: "Probate Filing", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant Property", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee Owner",
  inherited: "Inherited Property", water_shutoff: "Water Shut-Off", condemned: "Condemned Property",
  stacking_bonus: "Signal Stacking Bonus", owner_factors: "Owner Profile Factors",
  equity: "Equity Factor", comp_ratio: "Comp Ratio Factor", ai_boost: "AI Historical Boost",
};

function ScoreBreakdownModal({ cf, scoreType, onClose }: { cf: ClientFile; scoreType: ScoreType; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factors = (cf.factors ?? []) as { name: string; value: number; contribution: number }[];
  const pred = cf.prediction;

  const signalFactors = factors.filter((f) => f.name in SIGNAL_WEIGHTS);
  const bonusFactors = factors.filter((f) => !(f.name in SIGNAL_WEIGHTS));

  const totalSignalPts = signalFactors.reduce((s, f) => s + f.contribution, 0);
  const totalBonusPts = bonusFactors.reduce((s, f) => s + f.contribution, 0);

  const arv = cf.estimatedValue ?? 0;
  const eqPct = cf.equityPercent ?? 0;
  const availableEquity = cf.availableEquity ?? (arv > 0 ? Math.round(arv * eqPct / 100) : 0);
  const rehabEst = 40000;
  const offerPct = 65;
  const offer = Math.round(arv * (offerPct / 100));
  const holdingCosts = Math.round(arv * 0.03);
  const sellingCosts = Math.round(arv * 0.08);
  const totalCost = offer + rehabEst + holdingCosts + sellingCosts;
  const profit = arv - totalCost;
  const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden rounded-[16px] border border-white/[0.08]
            modal-glass holo-border wet-shine flex flex-col"
        >
          {/* Holographic top accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-cyan/[0.03] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "h-8 w-8 rounded-[10px] flex items-center justify-center",
                scoreType === "composite" ? "bg-cyan/10 text-cyan" :
                scoreType === "motivation" ? "bg-orange-500/10 text-orange-400" :
                "bg-emerald-500/10 text-emerald-400"
              )}>
                {scoreType === "composite" ? <Zap className="h-4 w-4" /> :
                 scoreType === "motivation" ? <AlertTriangle className="h-4 w-4" /> :
                 <DollarSign className="h-4 w-4" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {scoreType === "composite" ? "Composite Score" : scoreType === "motivation" ? "Motivation Score" : "Deal Score"} Breakdown
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {cf.ownerName} — {cf.fullAddress}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {scoreType === "composite" && (
              <>
                {/* Big score hero */}
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums" style={{ textShadow: "0 0 24px rgba(0,212,255,0.3), 0 0 60px rgba(0,212,255,0.1)" }}>{cf.compositeScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                    {cf.scoreLabel.toUpperCase()} — Model {cf.modelVersion ?? "v2.0"}
                  </p>
                </div>

                {/* Blend weights */}
                {pred && (
                  <div className="rounded-[10px] border border-purple-500/15 bg-purple-500/[0.04] p-3">
                    <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Predictive Blend (v2.1)</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deterministic Weight</span>
                        <span className="font-mono font-semibold text-foreground">70%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Predictive Weight</span>
                        <span className="font-mono font-semibold text-purple-400">30%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Predictive Score</span>
                        <span className="font-mono font-semibold">{pred.predictiveScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confidence</span>
                        <span className="font-mono font-semibold text-cyan">{pred.confidence}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Signal contributions */}
                {signalFactors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" />Distress Signals — {Math.round(totalSignalPts)} pts
                    </p>
                    {signalFactors.map((f, i) => {
                      const maxPts = (SIGNAL_WEIGHTS[f.name as DistressType] ?? 10) * 1.8;
                      const fillPct = Math.min((f.contribution / maxPts) * 100, 100);
                      const cfg = DISTRESS_CFG[f.name];
                      return (
                        <div key={i} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={cn("font-medium", cfg?.color?.split(" ")[0] ?? "text-foreground")}>
                              {SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}
                            </span>
                            <span className="font-mono font-bold text-foreground">+{f.contribution}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Base: {f.value}</span>
                            <span className="text-muted-foreground/40">|</span>
                            <span>w/ severity + recency</span>
                          </div>
                          <div className="h-1 rounded-full bg-secondary/50 mt-1.5 overflow-hidden">
                            <div className={cn("h-full rounded-full", cfg?.color?.split(" ")[0]?.replace("text-", "bg-") ?? "bg-cyan")} style={{ width: `${fillPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bonus factors */}
                {bonusFactors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" />Adjustments — {Math.round(totalBonusPts)} pts
                    </p>
                    {bonusFactors.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                        <span className="text-muted-foreground">{SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}</span>
                        <span className={cn("font-mono font-bold", f.contribution >= 0 ? "text-cyan" : "text-red-400")}>
                          {f.contribution >= 0 ? "+" : ""}{f.contribution}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {factors.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground/60">
                    No detailed factor breakdown available — run enrichment to populate
                  </div>
                )}
              </>
            )}

            {scoreType === "motivation" && (
              <>
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums text-orange-400" style={{ textShadow: "0 0 24px rgba(249,115,22,0.3)" }}>{cf.motivationScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Motivation Score — Owner Distress Intensity</p>
                </div>

                <div className="rounded-[10px] border border-orange-500/15 bg-orange-500/[0.03] p-3">
                  <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-2">Formula</p>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                    BaseSignalScore × RecencyDecay × 1.2 (capped at 100)
                  </p>
                </div>

                {/* Per-signal detailed breakdown */}
                {cf.tags.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Distress Signals</p>
                    {cf.tags.map((tag) => {
                      const cfg = DISTRESS_CFG[tag];
                      const TagIcon = cfg?.icon ?? Tag;
                      const baseWeight = SIGNAL_WEIGHTS[tag as DistressType] ?? 10;
                      const factor = factors.find((f) => f.name === tag);
                      return (
                        <div key={tag} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <TagIcon className={cn("h-3.5 w-3.5", cfg?.color?.split(" ")[0] ?? "text-muted-foreground")} />
                            <span className={cn("text-xs font-semibold", cfg?.color?.split(" ")[0] ?? "text-foreground")}>{cfg?.label ?? tag}</span>
                            {factor && <span className="ml-auto font-mono text-xs font-bold text-foreground">+{factor.contribution}</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <span className="text-muted-foreground/60">Base Weight</span>
                              <p className="font-mono font-semibold">{baseWeight}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground/60">Source</span>
                              <p className="font-medium">{cf.source}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground/60">Severity</span>
                              <p className="font-mono font-semibold">{factor ? Math.round(factor.contribution / baseWeight * 10) / 10 : "—"}×</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-muted-foreground/60">
                    No active distress signals detected
                  </div>
                )}

                {/* Predictive life-event overlay */}
                {pred && pred.lifeEventProbability != null && pred.lifeEventProbability > 0.05 && (
                  <div className="rounded-[10px] border border-purple-500/15 bg-purple-500/[0.03] p-3">
                    <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Predictive Life-Event Intelligence</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Life-Event Probability</span>
                        <span className="font-mono font-bold text-purple-400">{Math.round(pred.lifeEventProbability * 100)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Distress In</span>
                        <span className="font-mono font-bold text-orange-400">~{pred.daysUntilDistress}d</span>
                      </div>
                      {pred.ownerAgeInference && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Owner Age (inferred)</span>
                          <span className="font-mono font-semibold">{pred.ownerAgeInference}</span>
                        </div>
                      )}
                      {pred.equityBurnRate != null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Equity Burn Rate</span>
                          <span className="font-mono font-semibold text-red-400">{Math.round(pred.equityBurnRate * 100)}%/yr</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Owner flags impact */}
                {(cf.isAbsentee || cf.isVacant || cf.isFreeClear || cf.isHighEquity) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Owner Profile Impact</p>
                    {cf.isAbsentee && <BreakdownRow label="Absentee Owner" value="+5 pts" color="text-amber-400" />}
                    {cf.isVacant && <BreakdownRow label="Vacant Property" value="+4 pts" color="text-purple-400" />}
                    {cf.isFreeClear && <BreakdownRow label="Free & Clear (no mortgage pressure)" value="+0 pts" color="text-emerald-400" />}
                    {cf.isHighEquity && <BreakdownRow label="High Equity" value="Equity factor boost" color="text-cyan" />}
                  </div>
                )}
              </>
            )}

            {scoreType === "deal" && (
              <>
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums text-emerald-400" style={{ textShadow: "0 0 24px rgba(16,185,129,0.3)" }}>{cf.dealScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Deal Score — Investment Viability Index</p>
                </div>

                <div className="rounded-[10px] border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
                  <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">Formula</p>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                    EquityFactor × 2 + AIBoost + StackingBonus × 0.5 (capped at 100)
                  </p>
                </div>

                {/* Deal assumptions */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Property Financials</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">ARV / AVM</span>
                      <span className="font-mono font-bold text-neon">{arv > 0 ? formatCurrency(arv) : "—"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Equity %</span>
                      <span className="font-mono font-bold">{eqPct > 0 ? `${eqPct}%` : "—"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Available Equity</span>
                      <span className="font-mono font-semibold">{availableEquity > 0 ? formatCurrency(availableEquity) : "—"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Total Loans</span>
                      <span className="font-mono font-semibold">{cf.totalLoanBalance ? formatCurrency(cf.totalLoanBalance) : "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Profit projection */}
                {arv > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Profit Projection</p>
                    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ARV</span>
                        <span className="font-mono font-medium">{formatCurrency(arv)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Offer @ {offerPct}%</span>
                        <span className="font-mono text-red-400">-{formatCurrency(offer)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rehab Est.</span>
                        <span className="font-mono text-red-400">-{formatCurrency(rehabEst)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Holding (3%)</span>
                        <span className="font-mono text-red-400">-{formatCurrency(holdingCosts)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Selling (8%)</span>
                        <span className="font-mono text-red-400">-{formatCurrency(sellingCosts)}</span>
                      </div>
                      <div className="border-t border-white/[0.06] pt-1.5 mt-1.5 flex justify-between">
                        <span className="font-semibold">Net Profit</span>
                        <span className={cn("font-mono font-bold text-lg", profit >= 0 ? "text-neon" : "text-red-400")} style={profit >= 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.25)" } : {}}>
                          {formatCurrency(profit)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">ROI</span>
                        <span className={cn("font-mono font-semibold", roi >= 0 ? "text-neon" : "text-red-400")}>{roi}%</span>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 italic">
                      Assumptions: {offerPct}% MAO, ${(rehabEst / 1000).toFixed(0)}k rehab, 3% holding, 8% selling costs. Adjust in Offer Calculator tab.
                    </p>
                  </div>
                )}

                {/* Deal score components */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Score Components</p>
                  {bonusFactors.filter((f) => f.name === "equity" || f.name === "comp_ratio" || f.name === "ai_boost" || f.name === "stacking_bonus").map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">{SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}</span>
                      <span className="font-mono font-bold text-cyan">+{f.contribution}</span>
                    </div>
                  ))}
                  {cf.aiBoost > 0 && !bonusFactors.some((f) => f.name === "ai_boost") && (
                    <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">AI Historical Boost</span>
                      <span className="font-mono font-bold text-cyan">+{cf.aiBoost}</span>
                    </div>
                  )}
                </div>

                {arv === 0 && (
                  <div className="text-center py-4 text-xs text-muted-foreground/60">
                    No property value data — run enrichment to populate ARV and financial details
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground/40 font-mono">
              Scoring Engine {cf.modelVersion ?? "v2.0"} • {cf.tags.length} signal(s) • {cf.source}
            </p>
            <Button size="sm" variant="outline" onClick={onClose} className="text-[10px] h-7 px-3">
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function BreakdownRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono font-semibold", color)}>{value}</span>
    </div>
  );
}

function OwnerFlag({ active, label, icon: Icon }: { active: boolean; label: string; icon: typeof Home }) {
  if (!active) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium">
      <Icon className="h-3 w-3" />{label}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Edit Details Modal — inline property editing from MCF
// ═══════════════════════════════════════════════════════════════════════

interface EditFields {
  address: string;
  city: string;
  state: string;
  zip: string;
  owner_name: string;
  apn: string;
  property_type: string;
  notes: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  year_built: string;
  lot_size: string;
}

function EditField({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground",
          "placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20",
          "transition-all hover:border-white/[0.12]",
          mono && "font-mono",
        )}
      />
    </div>
  );
}

function EditDetailsModal({ cf, onClose, onSaved }: { cf: ClientFile; onClose: () => void; onSaved: () => void }) {
  const [fields, setFields] = useState<EditFields>({
    address: cf.address?.split(",")[0]?.trim() ?? "",
    city: cf.city || "",
    state: cf.state || "",
    zip: cf.zip || "",
    owner_name: cf.ownerName || "",
    apn: cf.apn || "",
    property_type: cf.propertyType || "",
    notes: cf.notes || "",
    bedrooms: cf.bedrooms != null ? String(cf.bedrooms) : "",
    bathrooms: cf.bathrooms != null ? String(cf.bathrooms) : "",
    sqft: cf.sqft != null ? String(cf.sqft) : "",
    year_built: cf.yearBuilt != null ? String(cf.yearBuilt) : "",
    lot_size: cf.lotSize != null ? String(cf.lotSize) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof EditFields) => (v: string) => setFields((p) => ({ ...p, [key]: v }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const fullAddr = [fields.address, fields.city, fields.state, fields.zip].filter(Boolean).join(", ");
      const res = await fetch("/api/properties/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: cf.propertyId,
          lead_id: cf.id,
          fields: {
            address: fullAddr,
            city: fields.city,
            state: fields.state,
            zip: fields.zip,
            owner_name: fields.owner_name,
            apn: fields.apn,
            property_type: fields.property_type || null,
            notes: fields.notes || null,
            bedrooms: fields.bedrooms ? parseInt(fields.bedrooms) : null,
            bathrooms: fields.bathrooms ? parseFloat(fields.bathrooms) : null,
            sqft: fields.sqft ? parseInt(fields.sqft) : null,
            year_built: fields.year_built ? parseInt(fields.year_built) : null,
            lot_size: fields.lot_size ? parseInt(fields.lot_size) : null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Update failed");
        return;
      }
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden rounded-[16px] border border-white/[0.08]
            modal-glass holo-border wet-shine flex flex-col"
        >
          {/* Holographic accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-cyan/[0.03] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] bg-cyan/10 flex items-center justify-center">
                <Pencil className="h-4 w-4 text-cyan" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Edit Property Details</h3>
                <p className="text-[10px] text-muted-foreground">{cf.fullAddress}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
            <EditField label="Street Address" value={fields.address} onChange={set("address")} placeholder="123 Main St" />
            <div className="grid grid-cols-3 gap-3">
              <EditField label="City" value={fields.city} onChange={set("city")} placeholder="Spokane" />
              <EditField label="State" value={fields.state} onChange={set("state")} placeholder="WA" />
              <EditField label="ZIP" value={fields.zip} onChange={set("zip")} placeholder="99201" mono />
            </div>
            <EditField label="Owner Name" value={fields.owner_name} onChange={set("owner_name")} placeholder="John Smith" />
            <div className="grid grid-cols-2 gap-3">
              <EditField label="APN" value={fields.apn} onChange={set("apn")} placeholder="12345-678-9" mono />
              <EditField label="Property Type" value={fields.property_type} onChange={set("property_type")} placeholder="SFR" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <EditField label="Beds" value={fields.bedrooms} onChange={set("bedrooms")} placeholder="3" mono />
              <EditField label="Baths" value={fields.bathrooms} onChange={set("bathrooms")} placeholder="2" mono />
              <EditField label="Sqft" value={fields.sqft} onChange={set("sqft")} placeholder="1500" mono />
              <EditField label="Year Built" value={fields.year_built} onChange={set("year_built")} placeholder="1985" mono />
            </div>
            <EditField label="Lot Size (sqft)" value={fields.lot_size} onChange={set("lot_size")} placeholder="7500" mono />
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Notes</label>
              <textarea
                value={fields.notes}
                onChange={(e) => set("notes")(e.target.value)}
                rows={3}
                placeholder="Add notes about this property..."
                className="w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground
                  placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30 focus:ring-1 focus:ring-cyan/20
                  transition-all hover:border-white/[0.12] resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-[10px] px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[9px] text-muted-foreground/40 font-mono">
              Property: {cf.propertyId.slice(0, 8)}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onClose} className="text-[11px] h-8 px-4">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="text-[11px] h-8 px-4 gap-1.5 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/20
                  shadow-[0_0_14px_rgba(0,212,255,0.15)] hover:shadow-[0_0_22px_rgba(0,212,255,0.25)] transition-all"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Delete Confirmation Modal — "type yes" to permanently delete
// ═══════════════════════════════════════════════════════════════════════

function DeleteConfirmationModal({
  cf,
  onClose,
  onDeleted,
}: {
  cf: ClientFile;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toLowerCase() === "yes";

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/prospects", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ lead_id: cf.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.detail ?? data.error ?? "Delete failed");
        return;
      }
      toast.success("Customer file permanently deleted");
      window.dispatchEvent(new CustomEvent("sentinel:refresh-dashboard"));
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-md w-full mx-4 overflow-hidden rounded-[16px] border border-red-500/20
            modal-glass holo-border flex flex-col"
        >
          {/* Red accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-red-500/[0.05] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-[10px] bg-red-500/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete Customer File</h3>
                <p className="text-[10px] text-muted-foreground">Permanent action</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Lead details */}
            <div className="rounded-[10px] bg-white/[0.03] border border-white/[0.06] p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-white">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{cf.fullAddress || cf.address}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{cf.ownerName || "Unknown Owner"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] border-white/[0.08]">
                  {cf.status}
                </Badge>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-red-500/[0.06] border border-red-500/20">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-300/90 leading-relaxed">
                <strong>This action is permanent and cannot be undone.</strong>
                <br />
                The lead, property, distress events, scoring records, predictions, and associated deals will be permanently deleted.
              </div>
            </div>

            {/* Type yes input */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Type <span className="text-red-400 font-semibold">&quot;yes&quot;</span> to confirm deletion
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type yes to confirm..."
                autoFocus
                className="w-full px-3 py-2 rounded-[10px] text-sm bg-white/[0.04] border border-white/[0.08] text-foreground
                  placeholder:text-muted-foreground/40 focus:outline-none focus:border-red-500/30 focus:ring-1 focus:ring-red-500/20
                  transition-all hover:border-white/[0.12]"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/[0.06]">
            <Button size="sm" variant="outline" onClick={onClose} className="text-[11px] h-8 px-4">
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className="text-[11px] h-8 px-4 gap-1.5"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {deleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab: Overview
// ═══════════════════════════════════════════════════════════════════════

interface PhoneDetail {
  number: string;
  lineType: "mobile" | "landline" | "voip" | "unknown";
  confidence: number;
  dnc: boolean;
  carrier?: string;
  source: "propertyradar" | "batchdata";
}

interface EmailDetail {
  email: string;
  deliverable: boolean;
  source: "propertyradar" | "batchdata";
}

interface SkipTraceOverlay {
  phones: string[];
  emails: string[];
  persons: Record<string, unknown>[];
  primaryPhone: string | null;
  primaryEmail: string | null;
  phoneDetails: PhoneDetail[];
  emailDetails: EmailDetail[];
  providers: string[];
  isLitigator: boolean;
  hasDncNumbers: boolean;
}

interface SkipTraceError {
  error: string;
  reason?: string;
  suggestion?: string;
  tier_reached?: string;
  address_issues?: string[];
}

function dispositionColor(disp: string): string {
  const d = disp.toLowerCase();
  if (d === "connected" || d === "interested" || d === "appointment_set" || d === "callback") return "text-emerald-400";
  if (d === "no_answer" || d === "voicemail" || d === "busy" || d === "left_message") return "text-amber-400";
  if (d === "wrong_number" || d === "disconnected" || d === "do_not_call") return "text-red-400";
  return "text-muted-foreground";
}

// ═══════════════════════════════════════════════════════════════════════
// DEEP CRAWL RESULTS PANEL
// ═══════════════════════════════════════════════════════════════════════

const URGENCY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-400 bg-red-500/[0.12] border-red-500/30",
  HIGH: "text-orange-400 bg-orange-500/[0.12] border-orange-500/30",
  MEDIUM: "text-amber-400 bg-amber-500/[0.12] border-amber-500/30",
  LOW: "text-emerald-400 bg-emerald-500/[0.12] border-emerald-500/30",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeepCrawlPanel({ result }: { result: any }) {
  if (!result) return null;

  const ai = result.aiDossier ?? result.ai_dossier ?? {};
  const crawledAt = result.crawledAt ?? result.crawled_at;
  const crawledAgo = crawledAt
    ? (() => {
        const mins = Math.floor((Date.now() - new Date(crawledAt).getTime()) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
      })()
    : null;

  const urgencyColor = URGENCY_COLORS[ai.urgencyLevel] ?? URGENCY_COLORS.MEDIUM;
  const sources = result.sources ?? [];

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
      {/* Executive Summary */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-3 w-3 text-cyan" />
          <p className="text-[10px] text-cyan/80 uppercase tracking-wider font-semibold">Executive Summary</p>
          {ai.urgencyLevel && (
            <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold border", urgencyColor)}>
              {ai.urgencyLevel}
            </span>
          )}
        </div>
        <p className="text-xs text-foreground/90 leading-relaxed">{ai.summary ?? "No summary available"}</p>
        {ai.urgencyReason && (
          <p className="text-[10px] text-muted-foreground mt-1">{ai.urgencyReason}</p>
        )}
      </div>

      {/* Signal Analysis */}
      {ai.signalAnalysis && ai.signalAnalysis.length > 0 && (
        <div>
          <p className="text-[10px] text-orange-400/80 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />Signal Analysis
          </p>
          <div className="space-y-2">
            {ai.signalAnalysis.map((s: { headline: string; detail: string; daysUntilCritical: number | null; actionableInsight: string }, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-2.5 space-y-1">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-2.5 w-2.5 text-orange-400 shrink-0" />
                  {s.headline}
                  {s.daysUntilCritical != null && s.daysUntilCritical <= 60 && (
                    <span className="text-[9px] text-red-400 font-mono ml-auto">{s.daysUntilCritical}d</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed pl-4">{s.detail}</p>
                {s.actionableInsight && (
                  <p className="text-[10px] text-cyan/80 pl-4 flex items-center gap-1">
                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />{s.actionableInsight}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Owner Profile */}
      {ai.ownerProfile && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <User className="h-3 w-3" />Owner Profile
          </p>
          <p className="text-[10px] text-foreground/80 leading-relaxed">{ai.ownerProfile}</p>
        </div>
      )}

      {/* Financial Snapshot */}
      {ai.financialAnalysis && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />Financial Snapshot
          </p>
          <p className="text-[10px] text-foreground/80 leading-relaxed">{ai.financialAnalysis}</p>
          {ai.estimatedMAO && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[9px] text-muted-foreground uppercase">Est. MAO:</span>
              <span className="text-[11px] font-semibold text-emerald-400">
                ${ai.estimatedMAO.low?.toLocaleString()} &ndash; ${ai.estimatedMAO.high?.toLocaleString()}
              </span>
              <span className="text-[9px] text-muted-foreground/60">{ai.estimatedMAO.basis}</span>
            </div>
          )}
        </div>
      )}

      {/* Approach & Talking Points */}
      {ai.suggestedApproach && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Target className="h-3 w-3" />Suggested Approach
          </p>
          <p className="text-[10px] text-foreground/80 leading-relaxed">{ai.suggestedApproach}</p>
          {ai.talkingPoints && ai.talkingPoints.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {ai.talkingPoints.map((tp: string, i: number) => (
                <li key={i} className="text-[10px] text-cyan/80 flex items-start gap-1.5">
                  <span className="text-cyan/40 mt-0.5 shrink-0">&#8226;</span>{tp}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Web Findings */}
      {ai.webFindings && ai.webFindings.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Globe className="h-3 w-3" />Web Findings
          </p>
          <div className="space-y-1">
            {ai.webFindings.map((w: { source: string; finding: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[10px]">
                <Search className="h-2.5 w-2.5 text-cyan/50 mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold text-foreground/70">{w.source}:</span>{" "}
                  <span className="text-foreground/60">{w.finding}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Red Flags */}
      {ai.redFlags && ai.redFlags.length > 0 && (
        <div>
          <p className="text-[10px] text-red-400/80 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3" />Red Flags
          </p>
          <ul className="space-y-0.5">
            {ai.redFlags.map((flag: string, i: number) => (
              <li key={i} className="text-[10px] text-red-300/70 flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5 shrink-0">&#9679;</span>{flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center gap-2 text-[9px] text-muted-foreground/50">
        {crawledAgo && <span>Crawled {crawledAgo}</span>}
        {sources.length > 0 && <span>&#183; Sources: {sources.join(", ")}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CONTACT TAB — Editable phones, emails, addresses + street view
// ═══════════════════════════════════════════════════════════════════════

function ContactTab({ cf, overlay, onSkipTrace, skipTracing, onDial, onSms, calling, onRefresh }: {
  cf: ClientFile; overlay: SkipTraceOverlay | null;
  onSkipTrace: () => void; skipTracing: boolean;
  onDial: (phone: string) => void; onSms: (phone: string) => void;
  calling: boolean; onRefresh?: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;

  // ── Image (Street View or satellite fallback) ──
  const { lat: propLat, lng: propLng } = extractLatLng(cf);
  const streetViewUrl = prRaw.StreetViewUrl ?? prRaw.PropertyImageUrl ?? (prRaw.Photos?.[0]) ?? null;
  const satelliteFallbackUrl = (!streetViewUrl && propLat && propLng) ? getSatelliteTileUrl(propLat, propLng, 18) : null;
  const imageUrl = streetViewUrl ?? satelliteFallbackUrl;
  const streetViewLink = propLat && propLng ? getGoogleStreetViewLink(propLat, propLng) : null;

  // ── Phone & email data ──
  const persons = overlay?.persons ?? (cf.ownerFlags?.persons as Record<string, unknown>[]) ?? [];
  const phoneDetails: PhoneDetail[] = overlay?.phoneDetails
    ?? (cf.ownerFlags?.all_phones as PhoneDetail[] | undefined)?.filter((p) => typeof p === "object" && p !== null && "number" in p)
    ?? [];
  const emailDetails: EmailDetail[] = overlay?.emailDetails
    ?? (cf.ownerFlags?.all_emails as EmailDetail[] | undefined)?.filter((e) => typeof e === "object" && e !== null && "email" in e)
    ?? [];

  // ── Mailing address from PR raw data ──
  const prMailAddr = prRaw.MailAddress ?? prRaw.MailingAddress ?? null;
  const prMailCity = prRaw.MailCity ?? null;
  const prMailState = prRaw.MailState ?? null;
  const prMailZip = prRaw.MailZip ?? null;
  const mailingFromPersons = persons.find((p: Record<string, unknown>) => p.mailing_address || p.mailingAddress);
  const safeMailing = (val: unknown): string => {
    if (!val) return "";
    if (typeof val === "string") return val;
    if (typeof val === "object" && val !== null) {
      const a = val as Record<string, unknown>;
      return [a.street, a.city, a.state, a.zip].filter(Boolean).join(", ");
    }
    return "";
  };
  const defaultMailing = prMailAddr
    ? [prMailAddr, prMailCity, prMailState, prMailZip].filter(Boolean).join(", ")
    : safeMailing(mailingFromPersons?.mailing_address) || safeMailing(mailingFromPersons?.mailingAddress);

  // ── Editable state ──
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [propertyAddr, setPropertyAddr] = useState(cf.address ?? "");
  const [propertyCity, setPropertyCity] = useState(cf.city ?? "");
  const [propertyState, setPropertyState] = useState(cf.state ?? "");
  const [propertyZip, setPropertyZip] = useState(cf.zip ?? "");
  const [mailingAddr, setMailingAddr] = useState(defaultMailing);

  // Dynamic phone slots — show all returned phones, minimum 5 empty slots
  const initialPhones = (() => {
    const phones: string[] = [];
    for (const pd of phoneDetails) phones.push(pd.number);
    if (phones.length === 0 && cf.ownerPhone) phones.push(cf.ownerPhone);
    const MIN_PHONE_SLOTS = 5;
    while (phones.length < MIN_PHONE_SLOTS) phones.push("");
    return phones;
  })();
  const [phoneSlots, setPhoneSlots] = useState<string[]>(initialPhones);

  // Dynamic email slots — show all returned emails, minimum 2 empty slots
  const initialEmails = (() => {
    const emails: string[] = [];
    for (const ed of emailDetails) emails.push(ed.email);
    if (emails.length === 0 && cf.ownerEmail) emails.push(cf.ownerEmail);
    const MIN_EMAIL_SLOTS = 2;
    while (emails.length < MIN_EMAIL_SLOTS) emails.push("");
    return emails;
  })();
  const [emailSlots, setEmailSlots] = useState<string[]>(initialEmails);

  // Re-sync when overlay updates (after enrichment)
  useEffect(() => {
    if (overlay) {
      const newPhones: string[] = [];
      if (overlay.phoneDetails) {
        for (const pd of overlay.phoneDetails) newPhones.push(pd.number);
      } else if (overlay.phones) {
        for (const ph of overlay.phones) newPhones.push(ph);
      }
      while (newPhones.length < 5) newPhones.push("");
      setPhoneSlots(newPhones);

      const newEmails: string[] = [];
      if (overlay.emailDetails) {
        for (const ed of overlay.emailDetails) newEmails.push(ed.email);
      } else if (overlay.emails) {
        for (const em of overlay.emails) newEmails.push(em);
      }
      while (newEmails.length < 2) newEmails.push("");
      setEmailSlots(newEmails);
    }
  }, [overlay]);

  const updatePhone = (i: number, val: string) => {
    setPhoneSlots((prev) => { const next = [...prev]; next[i] = val; return next; });
  };
  const updateEmail = (i: number, val: string) => {
    setEmailSlots((prev) => { const next = [...prev]; next[i] = val; return next; });
  };

  const hasChanges = useMemo(() => {
    const origPhones = initialPhones;
    const origEmails = initialEmails;
    return (
      propertyAddr !== (cf.address ?? "") ||
      propertyCity !== (cf.city ?? "") ||
      propertyState !== (cf.state ?? "") ||
      propertyZip !== (cf.zip ?? "") ||
      mailingAddr !== defaultMailing ||
      phoneSlots.some((p, i) => p !== origPhones[i]) ||
      emailSlots.some((e, i) => e !== origEmails[i])
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyAddr, propertyCity, propertyState, propertyZip, mailingAddr, phoneSlots, emailSlots]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const existingFlags = (cf.ownerFlags ?? {}) as Record<string, unknown>;
      const filledPhones = phoneSlots.filter((p) => p.trim().length >= 7);
      const filledEmails = emailSlots.filter((e) => e.includes("@"));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: Record<string, any> = {
        address: propertyAddr.trim(),
        city: propertyCity.trim(),
        state: propertyState.trim(),
        zip: propertyZip.trim(),
        owner_phone: filledPhones[0] || null,
        owner_email: filledEmails[0] || null,
        owner_flags: {
          ...existingFlags,
          mailing_address: mailingAddr.trim() || null,
          manual_phones: filledPhones,
          manual_emails: filledEmails,
          contact_updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("properties") as any).update(update).eq("id", cf.propertyId);
      if (error) throw error;

      toast.success("Contact info saved");
      setEditing(false);
      onRefresh?.();
    } catch (err) {
      console.error("[Contact] Save error:", err);
      toast.error("Failed to save contact info");
    } finally {
      setSaving(false);
    }
  };

  // Show enrich button when no phones are populated (regardless of enriched badge)
  const hasPhones = phoneSlots.some((p) => p.trim().length >= 7);

  return (
    <div className="space-y-4 max-w-[680px] mx-auto">
      {/* ── Street View / Satellite Image ── */}
      {imageUrl && (
        <div className="rounded-[12px] border border-white/[0.06] overflow-hidden">
          <a
            href={streetViewLink ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block h-44 group cursor-pointer"
            onClick={(e) => { if (!streetViewLink) e.preventDefault(); }}
          >
            <img
              src={imageUrl}
              alt="Property"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,7,13,0.85)] via-[rgba(7,7,13,0.2)] to-transparent pointer-events-none" />
            {streetViewLink && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <ExternalLink className="h-3 w-3" />{streetViewUrl ? "Open Street View" : "Open in Google Maps"}
                </span>
              </div>
            )}
            <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[9px] text-white/50">
              <ImageIcon className="h-2.5 w-2.5" />{streetViewUrl ? "Street View" : "Satellite"}
            </div>
          </a>
        </div>
      )}

      {/* ── Edit / Save controls ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Contact2 className="h-4 w-4 text-cyan/60" />
          Contact Information
        </h3>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="h-7 px-3 rounded-md text-[10px] font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors"
              >Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="h-7 px-3 rounded-md text-[10px] font-semibold bg-cyan/15 text-cyan border border-cyan/20 hover:bg-cyan/25 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="h-7 px-3 rounded-md text-[10px] font-semibold border border-white/10 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" />Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Property Address ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="h-3 w-3" />Property Address
        </p>
        {editing ? (
          <div className="grid grid-cols-[1fr] gap-2">
            <input
              value={propertyAddr}
              onChange={(e) => setPropertyAddr(e.target.value)}
              placeholder="Street address"
              className="w-full bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                value={propertyCity}
                onChange={(e) => setPropertyCity(e.target.value)}
                placeholder="City"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
              />
              <input
                value={propertyState}
                onChange={(e) => setPropertyState(e.target.value)}
                placeholder="State"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
              />
              <input
                value={propertyZip}
                onChange={(e) => setPropertyZip(e.target.value)}
                placeholder="ZIP"
                className="bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{cf.fullAddress || "—"}</p>
            {cf.fullAddress && <CopyBtn text={cf.fullAddress} />}
          </div>
        )}
      </div>

      {/* ── Mailing Address ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Mailing Address
        </p>
        {editing ? (
          <input
            value={mailingAddr}
            onChange={(e) => setMailingAddr(e.target.value)}
            placeholder="Mailing address (if different from property)"
            className="w-full bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan/30"
          />
        ) : (
          <p className="text-sm text-foreground">{mailingAddr || <span className="text-muted-foreground/40 italic">No mailing address on file</span>}</p>
        )}
      </div>

      {/* ── Phone Numbers (5 slots) ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Phone className="h-3 w-3" />Phone Numbers ({phoneSlots.filter((p) => p.trim().length >= 7).length}/{phoneSlots.length})
          </p>
          {!hasPhones && (
            <button
              onClick={onSkipTrace}
              disabled={skipTracing}
              className="h-6 px-2.5 rounded-md text-[9px] font-semibold border border-amber-500/30 bg-amber-500/[0.06] text-amber-400 hover:bg-amber-500/[0.12] transition-colors flex items-center gap-1"
            >
              {skipTracing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
              {skipTracing ? "Deep Skipping..." : "~90s Deep Skip"}
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {phoneSlots.map((phone, i) => {
            const detail = phoneDetails[i];
            const hasPhone = phone.trim().length >= 7;

            if (editing) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={phone}
                    onChange={(e) => updatePhone(i, e.target.value)}
                    placeholder={`Phone ${i + 1}`}
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-cyan/30"
                  />
                </div>
              );
            }

            if (!hasPhone) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-white/[0.06] bg-white/[0.01] p-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    </div>
                    <span className="text-sm font-mono text-muted-foreground/15">(•••) •••-••••</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                    detail?.lineType === "mobile" ? "bg-emerald-500/10" : "bg-cyan/10",
                  )}>
                    {detail?.lineType === "mobile" ? <Smartphone className="h-3.5 w-3.5 text-emerald-400" /> : <Phone className="h-3.5 w-3.5 text-cyan/70" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold font-mono text-foreground">{phone}</span>
                      {i === 0 && <Badge variant="outline" className="text-[7px] py-0 px-1 border-cyan/30 text-cyan">BEST</Badge>}
                      {detail?.dnc && <Badge variant="outline" className="text-[7px] py-0 px-1 border-red-500/30 text-red-400">DNC</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {detail?.lineType && (
                        <span className="text-[10px] text-muted-foreground capitalize">{detail.lineType}</span>
                      )}
                      {detail?.confidence != null && (
                        <span className="text-[10px] text-muted-foreground">{detail.confidence}%</span>
                      )}
                      {detail?.source && (
                        <Badge variant="outline" className={cn(
                          "text-[7px] py-0 px-1",
                          detail.source === "batchdata" ? "border-emerald-500/30 text-emerald-400" : "border-cyan/30 text-cyan/70",
                        )}>
                          {detail.source === "batchdata" ? "BD" : "PR"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onDial(phone)}
                      disabled={calling || detail?.dnc}
                      className="h-7 px-2 rounded-md text-[10px] font-semibold bg-cyan/10 text-cyan hover:bg-cyan/20 border border-cyan/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <Phone className="h-3 w-3" />Dial
                    </button>
                    <button
                      onClick={() => onSms(phone)}
                      disabled={detail?.lineType === "landline"}
                      className="h-7 px-2 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all flex items-center gap-1 disabled:opacity-30"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Emails (dynamic slots) ── */}
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="h-3 w-3" />Emails ({emailSlots.filter((e) => e.includes("@")).length}/{emailSlots.length})
        </p>
        <div className="space-y-1.5">
          {emailSlots.map((email, i) => {
            const detail = emailDetails[i];
            const hasEmail = email.includes("@");

            if (editing) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50 w-4 text-center">{i + 1}</span>
                  <input
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    placeholder={`Email ${i + 1}`}
                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-cyan/30"
                  />
                </div>
              );
            }

            if (!hasEmail) {
              return (
                <div key={i} className="rounded-[10px] border border-dashed border-white/[0.06] bg-white/[0.01] p-2.5">
                  <div className="flex items-center gap-2.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/20" />
                    <span className="text-sm font-mono text-muted-foreground/15">•••••••@•••••.com</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] p-2.5">
                <div className="flex items-center gap-2.5">
                  <Mail className="h-3.5 w-3.5 text-cyan/60" />
                  <a href={`mailto:${email}`} className="text-sm text-cyan hover:underline">{email}</a>
                  {i === 0 && <Badge variant="outline" className="text-[8px] py-0 px-1 border-cyan/30 text-cyan">PRIMARY</Badge>}
                  {detail?.deliverable && (
                    <Badge variant="outline" className="text-[7px] py-0 px-1 border-emerald-500/30 text-emerald-400">Verified</Badge>
                  )}
                  {detail?.source && (
                    <Badge variant="outline" className={cn(
                      "text-[7px] py-0 px-1",
                      detail.source === "batchdata" ? "border-emerald-500/30 text-emerald-400" : "border-cyan/30 text-cyan/70",
                    )}>
                      {detail.source === "batchdata" ? "BD" : "PR"}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Associated Persons ── */}
      {persons.length > 0 && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <User className="h-3 w-3" />Associated Persons ({persons.length})
          </p>
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {persons.map((person: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <div className="h-7 w-7 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-foreground">{person.name ?? "Unknown"}</span>
                    <Badge variant="outline" className="text-[7px] py-0 px-1">{person.relation ?? person.role ?? "Owner"}</Badge>
                    {person.source && (
                      <Badge variant="outline" className={cn(
                        "text-[7px] py-0 px-1",
                        person.source === "batchdata" ? "border-emerald-500/30 text-emerald-400" : "border-cyan/30 text-cyan/70",
                      )}>
                        {person.source === "batchdata" ? "BD" : "PR"}
                      </Badge>
                    )}
                  </div>
                  {person.age && <span className="text-[10px] text-muted-foreground">Age {person.age}</span>}
                  {person.occupation && <span className="text-[10px] text-muted-foreground ml-2">{person.occupation}</span>}
                  {person.mailing_address && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {typeof person.mailing_address === "string"
                        ? person.mailing_address
                        : typeof person.mailing_address === "object"
                          ? [person.mailing_address.street, person.mailing_address.city, person.mailing_address.state, person.mailing_address.zip].filter(Boolean).join(", ")
                          : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════

function OverviewTab({ cf, computedArv, skipTracing, skipTraceResult, skipTraceMs, overlay, skipTraceError, onSkipTrace, onManualSkipTrace, onEdit, onDial, onSms, calling, dialHistory, autofilling, onAutofill, deepCrawling, deepCrawlResult, deepCrawlExpanded, setDeepCrawlExpanded, executeDeepCrawl }: {
  cf: ClientFile; computedArv: number; skipTracing: boolean; skipTraceResult: string | null; skipTraceMs: number | null;
  overlay: SkipTraceOverlay | null; skipTraceError: SkipTraceError | null;
  onSkipTrace: () => void; onManualSkipTrace: () => void; onEdit: () => void;
  onDial: (phone: string) => void; onSms: (phone: string) => void;
  calling: boolean;
  dialHistory: Record<string, { count: number; lastDate: string; lastDisposition: string }>;
  autofilling: boolean; onAutofill: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deepCrawling: boolean; deepCrawlResult: any; deepCrawlExpanded: boolean;
  setDeepCrawlExpanded: (v: boolean) => void; executeDeepCrawl: () => void;
}) {
  const skipTraced = !!overlay || !!cf.ownerFlags?.skip_traced;
  const displayPhone = overlay?.primaryPhone ?? cf.ownerPhone ?? (cf.ownerFlags?.contact_phone as string | null) ?? null;
  const displayEmail = overlay?.primaryEmail ?? cf.ownerEmail ?? (cf.ownerFlags?.contact_email as string | null) ?? null;
  const { notes: callHistory } = useCallNotes(cf.id, 5);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const summaryNotes = callHistory.filter((n) => n.ai_summary);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persons = overlay?.persons ?? (cf.ownerFlags?.persons as any[]) ?? [];
  const allPhones = overlay?.phones ?? (cf.ownerFlags?.all_phones as string[]) ?? [];
  const allEmails = overlay?.emails ?? (cf.ownerFlags?.all_emails as string[]) ?? [];

  // Rich phone/email details from dual skip-trace
  const phoneDetails: PhoneDetail[] = overlay?.phoneDetails
    ?? (cf.ownerFlags?.all_phones as PhoneDetail[] | undefined)?.filter((p) => typeof p === "object" && p !== null && "number" in p)
    ?? [];
  const emailDetails: EmailDetail[] = overlay?.emailDetails
    ?? (cf.ownerFlags?.all_emails as EmailDetail[] | undefined)?.filter((e) => typeof e === "object" && e !== null && "email" in e)
    ?? [];
  const isLitigator = overlay?.isLitigator ?? (cf.ownerFlags?.is_litigator as boolean) ?? false;
  const hasDncNumbers = overlay?.hasDncNumbers ?? (cf.ownerFlags?.has_dnc_numbers as boolean) ?? false;
  const skipProviders = overlay?.providers ?? (cf.ownerFlags?.skip_trace_providers as string[]) ?? [];

  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreType | null>(null);
  const canEdit = ["prospect", "lead"].includes(cf.status);

  const { brief, loading: briefLoading, regenerate: regenerateBrief } = usePreCallBrief(cf.id);

  const bestPhone = allPhones[0] ?? (phoneDetails[0]?.number) ?? displayPhone;
  const phoneConfidence = phoneDetails.length > 0
    ? phoneDetails[0]?.confidence ?? 70
    : allPhones.length >= 3 ? 95 : allPhones.length === 2 ? 80 : allPhones.length === 1 ? 65 : null;

  const equityPct = cf.equityPercent ?? 0;
  const equityIsGreen = equityPct >= 50;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;
  const tier = getTier(cf.compositeScore);
  const tc = TIER_COLORS[tier];

  const ownerAge = prRaw.OwnerAge ? Number(prRaw.OwnerAge) : null;
  const lastTransferDate = prRaw.LastTransferRecDate ?? prRaw.LastTransferDate ?? null;
  const yearsOwned = lastTransferDate ? Math.floor((Date.now() - new Date(lastTransferDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const lastTransferType = prRaw.LastTransferType ?? null;
  const lastTransferValue = prRaw.LastTransferValue ? Number(prRaw.LastTransferValue) : null;

  const estimatedOwed = cf.estimatedValue && cf.equityPercent != null
    ? Math.round(cf.estimatedValue * (1 - cf.equityPercent / 100)) : null;
  const roomLabel = cf.equityPercent != null
    ? (cf.equityPercent >= 50 ? "HIGH SPREAD" : cf.equityPercent >= 25 ? "MODERATE" : "TIGHT")
    : null;
  const roomColor = cf.equityPercent != null
    ? (cf.equityPercent >= 50 ? "text-emerald-400 bg-emerald-500/10" : cf.equityPercent >= 25 ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10")
    : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mailingAddr = cf.isAbsentee ? ((persons[0] as any)?.mailing_address ?? prRaw.MailAddress ?? prRaw.MailingAddress ?? null) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const heirContacts = (cf.ownerFlags?.heir_contacts as any[]) ?? [];

  const warningFlags = useMemo(() => {
    const flags: { label: string; color: string }[] = [];
    if (prRaw.isListedForSale === "Yes" || prRaw.isListedForSale === true) flags.push({ label: "Listed for Sale", color: "text-red-400 bg-red-500/10 border-red-500/20" });
    if (prRaw.isRecentSale === "Yes" || prRaw.isRecentSale === true) flags.push({ label: "Recent Sale", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" });
    if (prRaw.isRecentFlip === "Yes" || prRaw.isRecentFlip === true) flags.push({ label: "Recent Flip", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" });
    if (prRaw.isAuction === "Yes" || prRaw.isAuction === true) flags.push({ label: "Auction", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" });
    if (prRaw.isBankOwned === "Yes" || prRaw.isBankOwned === true) flags.push({ label: "Bank-Owned (REO)", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" });
    return flags;
  }, [prRaw]);

  const [distressEvents, setDistressEvents] = useState<{ id: string; event_type: string; source: string; created_at: string; severity?: number; raw_data?: Record<string, unknown> }[]>([]);
  useEffect(() => {
    if (!cf.propertyId) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("distress_events") as any)
        .select("id, event_type, source, created_at, severity, raw_data")
        .eq("property_id", cf.propertyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setDistressEvents(data);
    })();
  }, [cf.propertyId]);

  const freshestEvent = distressEvents[0] ?? null;
  const freshestDays = freshestEvent
    ? Math.floor((Date.now() - new Date(freshestEvent.created_at).getTime()) / 86400000)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activityLog, setActivityLog] = useState<{ id: string; type: string; disposition?: string; notes?: string; created_at: string; duration_sec?: number; phone?: string }[]>([]);
  useEffect(() => {
    if (!cf.id) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [callsRes, eventsRes] = await Promise.all([
        (supabase.from("calls_log") as any)
          .select("id, disposition, notes, started_at, duration_sec, phone_dialed")
          .or(`lead_id.eq.${cf.id},property_id.eq.${cf.propertyId}`)
          .order("started_at", { ascending: false })
          .limit(20),
        (supabase.from("event_log") as any)
          .select("id, action, details, created_at")
          .eq("entity_id", cf.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(callsRes.data ?? []).map((c: any) => ({
          id: c.id, type: c.disposition === "sms_outbound" ? "sms" : "call",
          disposition: c.disposition, notes: c.notes,
          created_at: c.started_at, duration_sec: c.duration_sec, phone: c.phone_dialed,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(eventsRes.data ?? []).map((e: any) => ({
          id: e.id, type: "event", disposition: e.action,
          notes: typeof e.details === "object" ? JSON.stringify(e.details) : e.details,
          created_at: e.created_at,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);
      setActivityLog(merged);
    })();
  }, [cf.id, cf.propertyId]);

  const streetViewUrl = prRaw.StreetViewUrl ?? prRaw.PropertyImageUrl ?? (prRaw.Photos?.[0]) ?? null;

  // ── Geocode if no lat/lng from data (same as Comps tab) ──
  const extracted = extractLatLng(cf);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (extracted.lat || extracted.lng || geocodedCoords || !cf.fullAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const q = encodeURIComponent(cf.fullAddress);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
          { headers: { "User-Agent": "SentinelERP/1.0" } },
        );
        const data = await res.json();
        if (cancelled) return;
        if (data?.[0]?.lat && data?.[0]?.lon) {
          setGeocodedCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [extracted.lat, extracted.lng, geocodedCoords, cf.fullAddress]);

  const propLat = extracted.lat ?? geocodedCoords?.lat ?? null;
  const propLng = extracted.lng ?? geocodedCoords?.lng ?? null;

  // ── Clickable Street View → Google Maps ──
  const streetViewLink = propLat && propLng ? getGoogleStreetViewLink(propLat, propLng) : null;

  // ── Satellite tile fallback when no Street View available ──
  const satelliteFallbackUrl = (!streetViewUrl && propLat && propLng) ? getSatelliteTileUrl(propLat, propLng, 18) : null;
  const imageUrl = streetViewUrl ?? satelliteFallbackUrl;
  const imageLabel = streetViewUrl ? "Street View" : "Satellite";
  // ── Small thumbnail for property tile (always satellite for compact view) ──
  const thumbUrl = propLat && propLng ? getSatelliteTileUrl(propLat, propLng, 17) : null;

  const sectionOwner = useRef<HTMLDivElement>(null);
  const sectionSignals = useRef<HTMLDivElement>(null);
  const sectionEquity = useRef<HTMLDivElement>(null);
  const sectionProperty = useRef<HTMLDivElement>(null);
  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ── MAO Formula: ARV × 75% − Repairs (10%) − Assignment Fee ($15K) ──
  const persistedCompArv = (cf.ownerFlags?.comp_arv as number) ?? 0;
  const bestArv = computedArv > 0 ? computedArv : persistedCompArv > 0 ? persistedCompArv : cf.estimatedValue ?? 0;
  const arvSource: "comps" | "avm" = (computedArv > 0 || persistedCompArv > 0) ? "comps" : "avm";
  const compCount = (cf.ownerFlags?.comp_count as number) ?? 0;

  const wholesaleRate = 0.75;
  const repairRate = 0.10;
  const assignmentFee = 15000;
  const wholesaleValue = bestArv > 0 ? Math.round(bestArv * wholesaleRate) : 0;
  const repairEstimate = bestArv > 0 ? Math.round(bestArv * repairRate) : 0;
  const mao = bestArv > 0 ? Math.round(wholesaleValue - repairEstimate - assignmentFee) : null;

  // ── Signal-specific motivation text ──
  const getSignalMotivation = (evtType: string, rd?: Record<string, unknown>): string => {
    switch (evtType) {
      case "pre_foreclosure": case "foreclosure": {
        const d = rd?.ForeclosureRecDate ?? rd?.event_date;
        return d ? `Foreclosure filed ${new Date(String(d)).toLocaleDateString()} — auction pressure` : "Foreclosure filing — auction pressure mounting";
      }
      case "tax_lien": case "tax_delinquency": {
        const amt = rd?.DelinquentAmount ?? rd?.delinquent_amount;
        const inst = rd?.NumberDelinquentInstallments;
        return amt ? `Tax delinquent $${Number(amt).toLocaleString()}${inst ? ` — ${inst} installments behind` : ""}` : "Tax delinquent — penalties accumulating";
      }
      case "divorce": return "Divorce filing — forced partition possible";
      case "probate": case "deceased": return "Estate in probate — heirs likely want quick liquidation";
      case "bankruptcy": return "Bankruptcy filing — motivated to resolve debts";
      case "code_violation": return "Code violations — mounting fines, pressure to sell";
      case "vacant": return "Vacant property — carrying costs with no income";
      case "inherited": return "Inherited property — heirs may want fast liquidation";
      default: return "Distress signal — may be motivated to sell";
    }
  };

  // ── Actual event date extraction from raw_data ──
  const getEventDate = (evt: { created_at: string; raw_data?: Record<string, unknown> }): { date: string; isActual: boolean } => {
    const rd = evt.raw_data ?? {};
    const dateVal = rd.ForeclosureRecDate ?? rd.event_date ?? rd.filing_date ?? rd.recording_date ?? rd.delinquent_date ?? null;
    if (dateVal && typeof dateVal === "string") {
      try { return { date: new Date(dateVal).toLocaleDateString(), isActual: true }; } catch { /* fall through */ }
    }
    return { date: new Date(evt.created_at).toLocaleDateString(), isActual: false };
  };

  // ── Humanize source name ──
  const sourceName = (s?: string): string => {
    switch (s) {
      case "propertyradar": return "PropertyRadar";
      case "attom": return "ATTOM";
      case "manual": return "Manual entry";
      case "bulk_seed": return "Bulk import";
      default: return s || "Unknown";
    }
  };

  const pipelineDays = cf.promotedAt
    ? Math.floor((Date.now() - new Date(cf.promotedAt).getTime()) / 86400000)
    : null;

  const nextAction = useMemo(() => {
    if (isLitigator || hasDncNumbers) return { label: "DO NOT CALL", color: "bg-red-600 text-white", icon: ShieldAlert };
    if (cf.totalCalls === 0 && bestPhone) return { label: "CALL NOW", color: "bg-emerald-500 text-black", icon: Phone };
    if (cf.totalCalls > 0 && cf.lastContactAt) {
      const daysSince = Math.floor((Date.now() - new Date(cf.lastContactAt).getTime()) / 86400000);
      if (daysSince >= 2 && daysSince <= 7) return { label: "FOLLOW UP", color: "bg-amber-500 text-black", icon: PhoneForwarded };
      if (daysSince > 7) return { label: "SEND MAILER", color: "bg-blue-500 text-white", icon: Mail };
    }
    if (!bestPhone && !skipTraced) return { label: "ENRICH FIRST", color: "bg-cyan-500 text-black", icon: Crosshair };
    if (bestPhone) return { label: "CALL NOW", color: "bg-emerald-500 text-black", icon: Phone };
    return { label: "SKIP", color: "bg-zinc-600 text-white", icon: ArrowRight };
  }, [isLitigator, hasDncNumbers, cf.totalCalls, cf.lastContactAt, bestPhone, skipTraced]);

  const [timelinesOpen, setTimelinesOpen] = useState(cf.totalCalls > 0);
  const [metadataOpen, setMetadataOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* ═══ 1. CALL CARD — WHO + NUMBER (hero section) ═══ */}
      <div ref={sectionOwner} className="rounded-[12px] border-2 border-cyan/30 bg-cyan/[0.03] p-4 relative overflow-hidden shadow-[0_0_20px_rgba(0,212,255,0.08)]">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan/[0.05] via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/50 to-transparent" />

        <div className="relative z-10">
          {/* Owner name + badges + next action */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-bold text-foreground truncate">{cf.ownerName || "—"}</p>
                <RelationshipBadge data={{
                  ownerAgeInference: cf.prediction?.ownerAgeInference,
                  lifeEventProbability: cf.prediction?.lifeEventProbability,
                  tags: cf.tags,
                  bestAddress: cf.fullAddress,
                }} />
                {ownerAge && <span className="text-[10px] text-muted-foreground/60">Age ~{ownerAge}</span>}
                {pipelineDays != null && <Badge variant="outline" className="text-[8px] border-white/10 text-muted-foreground/60">{pipelineDays}d</Badge>}
              </div>
            </div>
            {/* Next Best Action as inline badge */}
            <div className={cn("rounded-md px-2.5 py-1.5 flex items-center gap-1.5 text-[10px] font-bold shrink-0 shadow-lg", nextAction.color)}>
              <nextAction.icon className="h-3.5 w-3.5" />
              {nextAction.label}
            </div>
          </div>

          {/* Mailing Address for absentee owners */}
          {mailingAddr && (
            <div className="rounded-[10px] border border-blue-500/15 bg-blue-500/[0.04] p-2.5 mb-3">
              <div className="flex items-start gap-2">
                <MapPinned className="h-3.5 w-3.5 text-blue-400/70 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-blue-400/60 uppercase tracking-widest">Mailing Address (Absentee)</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-foreground truncate">{typeof mailingAddr === "string" ? mailingAddr : JSON.stringify(mailingAddr)}</p>
                    <CopyBtn text={typeof mailingAddr === "string" ? mailingAddr : JSON.stringify(mailingAddr)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Litigator Warning */}
          {isLitigator && (
            <div className="rounded-[10px] border border-red-500/30 bg-red-500/[0.08] p-3 mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-red-400 uppercase">Known TCPA Litigator</p>
                  <p className="text-[10px] text-red-300/70">Do NOT call or text this owner. High litigation risk.</p>
                </div>
              </div>
            </div>
          )}


          {/* Heir Contacts (probate situations) */}
          {heirContacts.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] text-red-400/80 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />Heir / Decision-Maker Contacts
              </p>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {heirContacts.map((heir: any, i: number) => (
                <div key={i} className="rounded-md border border-red-500/15 bg-red-500/[0.04] p-2.5 text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-red-400/60" />
                    <span className="font-semibold text-foreground">{heir.name ?? "Unknown Heir"}</span>
                    {heir.role && <span className="text-muted-foreground">({heir.role})</span>}
                  </div>
                  {heir.phone && (
                    <div className="pl-5 flex items-center gap-1.5">
                      <Phone className="h-2.5 w-2.5 text-cyan/60" />
                      <button onClick={() => onDial(heir.phone)} className="text-cyan hover:underline font-mono text-xs">{heir.phone}</button>
                    </div>
                  )}
                  {heir.email && (
                    <div className="pl-5 flex items-center gap-1.5">
                      <Mail className="h-2.5 w-2.5 text-cyan/60" />
                      <a href={`mailto:${heir.email}`} className="text-cyan hover:underline">{heir.email}</a>
                    </div>
                  )}
                  {heir.mailing && <div className="pl-5 text-muted-foreground">{heir.mailing}</div>}
                </div>
              ))}
            </div>
          )}

          {skipTraceResult && !skipTraceError && (
            <div className={cn("mt-2 text-xs px-3 py-2 rounded-md border", skipTraceResult.startsWith("Found") ? "text-cyan bg-cyan/4 border-cyan/15" : "text-red-400 bg-red-500/5 border-red-500/20")}>
              <div className="flex items-center justify-between gap-2">
                <span>{skipTraceResult}</span>
                {skipTraceMs != null && (
                  <span className={cn("font-mono text-[10px] shrink-0 px-1.5 py-0.5 rounded", skipTraceMs <= 2000 ? "text-cyan bg-cyan/8" : "text-amber-400 bg-amber-500/10")}>
                    {(skipTraceMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
            </div>
          )}

          {skipTraceError && (
            <div className="mt-2 rounded-[10px] border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-xs font-semibold text-red-400">{skipTraceError.error}</p>
                  {skipTraceError.reason && <p className="text-[11px] text-red-300/80">{skipTraceError.reason}</p>}
                  {skipTraceError.address_issues && skipTraceError.address_issues.length > 0 && (
                    <div className="space-y-0.5">
                      {skipTraceError.address_issues.map((issue, i) => (
                        <p key={i} className="text-[10px] text-amber-400/80 flex items-center gap-1">
                          <span className="text-amber-400">&#9679;</span>{issue}
                        </p>
                      ))}
                    </div>
                  )}
                  {skipTraceError.suggestion && <p className="text-[11px] text-cyan/70 italic">{skipTraceError.suggestion}</p>}
                  {skipTraceError.tier_reached && <p className="text-[10px] text-muted-foreground/50 font-mono">Lookup stopped at: {skipTraceError.tier_reached}</p>}
                </div>
                {skipTraceMs != null && (
                  <span className="font-mono text-[10px] shrink-0 px-1.5 py-0.5 rounded text-red-400 bg-red-500/10">
                    {(skipTraceMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
              <Button
                size="sm"
                onClick={onManualSkipTrace}
                disabled={skipTracing}
                className="w-full gap-2 bg-amber-600 hover:bg-amber-500 text-white border-0 shadow-[0_0_14px_rgba(245,158,11,0.25)] hover:shadow-[0_0_22px_rgba(245,158,11,0.4)] transition-all"
              >
                {skipTracing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Manual Skip Trace — Force Partial Lookup
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 2. COMPLIANCE GATE — DNC / Litigator ═══ */}
      {(isLitigator || hasDncNumbers) && (
        <div className="rounded-[10px] border border-red-500/40 bg-red-500/[0.12] p-3 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-400 uppercase tracking-wide">
              {isLitigator ? "TCPA Litigator — DO NOT CONTACT" : "DNC Numbers Detected"}
            </p>
            <p className="text-[10px] text-red-300/70 mt-0.5">
              {isLitigator ? "High litigation risk. No calls, texts, or mailers to this owner." : "One or more phone numbers are on the DNC list. Check before dialing."}
            </p>
          </div>
        </div>
      )}

      {/* ═══ 3. DISTRESS SIGNALS + EXTERNAL LINKS — side by side ═══ */}
      <div className="flex gap-3">
        {/* Distress Signals — left half */}
        <div ref={sectionSignals} className="flex-1 min-w-0 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-orange-400" />
              <p className="text-[10px] text-orange-400/80 uppercase tracking-wider font-semibold">Distress Signals</p>
            </div>
            {/* Deep Crawl button */}
            <button
              onClick={deepCrawlResult && !deepCrawling ? () => setDeepCrawlExpanded(!deepCrawlExpanded) : executeDeepCrawl}
              disabled={deepCrawling}
              className={cn(
                "h-6 px-2.5 rounded-md text-[9px] font-semibold border flex items-center gap-1 transition-colors",
                deepCrawlResult && !deepCrawling
                  ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400 hover:bg-emerald-500/[0.12]"
                  : "border-amber-500/30 bg-amber-500/[0.06] text-amber-400 hover:bg-amber-500/[0.12]"
              )}
            >
              {deepCrawling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              {deepCrawling ? "Deep Crawling..." : deepCrawlResult ? "Deep Crawl Results" : "~120s Deep Crawl"}
            </button>
          </div>
          {distressEvents.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {distressEvents.slice(0, 6).map((evt) => {
                const cfg = DISTRESS_CFG[evt.event_type];
                const EvtIcon = cfg?.icon ?? AlertTriangle;
                const evtDate = getEventDate(evt);
                const daysAgo = Math.floor((Date.now() - new Date(evt.created_at).getTime()) / 86400000);
                const isRecent = daysAgo <= 30;
                const motivation = getSignalMotivation(evt.event_type, evt.raw_data ?? undefined);
                return (
                  <span
                    key={evt.id}
                    title={`${motivation}\nPer ${sourceName(evt.source)} · ${evtDate.isActual ? "filed" : "detected"} ${evtDate.date}`}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border cursor-default transition-colors",
                      cfg?.color ?? "text-cyan/70 bg-cyan/[0.06] border-cyan/20",
                      isRecent && "ring-1 ring-orange-400/30"
                    )}
                  >
                    <EvtIcon className="h-2.5 w-2.5 shrink-0" />
                    {cfg?.label ?? evt.event_type.replace(/_/g, " ")}
                    <span className="text-[8px] opacity-60">· {evtDate.date.replace(/\/\d{4}$/, "")}</span>
                    {isRecent && <Flame className="h-2.5 w-2.5 text-red-400 shrink-0" />}
                  </span>
                );
              })}
              {distressEvents.length > 6 && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold border border-white/10 text-muted-foreground bg-white/[0.03]">
                  +{distressEvents.length - 6} more
                </span>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/50">No distress signals detected</p>
          )}
        </div>

        {/* External Links + County Records — right half */}
        <div className="flex-1 min-w-0 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">External Links</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {cf.radarId && (
              <a href={`https://app.propertyradar.com/properties/${cf.radarId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
                <Radar className="h-2.5 w-2.5" />PropertyRadar
              </a>
            )}
            {(() => {
              const listingUrl = String(cf.ownerFlags?.listing_url ?? cf.ownerFlags?.link ?? "");
              return listingUrl ? (
                <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-orange-400/80 hover:text-orange-400 transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Listing
                </a>
              ) : null;
            })()}
            {cf.fullAddress && (
              <>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cf.fullAddress)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
                  <Map className="h-2.5 w-2.5" />Maps
                </a>
                <a href={`https://www.zillow.com/homes/${encodeURIComponent(cf.fullAddress)}_rb/`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Zillow
                </a>
                <a href={`https://www.redfin.com/search#query=${encodeURIComponent(cf.fullAddress)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-cyan/70 hover:text-cyan transition-colors">
                  <ExternalLink className="h-2.5 w-2.5" />Redfin
                </a>
              </>
            )}
          </div>
          {/* County Records */}
          {(() => {
            const countyKey = cf.county?.toLowerCase().replace(/\s+county$/i, "").trim() ?? "";
            const countyInfo = COUNTY_LINKS[countyKey];
            if (countyInfo) {
              return (
                <div className="space-y-1.5 pt-2 mt-2 border-t border-white/[0.06]">
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{countyInfo.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <a href={countyInfo.gis(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                        <Map className="h-2.5 w-2.5 text-cyan/60" />GIS
                      </Button>
                    </a>
                    <a href={countyInfo.assessor(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                        <Building className="h-2.5 w-2.5 text-cyan/60" />Assessor
                      </Button>
                    </a>
                    {countyInfo.treasurer && (
                      <a href={countyInfo.treasurer(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                          <DollarSign className="h-2.5 w-2.5 text-cyan/60" />Tax
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              );
            }
            if (cf.apn && cf.county) {
              const searchQ = encodeURIComponent(`${cf.apn} ${cf.county} county ${cf.state} property records`);
              return (
                <div className="pt-2 mt-2 border-t border-white/[0.06]">
                  <a href={`https://www.google.com/search?q=${searchQ}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1 text-[9px] h-6 px-2">
                      <Search className="h-2.5 w-2.5 text-cyan/60" />{cf.county} Records
                    </Button>
                  </a>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* ═══ 3b. DEEP CRAWL RESULTS (collapsible) ═══ */}
      <AnimatePresence>
        {deepCrawlResult && deepCrawlExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <DeepCrawlPanel result={deepCrawlResult} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 4. PROPERTY SNAPSHOT — Clickable Street View + Address + Badges ═══ */}
      <div ref={sectionProperty} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {imageUrl && (
          <a
            href={streetViewLink ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block h-40 group cursor-pointer"
            onClick={(e) => { if (!streetViewLink) e.preventDefault(); }}
          >
            <img
              src={imageUrl}
              alt="Property"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,7,13,0.85)] via-[rgba(7,7,13,0.2)] to-transparent pointer-events-none" />
            {streetViewLink && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <ExternalLink className="h-3 w-3" />{streetViewUrl ? "Open Street View" : "Open in Google Maps"}
                </span>
              </div>
            )}
            <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between pointer-events-none">
              <div className="flex items-center gap-2.5 text-white">
                {cf.bedrooms != null && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">{cf.bedrooms}bd / {cf.bathrooms ?? "?"}ba</span>
                )}
                {cf.sqft != null && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">{cf.sqft.toLocaleString()} sqft</span>
                )}
                {cf.yearBuilt && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">Built {cf.yearBuilt}</span>
                )}
                {cf.lotSize && (
                  <span className="text-xs font-bold bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded">{cf.lotSize.toLocaleString()} lot</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[9px] text-white/50">
                <ImageIcon className="h-2.5 w-2.5" />{streetViewLink ? `Click to explore · ${imageLabel}` : imageLabel}
              </div>
            </div>
          </a>
        )}
        <div className="p-4 space-y-3">
          {/* Address + County + APN — with satellite thumbnail on the right */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-cyan/60 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">{cf.fullAddress || "—"}</p>
                    {cf.fullAddress && <CopyBtn text={cf.fullAddress} />}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {cf.county && <span className="text-[10px] text-muted-foreground">{cf.county} County</span>}
                    {cf.apn && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono flex items-center gap-1">
                        APN: {cf.apn} <CopyBtn text={cf.apn} />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Property type + stats */}
              {(cf.propertyType || cf.bedrooms != null || cf.sqft != null) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {cf.propertyType && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      <Building className="h-2.5 w-2.5" />{cf.propertyType}
                    </span>
                  )}
                  {!imageUrl && cf.bedrooms != null && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.bedrooms}bd / {cf.bathrooms ?? "?"}ba
                    </span>
                  )}
                  {!imageUrl && cf.sqft != null && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.sqft.toLocaleString()} sqft
                    </span>
                  )}
                  {!imageUrl && cf.yearBuilt && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      Built {cf.yearBuilt}
                    </span>
                  )}
                  {!imageUrl && cf.lotSize && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                      {cf.lotSize.toLocaleString()} lot
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Satellite / Street View thumbnail on the right */}
            {(thumbUrl || streetViewUrl) && (
              <a
                href={streetViewLink ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cf.fullAddress ?? "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 relative group rounded-lg overflow-hidden border border-white/[0.08] hover:border-cyan/30 transition-colors"
              >
                <img
                  src={streetViewUrl ?? thumbUrl ?? ""}
                  alt="Property"
                  className="w-[120px] h-[90px] object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center gap-1 text-[8px] text-white/70 pointer-events-none">
                  <ImageIcon className="h-2 w-2" />{streetViewUrl ? "Street View" : "Satellite"}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <ExternalLink className="h-3.5 w-3.5 text-white drop-shadow-md" />
                </div>
              </a>
            )}
          </div>

          {/* Distress type pill badges */}
          {(cf.tags.length > 0 || warningFlags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {cf.tags.filter((t) => !t.startsWith("score-")).map((tag) => {
                const cfg = DISTRESS_CFG[tag];
                return (
                  <span key={tag} className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                    cfg?.color ?? "text-cyan/70 bg-cyan/[0.06] border-cyan/20"
                  )}>
                    {cfg?.label ?? tag.replace(/_/g, " ")}
                  </span>
                );
              })}
              {warningFlags.map((f) => (
                <span key={f.label} className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider", f.color)}>
                  <AlertTriangle className="h-2.5 w-2.5" />{f.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ 5. MAO BREAKDOWN — Full formula so agents trust the math ═══ */}
      {mao != null && mao > 0 && (
        <div className="rounded-[12px] border border-cyan/20 bg-cyan/[0.03] p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-cyan" />
              <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">MAO Breakdown</p>
            </div>
            <span className="text-[9px] text-muted-foreground/50 italic">
              {arvSource === "comps" ? `Based on ${compCount || "selected"} comps` : "Based on AVM estimate"}
            </span>
          </div>

          <div className="space-y-1 font-mono text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>ARV ({arvSource === "comps" ? "comps" : "AVM"})</span>
              <span className="text-foreground font-semibold">{formatCurrency(bestArv)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>× 75% wholesale</span>
              <span className="text-foreground">{formatCurrency(wholesaleValue)}</span>
            </div>
            <div className="flex items-center justify-between text-red-400/70">
              <span>− Repairs (est. 10%)</span>
              <span>−{formatCurrency(repairEstimate)}</span>
            </div>
            <div className="flex items-center justify-between text-red-400/70">
              <span>− Assignment fee</span>
              <span>−{formatCurrency(assignmentFee)}</span>
            </div>
            <div className="border-t border-white/[0.08] pt-1.5 mt-1 flex items-center justify-between">
              <span className="text-cyan font-bold text-sm">MAO</span>
              <span className="text-neon font-bold text-lg" style={{ textShadow: "0 0 12px rgba(0,212,255,0.3)" }}>{formatCurrency(mao)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 6. LEAD INTELLIGENCE — 4 Tiles ═══ */}
      <div className="rounded-[12px] border border-cyan/15 bg-cyan/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">Lead Intelligence</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Composite Score */}
          <button
            type="button"
            onClick={() => setScoreBreakdown("composite")}
            className={cn("rounded-[10px] border p-3 text-left transition-all cursor-pointer hover:bg-white/[0.04] group relative overflow-hidden", tc.border, tc.hoverBorder)}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center justify-between mb-1 relative z-10">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Composite Score</p>
              <span className="text-[8px] text-cyan/40 group-hover:text-cyan/70 transition-colors">drill &rarr;</span>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <p className="text-3xl font-black tabular-nums" style={{ textShadow: `0 0 12px ${tc.glow}` }}>{cf.compositeScore}</p>
              <div>
                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider", tc.text, `${tc.bar}/20`)}>{tier.toUpperCase()}</span>
                <p className="text-[9px] text-muted-foreground/50 mt-0.5">{cf.tags.length} signal{cf.tags.length !== 1 ? "s" : ""} stacked</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-secondary mt-2 overflow-hidden relative z-10">
              <div className={cn("h-full rounded-full transition-all", tc.bar)} style={{ width: `${Math.min(cf.compositeScore, 100)}%` }} />
            </div>
          </button>

          {/* Equity & Spread */}
          <button
            type="button"
            onClick={() => scrollTo(sectionEquity)}
            className={cn("rounded-[10px] border p-3 relative overflow-hidden text-left transition-all cursor-pointer hover:bg-white/[0.04] group",
              equityIsGreen ? "border-emerald-500/20 bg-emerald-500/[0.04] hover:border-emerald-500/30" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]"
            )}
          >
            {equityIsGreen && <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.06] to-transparent pointer-events-none" />}
            <div className="flex items-center justify-between mb-1 relative z-10">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Equity &amp; Spread</p>
              <span className="text-[8px] text-emerald-400/40 group-hover:text-emerald-400/70 transition-colors">details &rarr;</span>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <p className={cn("text-3xl font-black tabular-nums", equityIsGreen ? "text-emerald-400" : "text-foreground")}
                style={{ textShadow: equityIsGreen ? "0 0 16px rgba(52,211,153,0.35)" : undefined }}>
                {cf.equityPercent != null ? `${cf.equityPercent}%` : "—"}
              </p>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                {cf.estimatedValue != null && <p>AVM {formatCurrency(cf.estimatedValue)}</p>}
                {cf.availableEquity != null && <p>{formatCurrency(cf.availableEquity)} avail.</p>}
                {estimatedOwed != null && <p>Owed ~{formatCurrency(estimatedOwed)}</p>}
              </div>
            </div>
            {roomLabel && (
              <p className={cn("text-[9px] mt-1.5 relative z-10 font-semibold", roomColor.split(" ")[0])}>
                {roomLabel === "HIGH SPREAD" ? "Room to negotiate — strong equity" : roomLabel === "MODERATE" ? "Some room — watch margins" : "Tight spread — proceed with caution"}
              </p>
            )}
          </button>

          {/* Signal Freshness */}
          <button
            type="button"
            onClick={() => scrollTo(sectionSignals)}
            className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-all cursor-pointer hover:bg-white/[0.04] hover:border-white/[0.12] group"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Signal Freshness</p>
              <span className="text-[8px] text-orange-400/40 group-hover:text-orange-400/70 transition-colors">timeline &rarr;</span>
            </div>
            {freshestEvent ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-black text-orange-400" style={{ textShadow: "0 0 12px rgba(251,146,60,0.3)" }}>
                    {freshestDays != null && freshestDays <= 0 ? "Today" : `${freshestDays}d`}
                  </p>
                  <p className="text-[9px] text-muted-foreground/50">since newest</p>
                </div>
                <p className="text-[9px] text-orange-300/70 mt-1 font-semibold">
                  {freshestDays != null && freshestDays <= 7 ? "Very fresh — call ASAP before competitors" :
                   freshestDays != null && freshestDays <= 30 ? "Recent signal — still a warm window" :
                   "Aging signal — may need re-verification"}
                </p>
              </>
            ) : cf.tags.length > 0 ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400/50" />
                <p className="text-xs text-muted-foreground/60">{cf.tags.length} signal{cf.tags.length !== 1 ? "s" : ""} detected</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/40 italic">No signals</p>
            )}
          </button>

          {/* Owner Situation */}
          <button
            type="button"
            onClick={() => scrollTo(sectionOwner)}
            className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 text-left transition-all cursor-pointer hover:bg-white/[0.04] hover:border-white/[0.12] group"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Owner Situation</p>
              <span className="text-[8px] text-cyan/40 group-hover:text-cyan/70 transition-colors">contact &rarr;</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {cf.isAbsentee ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">ABSENTEE</span>
                ) : (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">OCCUPIED</span>
                )}
                {cf.isFreeClear && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">FREE &amp; CLEAR</span>}
                {cf.isVacant && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">VACANT</span>}
              </div>
              <p className="text-[9px] text-muted-foreground/70 font-semibold">
                {cf.isAbsentee && ownerAge && ownerAge >= 65 ? "Elderly absentee — likely estate/caretaker situation" :
                 cf.isAbsentee ? "Absentee owner — may be motivated to offload" :
                 cf.isFreeClear ? "Free & clear — no mortgage pressure, but no urgency either" :
                 yearsOwned != null && yearsOwned >= 20 ? `${yearsOwned}yr owner — long tenure, may be ready to move` :
                 ownerAge ? `Owner ~${ownerAge} — ${ownerAge >= 65 ? "senior, life transition likely" : "younger owner"}` :
                 "Standard owner situation"}
              </p>
            </div>
          </button>
        </div>
      </div>

      {scoreBreakdown && (
        <ScoreBreakdownModal cf={cf} scoreType={scoreBreakdown} onClose={() => setScoreBreakdown(null)} />
      )}

      {/* ── Call Playbook — Grok AI (upgraded pre-call brief) ── */}
      <div className="rounded-[12px] border border-purple-500/20 bg-purple-500/[0.04] p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.06] via-transparent to-cyan/[0.03] pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />

        <div className="flex items-center gap-2 mb-3 relative z-10">
          <div className="h-7 w-7 rounded-[8px] bg-purple-500/15 flex items-center justify-center">
            <Brain className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <p className="text-[11px] text-purple-300 uppercase tracking-wider font-semibold">Call Playbook</p>
          <Badge variant="outline" className="text-[8px] border-purple-500/20 text-purple-400/60 ml-1">GROK AI</Badge>
          {briefLoading && <Loader2 className="h-3 w-3 text-purple-400 animate-spin ml-auto" />}
          {!briefLoading && (
            <button
              onClick={regenerateBrief}
              className="ml-auto p-1 rounded-md hover:bg-purple-500/10 transition-colors text-purple-400/50 hover:text-purple-400"
              title="Regenerate playbook"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="relative z-10 space-y-3">
          {brief ? (
            <>
              {/* Key Bullets */}
              <div className="space-y-1.5">
                {brief.bullets.map((bullet, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-purple-400 mt-0.5 shrink-0">&#9670;</span>
                    <p className="text-foreground/90 leading-relaxed">{bullet}</p>
                  </div>
                ))}
              </div>

              {/* Suggested Opener */}
              {brief.suggestedOpener && (
                <div className="pt-2 border-t border-purple-500/10">
                  <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1">Suggested Opener</p>
                  <p className="text-xs text-foreground/80 italic leading-relaxed">&ldquo;{brief.suggestedOpener}&rdquo;</p>
                </div>
              )}

              {/* Talking Points */}
              {brief.talkingPoints.length > 0 && (
                <div className="pt-2 border-t border-purple-500/10">
                  <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1.5">Talking Points</p>
                  <div className="space-y-1">
                    {brief.talkingPoints.map((tp, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-cyan/60 mt-0.5 shrink-0 text-[10px]">{i + 1}.</span>
                        <p className="text-foreground/80 leading-relaxed">{tp}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Objections & Rebuttals */}
              {brief.objections.length > 0 && (
                <div className="pt-2 border-t border-purple-500/10">
                  <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1.5">Likely Objections</p>
                  <div className="space-y-2">
                    {brief.objections.map((obj, i) => (
                      <div key={i} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                        <p className="text-xs text-red-300/80 font-medium">&ldquo;{obj.objection}&rdquo;</p>
                        <p className="text-xs text-emerald-300/80 mt-1 pl-3 border-l-2 border-emerald-500/20">{obj.rebuttal}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Negotiation Anchor */}
              {brief.negotiationAnchor && (
                <div className="pt-2 border-t border-purple-500/10">
                  <p className="text-[9px] text-purple-400/50 uppercase tracking-widest mb-1">Negotiation Anchor</p>
                  <p className="text-xs text-neon/90 font-semibold">{brief.negotiationAnchor}</p>
                </div>
              )}

              {/* Watch-Outs */}
              {brief.watchOuts.length > 0 && (
                <div className="pt-2 border-t border-purple-500/10">
                  <p className="text-[9px] text-red-400/50 uppercase tracking-widest mb-1">Watch-Outs</p>
                  <div className="space-y-1">
                    {brief.watchOuts.map((wo, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-amber-400/80">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <p>{wo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : briefLoading ? (
            <div className="flex items-center justify-center py-4 gap-2">
              <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
              <span className="text-xs text-purple-300/60">Generating playbook…</span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/40 italic py-2">Grok AI playbook will generate automatically when data is available</p>
          )}
        </div>
      </div>

      {/* ═══ 8. CALL HISTORY + AI NOTES (merged) ═══ */}
      {(cf.totalCalls > 0 || cf.nextCallScheduledAt || summaryNotes.length > 0) && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <PhoneForwarded className="h-3.5 w-3.5 text-cyan" />
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Call History &amp; Notes</p>
            {cf.totalCalls > 0 && <span className="text-[10px] text-cyan/60 ml-auto font-medium">{getSequenceLabel(cf.callSequenceStep)}</span>}
          </div>

          {cf.totalCalls > 0 && (
            <>
              <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${getSequenceProgress(cf.callSequenceStep) * 100}%`,
                    background: "linear-gradient(90deg, rgba(0,229,255,0.6), rgba(0,255,136,0.6))",
                    boxShadow: "0 0 8px rgba(0,229,255,0.3)",
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <Phone className="h-3 w-3 text-cyan mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground text-glow-number">{cf.totalCalls}</p>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Total Calls</p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <PhoneForwarded className="h-3 w-3 text-emerald-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-emerald-400 text-glow-number">{cf.liveAnswers}</p>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Live Answers</p>
                </div>
                <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 text-center">
                  <Voicemail className="h-3 w-3 text-blue-400 mx-auto mb-1" />
                  <p className="text-lg font-bold text-blue-400 text-glow-number">{cf.voicemailsLeft}</p>
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Voicemails</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {cf.lastContactAt && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                    <Clock className="h-3 w-3" />
                    <span>Last: {new Date(cf.lastContactAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(cf.lastContactAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                )}
                {cf.nextCallScheduledAt && (
                  <div className="flex items-center gap-1.5 text-[10px] text-cyan/70 ml-auto">
                    <Calendar className="h-3 w-3" />
                    <span>Next: {new Date(cf.nextCallScheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(cf.nextCallScheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* AI Call Notes inline */}
          {summaryNotes.length > 0 && (
            <>
              {cf.totalCalls > 0 && <div className="border-t border-white/[0.06]" />}
              <button
                onClick={() => setNotesExpanded(!notesExpanded)}
                className="w-full flex items-center gap-2 text-left"
              >
                <Zap className="h-3.5 w-3.5 text-purple-400" />
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">AI Call Notes</p>
                <Badge variant="outline" className="text-[9px] ml-1 border-purple-500/20 text-purple-400/70">{summaryNotes.length}</Badge>
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 ml-auto transition-transform", notesExpanded && "rotate-90")} />
              </button>

              <AnimatePresence>
                {notesExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden space-y-2"
                  >
                    {summaryNotes.map((note) => (
                      <div key={note.id} className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-semibold uppercase text-purple-400/60">{note.disposition}</span>
                          <span className="text-[9px] text-muted-foreground/40">
                            {new Date(note.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {" "}
                            {new Date(note.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                          {note.duration_sec > 0 && (
                            <span className="text-[9px] text-muted-foreground/40 ml-auto">{Math.floor(note.duration_sec / 60)}:{(note.duration_sec % 60).toString().padStart(2, "0")}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed whitespace-pre-line">{note.ai_summary}</p>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {!notesExpanded && summaryNotes[0] && (
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-3 whitespace-pre-line">{summaryNotes[0].ai_summary}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ 9. PROPERTY DETAILS — Tax/Transfer + Predictive (no address — moved to Snapshot) ═══ */}
      <div ref={sectionEquity} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Home className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Property Details</p>
          {(cf.bedrooms == null || cf.sqft == null || cf.yearBuilt == null) && (
            <Button
              size="sm"
              variant="outline"
              className="text-[10px] h-6 gap-1 ml-auto text-cyan border-cyan/20 hover:bg-cyan/10"
              onClick={onAutofill}
              disabled={autofilling}
            >
              {autofilling ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
              {autofilling ? "Looking up..." : "Autofill Details"}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Tax & Transfer Details */}
          {(prRaw.AssessedValue || lastTransferType || cf.lastSalePrice) && (
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 col-span-2">
              <div className="flex items-start gap-2">
                <Banknote className="h-3.5 w-3.5 text-cyan/60 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">Tax &amp; Transfer</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {prRaw.AssessedValue && (
                      <p className="text-muted-foreground">Tax Assessed: <span className="text-foreground font-medium">{formatCurrency(Number(prRaw.AssessedValue))}</span></p>
                    )}
                    {cf.lastSalePrice != null && (
                      <p className="text-muted-foreground">Last Sale: <span className="text-foreground font-medium">{formatCurrency(cf.lastSalePrice)}</span>{cf.lastSaleDate ? ` (${new Date(cf.lastSaleDate).toLocaleDateString()})` : ""}</p>
                    )}
                    {lastTransferType && (
                      <p className="text-muted-foreground">Transfer: <span className="text-foreground font-medium">{lastTransferType}</span>{lastTransferValue ? ` — ${formatCurrency(lastTransferValue)}` : ""}</p>
                    )}
                    {prRaw.DelinquentYear && (
                      <p className="text-amber-400">Delinquent: <span className="font-medium">Year {prRaw.DelinquentYear}</span>{prRaw.NumberDelinquentInstallments ? ` (${prRaw.NumberDelinquentInstallments} installments)` : ""}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Predictive Intelligence */}
          <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 col-span-2">
            <div className="flex items-start gap-2">
              <Zap className="h-3.5 w-3.5 text-purple-400/70 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">Predictive Intelligence</p>
                {cf.prediction ? (
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Distress In</p>
                      <p className="text-lg font-bold text-orange-400" style={{ textShadow: "0 0 10px rgba(251,146,60,0.3)" }}>~{cf.prediction.daysUntilDistress}d</p>
                    </div>
                    <div className="h-8 w-px bg-white/[0.06]" />
                    <div>
                      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Confidence</p>
                      <p className="text-lg font-bold text-cyan" style={{ textShadow: "0 0 10px rgba(0,212,255,0.3)" }}>{cf.prediction.confidence}%</p>
                    </div>
                    <div className="h-8 w-px bg-white/[0.06]" />
                    <div>
                      <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Pred Score</p>
                      <p className="text-lg font-bold text-foreground">{cf.prediction.predictiveScore}</p>
                    </div>
                    {cf.prediction.lifeEventProbability != null && cf.prediction.lifeEventProbability > 0.10 && (
                      <>
                        <div className="h-8 w-px bg-white/[0.06]" />
                        <div>
                          <p className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">Life Event</p>
                          <p className="text-lg font-bold text-purple-400" style={{ textShadow: "0 0 10px rgba(168,85,247,0.3)" }}>{Math.round(cf.prediction.lifeEventProbability * 100)}%</p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground/40 italic">Predictive data not yet available — enrich to generate</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 10. EDIT DETAILS ═══ */}
      {canEdit && (
        <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-semibold text-cyan bg-cyan/[0.06] border border-cyan/20 hover:bg-cyan/[0.12] hover:border-cyan/30 shadow-[0_0_10px_rgba(0,212,255,0.06)] hover:shadow-[0_0_18px_rgba(0,212,255,0.12)] transition-all active:scale-[0.97]">
          <Pencil className="h-3 w-3" />Edit Details
        </button>
      )}

      {/* ═══ 11. METADATA — Collapsible ═══ */}
      <div className="rounded-[12px] border border-glass-border bg-secondary/10">
        <button
          onClick={() => setMetadataOpen(!metadataOpen)}
          className="w-full flex items-center gap-2 p-4 text-left"
        >
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Metadata</p>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 ml-auto transition-transform", metadataOpen && "rotate-180")} />
        </button>
        <AnimatePresence>
          {metadataOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-x-6">
                  <InfoRow icon={Zap} label="Source" value={cf.source} />
                  <InfoRow icon={Clock} label="Promoted" value={cf.promotedAt ? new Date(cf.promotedAt).toLocaleDateString() : null} />
                  <InfoRow icon={Clock} label="Last Contact" value={cf.lastContactAt ? new Date(cf.lastContactAt).toLocaleDateString() : null} />
                  <InfoRow icon={Calendar} label="Follow-Up" value={cf.followUpDate ? new Date(cf.followUpDate).toLocaleDateString() : null} />
                  <InfoRow icon={Copy} label="Model Version" value={cf.modelVersion} />
                  <InfoRow icon={ExternalLink} label="Radar ID" value={cf.radarId} mono />
                  <InfoRow icon={Clock} label="Last Enriched" value={cf.ownerFlags?.last_enriched ? new Date(cf.ownerFlags.last_enriched as string).toLocaleString() : (cf.enriched ? "Enriched (time unknown)" : null)} highlight={!!cf.ownerFlags?.last_enriched} />
                </div>
                {cf.notes && (
                  <div className="mt-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
                    <p className="text-xs text-foreground/80">{cf.notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ 12. ACTIVITY TIMELINE — Collapsible ═══ */}
      {activityLog.length > 0 && (
        <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02]">
          <button
            onClick={() => setTimelinesOpen(!timelinesOpen)}
            className="w-full flex items-center gap-2 p-4 text-left"
          >
            <Clock className="h-3.5 w-3.5 text-cyan" />
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Activity Timeline</p>
            <Badge variant="outline" className="text-[9px] ml-1">{activityLog.length}</Badge>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground/40 ml-auto transition-transform", timelinesOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {timelinesOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                  {activityLog.map((entry) => {
                    const isCall = entry.type === "call";
                    const isSms = entry.type === "sms";
                    const EntryIcon = isCall ? Phone : isSms ? MessageSquare : Zap;
                    const iconColor = isCall ? "text-cyan" : isSms ? "text-emerald-400" : "text-purple-400";
                    return (
                      <div key={entry.id} className="flex items-center gap-2.5 px-3 py-2 rounded-[8px] border border-white/[0.04] bg-white/[0.02] text-xs">
                        <EntryIcon className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-foreground capitalize">{entry.disposition?.replace(/_/g, " ") ?? entry.type}</span>
                          {entry.phone && <span className="text-muted-foreground/50 ml-1.5 font-mono">***{entry.phone.slice(-4)}</span>}
                          {entry.duration_sec != null && entry.duration_sec > 0 && (
                            <span className="text-muted-foreground/50 ml-1.5">{Math.floor(entry.duration_sec / 60)}:{(entry.duration_sec % 60).toString().padStart(2, "0")}</span>
                          )}
                        </div>
                        <p className="text-[9px] text-muted-foreground/40 shrink-0">{new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* External links moved to section 3 (side-by-side with distress signals) */}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab: PropertyRadar Data
// ═══════════════════════════════════════════════════════════════════════

function PropertyRadarTab({ cf }: { cf: ClientFile }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;
  const entries = Object.entries(prRaw).filter(([, v]) => v != null && v !== "");
  const hasData = entries.length > 0;

  return (
    <div className="space-y-4">
      <Section title="PropertyRadar Enrichment" icon={Radar}>
        {!hasData ? (
          <div className="text-center py-8 space-y-2">
            <Radar className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No PropertyRadar data available</p>
            <p className="text-xs text-muted-foreground/60">Run Skip Trace to pull enrichment data</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-h-[50vh] overflow-y-auto">
            {entries.map(([key, val]) => (
              <div key={key} className="flex items-start gap-2 py-1">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">{key}</p>
                  <p className="text-xs text-foreground truncate">{typeof val === "object" ? JSON.stringify(val) : String(val)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {cf.radarId && (
        <div className="flex flex-wrap gap-2">
          <a href={`https://app.propertyradar.com/properties/${cf.radarId}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-2 text-xs">
              <ExternalLink className="h-3 w-3" />View on PropertyRadar
            </Button>
          </a>
          <a href={`https://app.propertyradar.com/properties/${cf.radarId}/report`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-2 text-xs">
              <FileText className="h-3 w-3" />Full Property Report
            </Button>
          </a>
        </div>
      )}

      {cf.enriched && (
        <div className="flex items-center gap-2 text-xs text-cyan/70">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Enriched from PropertyRadar{cf.radarId ? ` — RadarID: ${cf.radarId}` : ""}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab: County Records
// ═══════════════════════════════════════════════════════════════════════

function CountyRecordsTab({ cf }: { cf: ClientFile }) {
  const countyKey = cf.county.toLowerCase().replace(/\s+county$/i, "").trim();
  const countyInfo = COUNTY_LINKS[countyKey];
  const searchQuery = encodeURIComponent(`${cf.apn} ${cf.county} county ${cf.state}`);
  const googleSearch = `https://www.google.com/search?q=${searchQuery}+property+records`;

  return (
    <div className="space-y-4">
      <Section title={countyInfo ? countyInfo.name : `${cf.county || "Unknown"} County`} icon={Globe}>
        <div className="grid grid-cols-2 gap-x-6 mb-4">
          <InfoRow icon={Copy} label="APN" value={cf.apn} mono highlight />
          <InfoRow icon={MapPin} label="County" value={cf.county} />
          <InfoRow icon={MapPin} label="Full Address" value={cf.fullAddress} />
          <InfoRow icon={User} label="Owner" value={cf.ownerName} />
        </div>

        {countyInfo ? (
          <div className="space-y-2">
            <a href={countyInfo.gis(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Map className="h-3.5 w-3.5 text-cyan" />GIS / Parcel Map — {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            <a href={countyInfo.assessor(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Building className="h-3.5 w-3.5 text-cyan" />Assessor&apos;s Office — {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            {countyInfo.treasurer && (
              <a href={countyInfo.treasurer(cf.apn ?? "")} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                  <DollarSign className="h-3.5 w-3.5 text-cyan" />Treasurer / Tax Records — {countyInfo.name}
                  <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                </Button>
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground/70">No pre-configured links for this county. Use the search below.</p>
            <a href={googleSearch} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Search className="h-3.5 w-3.5 text-cyan" />Search County Records (Google)
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
          </div>
        )}
      </Section>

      <div className="text-[10px] text-muted-foreground/50 italic">
        Tip: Search the APN <span className="font-mono text-foreground/60">{cf.apn}</span> on the county GIS to pull official parcel data, liens, and tax history.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab: Comps & ARV — Interactive Leaflet Map + PropertyRadar Search
// ═══════════════════════════════════════════════════════════════════════

function SubjectPhotoCarousel({ photos, onSkipTrace }: { photos: string[]; onSkipTrace?: () => void }) {
  const [idx, setIdx] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-2">
        <ImageIcon className="h-5 w-5 text-muted-foreground/40 mb-1" />
        {onSkipTrace ? (
          <button
            onClick={onSkipTrace}
            className="text-[9px] text-neon hover:underline font-medium mt-0.5"
          >
            Enrich for photos
          </button>
        ) : (
          <p className="text-[9px] text-muted-foreground leading-tight">
            Enrich for photos
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[idx]}
        alt={`Property photo ${idx + 1}`}
        className="h-full w-full object-cover"
      />
      {photos.length > 1 && (
        <>
          <button
            onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)}
            className="absolute left-1 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % photos.length)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
            {photos.map((_, i) => (
              <div key={i} className={cn("h-1 w-1 rounded-full transition-colors", i === idx ? "bg-neon" : "bg-white/40")} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Lat/Lng extraction with fallbacks ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLatLng(cf: ClientFile): { lat: number | null; lng: number | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flags = (cf.ownerFlags ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (flags.pr_raw ?? {}) as Record<string, any>;

  const tryParse = (v: unknown): number | null => {
    if (v == null || v === "" || v === "null") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return isNaN(n) || n === 0 ? null : n;
  };

  const lat =
    tryParse(prRaw.Latitude) ??
    tryParse(prRaw.latitude) ??
    tryParse(flags.latitude) ??
    tryParse(flags.lat) ??
    null;

  const lng =
    tryParse(prRaw.Longitude) ??
    tryParse(prRaw.longitude) ??
    tryParse(flags.longitude) ??
    tryParse(flags.lng) ??
    null;

  return { lat, lng };
}

// ── ARV adjustment helpers ────────────────────────────────────────────

const CONDITION_LABELS: Record<number, string> = {
  [-15]: "Poor (–15%)",
  [-10]: "Below Avg (–10%)",
  [-5]: "Fair (–5%)",
  [0]: "Average",
  [5]: "Good (+5%)",
};

function CompsTab({ cf, selectedComps, onAddComp, onRemoveComp, onSkipTrace, computedArv, onArvChange }: {
  cf: ClientFile;
  selectedComps: CompProperty[];
  onAddComp: (comp: CompProperty) => void;
  onRemoveComp: (apn: string) => void;
  onSkipTrace?: () => void;
  computedArv: number;
  onArvChange: (arv: number) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;

  // ── Lat/lng with multi-source fallback + geocoding ──
  const extracted = extractLatLng(cf);
  const [geocodedCoords, setGeocodedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  const lat = extracted.lat ?? geocodedCoords?.lat ?? null;
  const lng = extracted.lng ?? geocodedCoords?.lng ?? null;

  // Auto-geocode via Nominatim on mount if no lat/lng from data
  useEffect(() => {
    if (extracted.lat || extracted.lng || geocodedCoords || !cf.fullAddress) return;
    let cancelled = false;
    (async () => {
      setGeocoding(true);
      setGeocodeError(null);
      try {
        const q = encodeURIComponent(cf.fullAddress);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
          { headers: { "User-Agent": "SentinelERP/1.0" } },
        );
        const data = await res.json();
        if (cancelled) return;
        if (data?.[0]?.lat && data?.[0]?.lon) {
          setGeocodedCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        } else {
          setGeocodeError("Could not geocode address");
        }
      } catch {
        if (!cancelled) setGeocodeError("Geocoding service unavailable");
      } finally {
        if (!cancelled) setGeocoding(false);
      }
    })();
    return () => { cancelled = true; };
  }, [extracted.lat, extracted.lng, geocodedCoords, cf.fullAddress]);

  // ARV adjustment state
  const [conditionAdj, setConditionAdj] = useState(0);
  const [offerPct, setOfferPct] = useState(65);
  const [rehabEst, setRehabEst] = useState(40000);

  const photos = useMemo(() => {
    const urls: string[] = [];
    if (Array.isArray(prRaw.Photos)) urls.push(...prRaw.Photos.filter((u: unknown) => typeof u === "string"));
    if (Array.isArray(prRaw.photos)) urls.push(...prRaw.photos.filter((u: unknown) => typeof u === "string"));
    if (typeof prRaw.PropertyImageUrl === "string" && prRaw.PropertyImageUrl) urls.push(prRaw.PropertyImageUrl);
    if (typeof prRaw.StreetViewUrl === "string" && prRaw.StreetViewUrl) urls.push(prRaw.StreetViewUrl);
    return urls;
  }, [prRaw]);

  // ARV from selected comps using weighted $/sqft methodology
  const subjectSqft = cf.sqft ?? 0;
  const compMetrics = selectedComps
    .filter((c) => (c.lastSalePrice ?? c.avm ?? 0) > 0)
    .map((c) => {
      const price = c.lastSalePrice ?? c.avm ?? 0;
      const ppsqft = c.sqft && c.sqft > 0 ? price / c.sqft : null;
      return { price, sqft: c.sqft ?? 0, ppsqft };
    });

  const sqftComps = compMetrics.filter((m) => m.ppsqft != null);
  let baseArv = 0;
  let arvLow = 0;
  let arvHigh = 0;
  let arvConfidence: "high" | "medium" | "low" = "low";

  if (sqftComps.length > 0 && subjectSqft > 0) {
    const pps = sqftComps.map((m) => m.ppsqft!);
    const avgPps = pps.reduce((a, b) => a + b, 0) / pps.length;
    baseArv = Math.round(avgPps * subjectSqft);
    arvLow = Math.round(Math.min(...pps) * subjectSqft);
    arvHigh = Math.round(Math.max(...pps) * subjectSqft);
    const spread = arvHigh - arvLow;
    arvConfidence = sqftComps.length >= 3 && spread / baseArv < 0.15 ? "high"
      : sqftComps.length >= 2 && spread / baseArv < 0.30 ? "medium" : "low";
  } else if (compMetrics.length > 0) {
    const prices = compMetrics.map((m) => m.price);
    baseArv = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    arvLow = Math.min(...prices);
    arvHigh = Math.max(...prices);
    arvConfidence = compMetrics.length >= 3 ? "medium" : "low";
  } else {
    baseArv = cf.estimatedValue ?? 0;
  }

  const arv = Math.round(baseArv * (1 + conditionAdj / 100));
  const avgPpsqft = sqftComps.length > 0 ? Math.round(sqftComps.reduce((a, m) => a + m.ppsqft!, 0) / sqftComps.length) : null;

  const offer = Math.round(arv * (offerPct / 100));
  const holdingCosts = Math.round(arv * 0.03);
  const sellingCosts = Math.round(arv * 0.08);
  const totalCost = offer + rehabEst + holdingCosts + sellingCosts;
  const profit = arv - totalCost;
  const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

  useEffect(() => { if (arv > 0) onArvChange(arv); }, [arv, onArvChange]);

  if (geocoding) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-10 w-10 text-cyan mx-auto mb-3 animate-spin" />
        <p className="text-sm text-muted-foreground">Geocoding address...</p>
      </div>
    );
  }

  if (!lat || !lng) {
    const handleRetryGeocode = async () => {
      if (!cf.fullAddress) return;
      setGeocoding(true);
      setGeocodeError(null);
      try {
        const q = encodeURIComponent(cf.fullAddress);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
          { headers: { "User-Agent": "SentinelERP/1.0" } },
        );
        const data = await res.json();
        if (data?.[0]?.lat && data?.[0]?.lon) {
          setGeocodedCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        } else {
          setGeocodeError("Could not geocode — try enriching from PropertyRadar");
        }
      } catch {
        setGeocodeError("Geocoding service unavailable");
      } finally {
        setGeocoding(false);
      }
    };

    return (
      <div className="text-center py-12">
        <MapPinned className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-2">
          {geocodeError ?? "No location data available"}
        </p>
        <p className="text-xs text-muted-foreground/60 mb-3">
          This property needs enrichment from PropertyRadar to get latitude/longitude,
          or you can try geocoding the address.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={handleRetryGeocode} className="gap-1.5">
            <MapPinned className="h-3 w-3" /> Retry Geocode
          </Button>
          {onSkipTrace && (
            <Button variant="outline" size="sm" onClick={onSkipTrace} className="gap-1.5">
              <Globe className="h-3 w-3" /> Enrich + Skip Trace
            </Button>
          )}
        </div>
      </div>
    );
  }

  const subject: SubjectProperty = {
    lat, lng, address: cf.fullAddress,
    beds: cf.bedrooms, baths: cf.bathrooms,
    sqft: cf.sqft, yearBuilt: cf.yearBuilt,
    propertyType: cf.propertyType, avm: cf.estimatedValue,
    radarId: cf.radarId, zip: cf.zip, county: cf.county, state: cf.state,
  };

  return (
    <div className="space-y-4">
      {/* Subject property header with photo carousel */}
      <div className="rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] backdrop-blur-xl p-0 flex overflow-hidden">
        <div className="w-44 h-28 shrink-0 border-r border-white/[0.06] bg-white/[0.04]">
          <SubjectPhotoCarousel photos={photos} onSkipTrace={onSkipTrace} />
        </div>
        <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
          <p className="text-sm font-bold truncate" style={{ textShadow: "0 0 8px rgba(0,255,136,0.12)" }}>
            {cf.fullAddress}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
            {cf.bedrooms != null && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{cf.bedrooms} bd</span>}
            {cf.bathrooms != null && <span className="flex items-center gap-1"><Home className="h-3 w-3" />{cf.bathrooms} ba</span>}
            {cf.sqft != null && <span className="flex items-center gap-1"><Ruler className="h-3 w-3" />{cf.sqft.toLocaleString()} sqft</span>}
            {cf.yearBuilt != null && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{cf.yearBuilt}</span>}
            {cf.propertyType && <span className="flex items-center gap-1"><Building className="h-3 w-3" />{cf.propertyType}</span>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px]">
            {cf.estimatedValue != null && (
              <span className="font-semibold text-neon">{formatCurrency(cf.estimatedValue)} AVM</span>
            )}
            {cf.equityPercent != null && (
              <span className="text-muted-foreground">{cf.equityPercent}% equity</span>
            )}
            {cf.sqft != null && cf.estimatedValue != null && (
              <span className="text-muted-foreground">${Math.round(cf.estimatedValue / cf.sqft)}/sqft</span>
            )}
          </div>
        </div>
      </div>

      {/* Interactive map */}
      <CompsMap
        subject={subject}
        selectedComps={selectedComps}
        onAddComp={onAddComp}
        onRemoveComp={onRemoveComp}
      />

      {/* Selected comps table */}
      {selectedComps.length > 0 && (
        <div className="rounded-[10px] border border-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[rgba(12,12,22,0.5)] border-b border-white/[0.06]">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-cyan" />
              Selected Comps ({selectedComps.length})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.04]">
                  <th className="px-2 py-2 font-medium text-muted-foreground w-[52px]"></th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Address</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Beds</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Baths</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Sqft</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Year</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">AVM</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Last Sale</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {selectedComps.map((comp) => {
                  const thumbSrc = comp.photoUrl
                    ?? comp.streetViewUrl
                    ?? (comp.lat && comp.lng ? getSatelliteTileUrl(comp.lat, comp.lng, 17) : null);
                  return (
                  <tr key={comp.apn} className="border-b border-white/[0.06]/50 hover:bg-white/[0.04]">
                    <td className="px-2 py-1.5">
                      {thumbSrc ? (
                        <div className="w-10 h-8 rounded overflow-hidden bg-black/30 border border-white/[0.06]">
                          <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-8 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                          <Home className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <div className="truncate">{comp.streetAddress}</div>
                      {comp.lastSaleDate && (
                        <div className="text-[9px] text-muted-foreground">
                          Sold {new Date(comp.lastSaleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{comp.beds ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{comp.baths ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{comp.sqft?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{comp.yearBuilt ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium text-neon">{comp.avm ? formatCurrency(comp.avm) : "—"}</td>
                    <td className="px-3 py-2 text-right">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => onRemoveComp(comp.apn)} className="text-red-400 hover:text-red-300">
                        <X className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Condition Adjustment slider */}
      <div className="rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Condition Adjustment</p>
          <span className={cn("text-xs font-bold", conditionAdj > 0 ? "text-emerald-400" : conditionAdj < 0 ? "text-red-400" : "text-muted-foreground")}>
            {CONDITION_LABELS[conditionAdj] ?? `${conditionAdj > 0 ? "+" : ""}${conditionAdj}%`}
          </span>
        </div>
        <input type="range" min={-15} max={5} step={5} value={conditionAdj} onChange={(e) => setConditionAdj(Number(e.target.value))} className="w-full h-1.5 accent-[#00d4ff] bg-secondary rounded-full" />
      </div>

      {/* Live ARV + Profit projection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-cyan/15 bg-cyan/4 p-4">
          <p className="text-[10px] font-semibold text-cyan uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            Live ARV
            {selectedComps.length > 0 && (
              <span className={cn("ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                arvConfidence === "high" ? "bg-emerald-500/20 text-emerald-400" :
                arvConfidence === "medium" ? "bg-amber-500/20 text-amber-400" :
                "bg-red-500/20 text-red-400"
              )}>
                {arvConfidence} confidence
              </span>
            )}
          </p>
          {selectedComps.length > 0 ? (
            <div className="space-y-1.5 text-xs">
              {avgPpsqft != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg $/sqft</span>
                  <span className="font-bold text-neon">${avgPpsqft}</span>
                </div>
              )}
              {arvLow > 0 && arvHigh > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Range</span>
                  <span className="font-medium">{formatCurrency(arvLow)} – {formatCurrency(arvHigh)}</span>
                </div>
              )}
              {conditionAdj !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Condition</span>
                  <span className={cn("font-medium", conditionAdj > 0 ? "text-emerald-400" : "text-red-400")}>
                    {conditionAdj > 0 ? "+" : ""}{conditionAdj}%
                  </span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-cyan/15 flex justify-between">
                <span className="font-medium">Estimated ARV</span>
                <span className="font-bold text-neon text-xl" style={{ textShadow: "0 0 10px rgba(0,212,255,0.4)" }}>
                  {formatCurrency(arv)}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground/60 pt-1">
                {avgPpsqft != null ? `Based on ${sqftComps.length} comp${sqftComps.length > 1 ? "s" : ""} × ${subjectSqft.toLocaleString()} sqft` : `Average of ${compMetrics.length} comp sale price${compMetrics.length > 1 ? "s" : ""}`}
              </p>
            </div>
          ) : cf.estimatedValue ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">AVM (pre-comps)</span>
                <span className="font-bold text-neon">{formatCurrency(cf.estimatedValue)}</span>
              </div>
              {conditionAdj !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Condition</span>
                  <span className={cn("font-medium", conditionAdj > 0 ? "text-emerald-400" : "text-red-400")}>
                    {conditionAdj > 0 ? "+" : ""}{conditionAdj}%
                  </span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-cyan/15 flex justify-between">
                <span className="font-medium">Est. ARV</span>
                <span className="font-bold text-neon text-xl" style={{ textShadow: "0 0 10px rgba(0,212,255,0.4)" }}>
                  {formatCurrency(arv)}
                </span>
              </div>
              <p className="text-[9px] text-muted-foreground/60 pt-1">Add comps for a more accurate ARV</p>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">Add comps to calculate</p>
          )}
        </div>

        <div className="rounded-[12px] border border-glass-border bg-secondary/10 p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            Quick Profit Projection
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ARV</span>
              <span className="font-medium">{formatCurrency(arv)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Offer
                <input type="range" min={50} max={80} step={5} value={offerPct} onChange={(e) => setOfferPct(Number(e.target.value))} className="w-14 h-1 accent-[#00d4ff]" />
                <span className="text-[10px] font-mono w-7 text-right">{offerPct}%</span>
              </span>
              <span className="font-medium text-red-400">-{formatCurrency(offer)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Rehab
                <input type="number" value={rehabEst} onChange={(e) => setRehabEst(Number(e.target.value) || 0)} className="w-16 h-5 text-[10px] text-right bg-white/[0.06] border border-white/[0.1] rounded px-1 font-mono" />
              </span>
              <span className="font-medium text-red-400">-{formatCurrency(rehabEst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Holding (3%)</span>
              <span className="font-medium text-red-400">-{formatCurrency(holdingCosts)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selling (8%)</span>
              <span className="font-medium text-red-400">-{formatCurrency(sellingCosts)}</span>
            </div>
            <div className="pt-1.5 mt-1.5 border-t border-white/[0.06] flex justify-between">
              <span className="font-semibold">Net Profit</span>
              <span className={cn("font-bold text-lg", profit >= 0 ? "text-neon" : "text-red-400")} style={profit >= 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.3)" } : {}}>
                {formatCurrency(profit)}
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">ROI</span>
              <span className={cn("font-semibold", roi >= 0 ? "text-neon" : "text-red-400")}>{roi}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab: Offer Calculator
// ═══════════════════════════════════════════════════════════════════════

function OfferCalcTab({ cf, computedArv }: { cf: ClientFile; computedArv: number }) {
  const bestArv = computedArv > 0 ? computedArv : cf.estimatedValue ?? 0;
  const [arv, setArv] = useState(bestArv > 0 ? bestArv.toString() : "");

  // Auto-fill ARV when Comps tab computes one
  useEffect(() => { if (computedArv > 0) setArv(computedArv.toString()); }, [computedArv]);
  const defaultMao = bestArv > 0 ? Math.round(bestArv * 0.75 - 40000).toString() : "";
  const [purchase, setPurchase] = useState(defaultMao);
  const [rehab, setRehab] = useState("40000");
  const [holdMonths, setHoldMonths] = useState("3");
  const [monthlyHold, setMonthlyHold] = useState("1500");
  const [closing, setClosing] = useState("5000");
  const [assignmentFee, setAssignmentFee] = useState("15000");

  const arvNum = parseFloat(arv) || 0;
  const purchaseNum = parseFloat(purchase) || 0;
  const rehabNum = parseFloat(rehab) || 0;
  const holdNum = (parseFloat(holdMonths) || 0) * (parseFloat(monthlyHold) || 0);
  const closingNum = parseFloat(closing) || 0;
  const feeNum = parseFloat(assignmentFee) || 0;

  const mao = arvNum > 0 ? Math.round(arvNum * 0.75 - rehabNum) : 0;
  const totalCosts = purchaseNum + rehabNum + holdNum + closingNum;
  const grossProfit = arvNum - totalCosts;
  const netProfit = grossProfit - feeNum;
  const roi = totalCosts > 0 && purchaseNum > 0 ? ((grossProfit / totalCosts) * 100).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <Section title="Deal Inputs" icon={Calculator}>
        {computedArv > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-cyan/70 mb-2">
            <CheckCircle2 className="h-3 w-3" />
            ARV auto-filled from Comps &amp; ARV tab
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <NumericInput label="ARV (After Repair Value)" value={arv} onChange={setArv} prefix="$" min={0} />
          <NumericInput label="Purchase Price" value={purchase} onChange={setPurchase} prefix="$" min={0} />
          <NumericInput label="Rehab Estimate" value={rehab} onChange={setRehab} prefix="$" min={0} />
          <NumericInput label="Closing Costs" value={closing} onChange={setClosing} prefix="$" min={0} />
          <NumericInput label="Holding Period (months)" value={holdMonths} onChange={setHoldMonths} min={0} max={60} allowDecimals={false} />
          <NumericInput label="Monthly Holding Cost" value={monthlyHold} onChange={setMonthlyHold} prefix="$" min={0} />
          <NumericInput label="Assignment Fee Target" value={assignmentFee} onChange={setAssignmentFee} prefix="$" min={0} />
        </div>
      </Section>

      <Section title="Profit Projection" icon={TrendingUp}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-cyan/20 bg-cyan/4 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">MAO (75% Rule)</p>
            <p className="text-xl font-bold text-neon" style={{ textShadow: "0 0 10px rgba(0,212,255,0.3)" }}>
              {mao > 0 ? formatCurrency(mao) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ARV × 0.75 − Rehab</p>
          </div>
          <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.04] p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Costs</p>
            <p className="text-xl font-bold">{totalCosts > 0 ? formatCurrency(totalCosts) : "—"}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Purchase + Rehab + Hold + Close</p>
          </div>
          <div className={cn("rounded-[10px] border p-3 text-center", grossProfit > 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
            <p className="text-[10px] text-muted-foreground uppercase">Gross Profit</p>
            <p className={cn("text-xl font-bold", grossProfit > 0 ? "text-emerald-400" : "text-red-400")}>
              {arvNum > 0 && purchaseNum > 0 ? formatCurrency(grossProfit) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ROI: {roi != null ? `${roi}%` : "—"}</p>
          </div>
          <div className={cn("rounded-lg border p-3 text-center", netProfit > 0 ? "border-cyan/20 bg-cyan/4" : "border-red-500/30 bg-red-500/5")}>
            <p className="text-[10px] text-muted-foreground uppercase">Net After Assignment</p>
            <p className={cn("text-xl font-bold", netProfit > 0 ? "text-neon" : "text-red-400")} style={netProfit > 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.3)" } : undefined}>
              {arvNum > 0 && purchaseNum > 0 ? formatCurrency(netProfit) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Gross − Assignment Fee</p>
          </div>
        </div>
      </Section>

      {purchaseNum > mao && mao > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Purchase price exceeds MAO by {formatCurrency(purchaseNum - mao)} — negotiate lower or increase ARV.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Tab: Documents / PSA
// ═══════════════════════════════════════════════════════════════════════

function DocumentsTab({ cf, computedArv }: { cf: ClientFile; computedArv: number }) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const bestArv = computedArv > 0 ? computedArv : cf.estimatedValue ?? 0;
  const autoMao = bestArv > 0 ? formatCurrency(Math.round(bestArv * 0.75 - 40000)) : "____________";

  const psaBody = useMemo(() => [
    `REAL ESTATE PURCHASE AND SALE AGREEMENT`,
    ``,
    `Date: ${today}`,
    ``,
    `BUYER: Dominion Homes LLC and/or assigns`,
    `SELLER: ${cf.ownerName}`,
    ``,
    `PROPERTY:`,
    `  Address: ${cf.fullAddress}`,
    `  APN: ${cf.apn}`,
    `  County: ${cf.county}`,
    `  Legal Description: Per county records`,
    ``,
    `PURCHASE PRICE: ${autoMao}`,
    `EARNEST MONEY: $____________`,
    `CLOSING DATE: ____________`,
    ``,
    `TERMS AND CONDITIONS:`,
    `1. This agreement is subject to buyer's inspection within 10 business days.`,
    `2. Seller shall deliver clear and marketable title at closing.`,
    `3. Buyer reserves the right to assign this contract per RCW 61.40.010.`,
    `4. All required disclosures per Washington State law shall be provided.`,
    `5. Closing shall occur at a mutually agreed title company.`,
    ``,
    `DISCLOSURE: Buyer is a licensed real estate wholesaler operating under`,
    `RCW 61.40.010 (Washington Wholesaling Act). Buyer intends to assign this`,
    `contract to a third party for a fee. Seller acknowledges this disclosure.`,
    ``,
    `SELLER: ______________________________  Date: ____________`,
    `         ${cf.ownerName}`,
    ``,
    `BUYER:  ______________________________  Date: ____________`,
    `         Dominion Homes LLC`,
  ].join("\n"), [cf, today, autoMao]);

  const handlePrint = useCallback(() => {
    const w = window.open("", "_blank", "width=800,height=1100");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>PSA — ${cf.fullAddress}</title>
      <style>body{font-family:Courier,monospace;padding:40px;font-size:12px;line-height:1.6;white-space:pre-wrap;color:#000;}</style>
      </head><body>${psaBody}</body></html>`);
    w.document.close();
    w.print();
  }, [cf.fullAddress, psaBody]);

  const gmailUrl = useMemo(() => {
    const subject = encodeURIComponent(`PSA — ${cf.fullAddress} — ${cf.ownerName}`);
    const body = encodeURIComponent(`Hi ${cf.ownerName.split(" ")[0]},\n\nPlease find the Purchase and Sale Agreement for the property at:\n${cf.fullAddress}\nAPN: ${cf.apn}\n\nI'll follow up shortly to discuss terms.\n\nBest,\nAdam DesJardin\nDominion Homes LLC`);
    return `https://mail.google.com/mail/?view=cm&su=${subject}&body=${body}`;
  }, [cf]);

  return (
    <div className="space-y-4">
      {/* PSA Preview */}
      <Section title="Purchase & Sale Agreement (RCW 61.40.010)" icon={FileText}>
        <pre className="text-[11px] leading-relaxed text-foreground/80 bg-white/[0.02] rounded-[10px] p-4 border border-white/[0.06] overflow-auto max-h-64 whitespace-pre-wrap font-mono">
          {psaBody}
        </pre>
      </Section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={handlePrint} className="gap-2 h-14 text-base font-bold" style={{ boxShadow: "0 0 30px rgba(0,212,255,0.25)" }}>
          <Printer className="h-5 w-5" />
          CREATE PSA
        </Button>
        <a href={gmailUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" className="gap-2 h-14 text-base font-bold w-full">
            <Send className="h-5 w-5" />
            Email via Gmail
          </Button>
        </a>
      </div>

      <div className="flex items-center gap-2 text-xs text-cyan/70 bg-cyan/4 border border-cyan/15 rounded-md px-3 py-2">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        RCW 61.40.010 compliant — wholesaler disclosure included in all documents.
      </div>

      {/* Auto-filled data summary */}
      <div className="text-[10px] text-muted-foreground/50 space-y-0.5">
        <p>Auto-filled from client file: {cf.ownerName} • {cf.fullAddress} • APN {cf.apn}</p>
        <p>Heat Score: {cf.compositeScore} ({cf.scoreLabel.toUpperCase()}) • Equity: {cf.equityPercent ?? "—"}% • ARV: {cf.estimatedValue ? formatCurrency(cf.estimatedValue) : "—"}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main Modal
// ═══════════════════════════════════════════════════════════════════════

interface MasterClientFileModalProps {
  clientFile: ClientFile | null;
  open: boolean;
  onClose: () => void;
  onClaim?: (id: string) => void;
  onRefresh?: () => void;
}

export function MasterClientFileModal({ clientFile, open, onClose, onClaim, onRefresh }: MasterClientFileModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [skipTracing, setSkipTracing] = useState(false);
  const [skipTraceResult, setSkipTraceResult] = useState<string | null>(null);
  const [skipTraceMs, setSkipTraceMs] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<SkipTraceOverlay | null>(null);
  const [skipTraceError, setSkipTraceError] = useState<SkipTraceError | null>(null);
  const [selectedComps, setSelectedComps] = useState<CompProperty[]>([]);
  const [computedArv, setComputedArv] = useState(
    () => (clientFile?.ownerFlags?.comp_arv as number) ?? 0
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsPhone, setSmsPhone] = useState<string | null>(null);
  const [dialHistoryMap, setDialHistoryMap] = useState<Record<string, { count: number; lastDate: string; lastDisposition: string }>>({});
  const [autofilling, setAutofilling] = useState(false);

  // ── Deep Crawl state ──
  const [deepCrawling, setDeepCrawling] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deepCrawlResult, setDeepCrawlResult] = useState<any>(null);
  const [deepCrawlExpanded, setDeepCrawlExpanded] = useState(false);

  // Pre-populate deep crawl from cached results in owner_flags
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached = (clientFile?.ownerFlags as any)?.deep_crawl;
    if (cached?.crawledAt) {
      const ageMs = Date.now() - new Date(cached.crawledAt).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        setDeepCrawlResult(cached);
      }
    }
  }, [clientFile?.ownerFlags, clientFile?.propertyId]);

  const displayPhone = overlay?.primaryPhone ?? clientFile?.ownerPhone ?? null;

  // Reset all skip-trace / enrichment state when switching to a different prospect
  // Without this, overlay data from the previous prospect bleeds into the new one
  const prevPropertyIdRef = useRef(clientFile?.propertyId);
  useEffect(() => {
    if (clientFile?.propertyId !== prevPropertyIdRef.current) {
      prevPropertyIdRef.current = clientFile?.propertyId;
      setOverlay(null);
      setSkipTraceResult(null);
      setSkipTraceMs(null);
      setSkipTraceError(null);
      setSelectedComps([]);
      setComputedArv((clientFile?.ownerFlags?.comp_arv as number) ?? 0);
      setDialHistoryMap({});
      // Reset deep crawl
      setDeepCrawling(false);
      setDeepCrawlResult(null);
      setDeepCrawlExpanded(false);
    }
  }, [clientFile?.propertyId, clientFile?.ownerFlags]);

  // Fetch dial history for this lead — groups calls_log by phone_dialed
  const fetchDialHistory = useCallback(async () => {
    if (!clientFile?.id) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("calls_log") as any)
      .select("phone_dialed, disposition, started_at")
      .eq("lead_id", clientFile.id)
      .order("started_at", { ascending: false });

    if (!data) return;
    const grouped: Record<string, { count: number; lastDate: string; lastDisposition: string }> = {};
    for (const row of data as { phone_dialed: string; disposition: string; started_at: string }[]) {
      const norm = row.phone_dialed.replace(/\D/g, "").slice(-10);
      if (!grouped[norm]) {
        grouped[norm] = { count: 1, lastDate: row.started_at, lastDisposition: row.disposition };
      } else {
        grouped[norm].count++;
      }
    }
    setDialHistoryMap(grouped);
  }, [clientFile?.id]);

  useEffect(() => { fetchDialHistory(); }, [fetchDialHistory]);

  // Real-time subscription for call updates
  useEffect(() => {
    if (!clientFile?.id) return;
    const channel = supabase
      .channel(`dial-history-${clientFile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls_log", filter: `lead_id=eq.${clientFile.id}` },
        () => { fetchDialHistory(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientFile?.id, fetchDialHistory]);

  const handleClaimLead = useCallback(async () => {
    if (!clientFile) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Not logged in — cannot claim");
      return;
    }

    setClaiming(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: fetchErr } = await (supabase.from("leads") as any)
        .select("status, lock_version")
        .eq("id", clientFile.id)
        .single();

      if (fetchErr || !current) {
        toast.error("Claim failed: Could not fetch lead status. Refresh and try again.");
        return;
      }

      const res = await fetch("/api/prospects", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-lock-version": String(current.lock_version ?? 0),
        },
        body: JSON.stringify({
          lead_id: clientFile.id,
          status: "lead",
          assigned_to: user.id,
          actor_id: user.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("[MCF] Claim failed:", res.status, data);
        if (res.status === 409) {
          toast.error("Claim failed: Lead was already claimed by someone else. Refresh and try again.");
        } else if (res.status === 422) {
          toast.error(`Claim failed: ${data.detail ?? data.error ?? "Invalid transition"}`);
        } else {
          toast.error(`Claim failed: ${data.error ?? `HTTP ${res.status}`}`);
        }
        return;
      }

      toast.success("Lead claimed successfully");
      onClaim?.(clientFile.id);
      onRefresh?.();
    } catch (err) {
      console.error("[MCF] Claim error:", err);
      toast.error("Claim failed: Network error. Check your connection and try again.");
    } finally {
      setClaiming(false);
    }
  }, [clientFile, onClaim, onRefresh]);

  const handleDial = useCallback(async (phoneNumber?: string) => {
    const numberToDial = phoneNumber || displayPhone;
    if (!clientFile || !numberToDial) return;
    setCalling(true);
    setCallStatus("dialing");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/dialer/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          phone: numberToDial,
          leadId: clientFile.id,
          propertyId: clientFile.propertyId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCallStatus("ringing");
        toast.success(`Call initiated to ...${numberToDial.slice(-4)}`);
        setTimeout(() => { setCallStatus(null); setCalling(false); }, 30000);
        fetchDialHistory();
      } else {
        setCallStatus(null);
        setCalling(false);
        toast.error(data.error ?? "Call failed");
      }
    } catch {
      setCallStatus(null);
      setCalling(false);
      toast.error("Network error — call failed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFile, displayPhone, fetchDialHistory]);

  const handleSendSms = useCallback(async (phoneNumber?: string) => {
    const numberToSms = phoneNumber || displayPhone;
    if (!clientFile || !numberToSms) return;
    // If called from dialer card without a message, open SMS panel with the phone pre-set
    if (!smsMessage.trim() && !phoneNumber) return;
    if (phoneNumber && !smsMessage.trim()) {
      setSmsPhone(numberToSms);
      setSmsOpen(true);
      return;
    }
    setSmsSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/dialer/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          phone: smsPhone || numberToSms,
          message: smsMessage.trim(),
          leadId: clientFile.id,
          propertyId: clientFile.propertyId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("SMS sent successfully");
        setSmsMessage("");
        setSmsOpen(false);
        setSmsPhone(null);
      } else {
        toast.error(data.error ?? "SMS failed");
      }
    } catch {
      toast.error("Network error — SMS failed");
    } finally {
      setSmsSending(false);
    }
  }, [clientFile, displayPhone, smsMessage, smsPhone]);

  const handleAddComp = useCallback((comp: CompProperty) => {
    setSelectedComps((prev) => prev.some((c) => c.apn === comp.apn) ? prev : [...prev, comp]);
  }, []);

  const handleRemoveComp = useCallback((apn: string) => {
    setSelectedComps((prev) => prev.filter((c) => c.apn !== apn));
  }, []);

  const handleArvChange = useCallback(async (arv: number) => {
    setComputedArv(arv);
    if (!clientFile?.propertyId || arv <= 0) return;
    try {
      await (supabase.from("properties") as any)
        .update({
          owner_flags: {
            ...clientFile.ownerFlags,
            comp_arv: arv,
            comp_arv_updated_at: new Date().toISOString(),
            comp_count: selectedComps.length,
            comp_addresses: selectedComps.map(c => c.address).slice(0, 5),
          },
        })
        .eq("id", clientFile.propertyId);
    } catch { /* silent — non-critical persistence */ }
  }, [clientFile?.propertyId, clientFile?.ownerFlags, selectedComps]);

  const executeSkipTrace = useCallback(async (manual: boolean) => {
    if (!clientFile) return;
    setSkipTracing(true);
    setSkipTraceResult(null);
    setSkipTraceMs(null);
    setSkipTraceError(null);
    const t0 = performance.now();

    try {
      const res = await fetch("/api/prospects/skip-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: clientFile.propertyId, lead_id: clientFile.id, manual }),
      });
      const tApi = performance.now();
      const data = await res.json();

      if (data.success) {
        setOverlay({
          phones: data.phones ?? [], emails: data.emails ?? [],
          persons: data.persons ?? [], primaryPhone: data.primary_phone ?? null,
          primaryEmail: data.primary_email ?? null,
          phoneDetails: data.phone_details ?? [],
          emailDetails: data.email_details ?? [],
          providers: data.providers ?? [],
          isLitigator: data.is_litigator ?? false,
          hasDncNumbers: data.has_dnc_numbers ?? false,
        });
        const total = Math.round(performance.now() - t0);
        setSkipTraceMs(total);
        const parts = [];
        if (data.phones?.length) parts.push(`${data.phones.length} phone(s)`);
        if (data.emails?.length) parts.push(`${data.emails.length} email(s)`);
        if (data.persons?.length) parts.push(`${data.persons.length} person(s)`);
        setSkipTraceResult(parts.length > 0 ? `Found ${parts.join(", ")}` : "Complete — no contact info found");
        console.log(`[SkipTrace Perf] Total: ${total}ms | API: ${Math.round(tApi - t0)}ms`);
        onRefresh?.();
      } else {
        setSkipTraceMs(Math.round(performance.now() - t0));
        if (data.reason || data.suggestion || data.address_issues) {
          setSkipTraceError({
            error: data.error ?? "Skip trace failed",
            reason: data.reason,
            suggestion: data.suggestion,
            tier_reached: data.tier_reached,
            address_issues: data.address_issues,
          });
        } else {
          setSkipTraceResult(data.error ?? "Skip trace failed");
        }
      }
    } catch (err) {
      setSkipTraceResult(err instanceof Error ? err.message : "Network error");
      setSkipTraceMs(Math.round(performance.now() - t0));
    } finally {
      setSkipTracing(false);
    }
  }, [clientFile, onRefresh]);

  const handleSkipTrace = useCallback(() => executeSkipTrace(false), [executeSkipTrace]);
  const handleManualSkipTrace = useCallback(() => executeSkipTrace(true), [executeSkipTrace]);

  // ── Deep Crawl handler ──
  const executeDeepCrawl = useCallback(async () => {
    if (!clientFile) return;
    setDeepCrawling(true);
    try {
      const res = await fetch("/api/prospects/deep-crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: clientFile.propertyId, lead_id: clientFile.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(`Deep Crawl failed: ${data.error}`);
      } else {
        setDeepCrawlResult(data);
        setDeepCrawlExpanded(true);
        toast.success(`Deep Crawl complete — ${data.sources?.join(", ") ?? "done"}`);
        onRefresh?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deep Crawl network error");
    } finally {
      setDeepCrawling(false);
    }
  }, [clientFile, onRefresh]);

  const handleAutofill = useCallback(async () => {
    if (!clientFile) return;
    setAutofilling(true);
    try {
      const res = await fetch("/api/properties/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: clientFile.propertyId }),
      });
      const data = await res.json();

      if (data.success && data.filled?.length > 0) {
        toast.success(`Autofilled: ${data.filled.join(", ")}`);
        onRefresh?.();
      } else if (data.success && data.filled?.length === 0) {
        toast.info("All property details already populated");
      } else {
        // ATTOM failed — offer Zillow link
        const zUrl = data.zillow_url;
        toast.error(
          `${data.error ?? "Autofill failed"}${zUrl ? " — opening Zillow for manual lookup" : ""}`,
          { duration: 6000 },
        );
        if (zUrl) window.open(zUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      toast.error("Network error during autofill");
    } finally {
      setAutofilling(false);
    }
  }, [clientFile, onRefresh]);

  if (!clientFile) return null;

  const lbl = SCORE_LABEL_CFG[clientFile.scoreLabel];

  return (
    <AnimatePresence>
      {open && (
        <Fragment>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 modal-backdrop"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn("fixed inset-x-4 top-[2%] bottom-[2%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 flex flex-col transition-all duration-300", activeTab === "comps" ? "md:w-[1060px]" : "md:w-[860px]")}
          >
            <div className="flex-1 overflow-hidden rounded-[16px] border border-white/[0.08] modal-glass holo-border wet-shine flex flex-col">
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[rgba(4,4,12,0.88)] backdrop-blur-2xl rounded-t-[16px]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold", lbl.bg, lbl.color)}>
                    <Zap className="h-3 w-3" />{clientFile.compositeScore} {lbl.text}
                  </div>
                  {clientFile.prediction && (
                    <PredictiveDistressBadge data={clientFile.prediction as PredictiveDistressData} size="sm" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold truncate" style={{ textShadow: "0 0 12px rgba(0,212,255,0.12)" }}>{clientFile.ownerName}</h2>
                      <RelationshipBadge data={{
                        ownerAgeInference: clientFile.prediction?.ownerAgeInference,
                        lifeEventProbability: clientFile.prediction?.lifeEventProbability,
                        tags: clientFile.tags,
                        bestAddress: clientFile.fullAddress,
                      }} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{clientFile.fullAddress}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {clientFile.enriched && (
                    <Badge variant="outline" className="text-[9px] gap-1 text-cyan border-cyan/20">
                      <CheckCircle2 className="h-2.5 w-2.5" />Enriched
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[9px] capitalize">{clientFile.status.replace(/_/g, " ")}</Badge>
                  <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.04] transition-colors text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] bg-[rgba(12,12,22,0.5)] overflow-x-auto scrollbar-none">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-medium transition-all whitespace-nowrap",
                      activeTab === tab.id
                        ? "text-cyan bg-cyan/8 border border-cyan/20 shadow-[0_0_8px_rgba(0,212,255,0.1)]"
                        : "text-muted-foreground hover:text-foreground border border-transparent hover:border-glass-border"
                    )}
                  >
                    <tab.icon className="h-3 w-3" />{tab.label}
                    {tab.id === "comps" && selectedComps.length > 0 && (
                      <span className="ml-1 bg-cyan/15 text-cyan text-[9px] px-1.5 rounded-full font-semibold">{selectedComps.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeTab}-${clientFile.propertyId}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === "overview" && (
                      <OverviewTab cf={clientFile} computedArv={computedArv} skipTracing={skipTracing} skipTraceResult={skipTraceResult} skipTraceMs={skipTraceMs} overlay={overlay} skipTraceError={skipTraceError} onSkipTrace={handleSkipTrace} onManualSkipTrace={handleManualSkipTrace} onEdit={() => setEditOpen(true)} onDial={handleDial} onSms={handleSendSms} calling={calling} dialHistory={dialHistoryMap} autofilling={autofilling} onAutofill={handleAutofill} deepCrawling={deepCrawling} deepCrawlResult={deepCrawlResult} deepCrawlExpanded={deepCrawlExpanded} setDeepCrawlExpanded={setDeepCrawlExpanded} executeDeepCrawl={executeDeepCrawl} />
                    )}
                    {activeTab === "contact" && (
                      <ContactTab cf={clientFile} overlay={overlay} onSkipTrace={handleSkipTrace} skipTracing={skipTracing} onDial={handleDial} onSms={handleSendSms} calling={calling} onRefresh={onRefresh} />
                    )}
                    {activeTab === "comps" && <CompsTab cf={clientFile} selectedComps={selectedComps} onAddComp={handleAddComp} onRemoveComp={handleRemoveComp} onSkipTrace={handleSkipTrace} computedArv={computedArv} onArvChange={handleArvChange} />}
                    {activeTab === "calculator" && <OfferCalcTab cf={clientFile} computedArv={computedArv} />}
                    {activeTab === "documents" && <DocumentsTab cf={clientFile} computedArv={computedArv} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex flex-col border-t border-white/[0.06] bg-[rgba(4,4,12,0.88)] backdrop-blur-2xl rounded-b-[16px]">
                {/* Call status banner */}
                {callStatus && (
                  <div className="flex items-center gap-2 px-6 py-2 bg-cyan/[0.08] border-b border-cyan/15 text-xs text-cyan">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="font-semibold capitalize">{callStatus}</span>
                    <span className="text-muted-foreground/50 ml-1">via Twilio</span>
                    <button onClick={() => { setCallStatus(null); setCalling(false); }} className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                {/* SMS Compose */}
                {smsOpen && displayPhone && (
                  <div className="px-6 py-3 border-b border-white/[0.06] space-y-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">SMS to ***{(smsPhone || displayPhone)?.slice(-4)}</p>
                      <button onClick={() => setSmsOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <textarea
                      value={smsMessage}
                      onChange={(e) => setSmsMessage(e.target.value)}
                      placeholder="Type your message…"
                      className="w-full h-16 rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-cyan/30"
                      maxLength={320}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground/40">{smsMessage.length}/320</span>
                      <Button size="sm" className="gap-1.5" disabled={smsSending || !smsMessage.trim()} onClick={() => handleSendSms()}>
                        {smsSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        {smsSending ? "Sending…" : "Send SMS"}
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 px-6 py-3">
                  {onClaim && (
                    <Button size="sm" className="gap-2" disabled={claiming} onClick={handleClaimLead}>
                      {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {claiming ? "Claiming…" : "Claim Lead"}
                    </Button>
                  )}
                  {displayPhone && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-cyan/20 hover:border-cyan/40 hover:bg-cyan/[0.06]"
                      disabled={calling}
                      onClick={() => handleDial()}
                    >
                      {calling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                      {calling ? "Dialing…" : `Dial ${displayPhone.slice(-4)}`}
                    </Button>
                  )}
                  {displayPhone && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06]"
                      onClick={() => setSmsOpen(!smsOpen)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />SMS
                    </Button>
                  )}
                  {clientFile.ownerEmail && (
                    <Button size="sm" variant="outline" className="gap-2" asChild>
                      <a href={`mailto:${clientFile.ownerEmail}`}><Mail className="h-3.5 w-3.5" />Email</a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-2"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                  <div className="ml-auto text-[10px] text-muted-foreground">
                    ID: {clientFile.id.slice(0, 8)} • {clientFile.source}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {editOpen && (
            <EditDetailsModal
              cf={clientFile}
              onClose={() => setEditOpen(false)}
              onSaved={() => onRefresh?.()}
            />
          )}

          {deleteOpen && (
            <DeleteConfirmationModal
              cf={clientFile}
              onClose={() => setDeleteOpen(false)}
              onDeleted={() => {
                setDeleteOpen(false);
                onClose();
                onRefresh?.();
              }}
            />
          )}
        </Fragment>
      )}
    </AnimatePresence>
  );
}
