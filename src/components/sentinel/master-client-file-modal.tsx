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
  Users, Briefcase, CheckCircle, XCircle,
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
  tired_landlord:   { label: "Tired Landlord",  icon: AlertTriangle, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  underwater:       { label: "Underwater",       icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

/** Urgency tiers for distress signals — determines sort order, visual treatment, and pitch approach */
type UrgencyTier = "CRITICAL" | "URGENT" | "MODERATE" | "LOW";

interface DistressUrgency {
  tier: UrgencyTier;
  /** Estimated days until a hard deadline (auction, hearing, etc.) — null if no deadline */
  daysUntilCritical: number | null;
  /** Color classes for the urgency badge */
  color: string;
  /** Short pitch suggestion for the agent */
  pitch: string;
}

const URGENCY_TIER_STYLES: Record<UrgencyTier, { color: string; badge: string }> = {
  CRITICAL: { color: "text-red-400 border-red-500/40 bg-red-500/[0.08]", badge: "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse" },
  URGENT:   { color: "text-orange-400 border-orange-500/30 bg-orange-500/[0.06]", badge: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  MODERATE: { color: "text-amber-400 border-amber-500/20 bg-amber-500/[0.04]", badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  LOW:      { color: "text-slate-400 border-white/[0.06] bg-white/[0.02]", badge: "bg-white/[0.04] text-slate-400 border-white/10" },
};

/** Calculate urgency tier for a distress event based on type and timing */
function getDistressUrgency(evtType: string, createdAt: string, rawData?: Record<string, unknown>): DistressUrgency {
  const daysSinceDetected = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);

  // Extract known deadline dates from raw_data
  const auctionDate = rawData?.AuctionDate ?? rawData?.auction_date ?? rawData?.sale_date;
  const hearingDate = rawData?.HearingDate ?? rawData?.hearing_date ?? rawData?.court_date;
  const deadlineDate = rawData?.deadline ?? rawData?.redemption_deadline;
  const deadlineStr = auctionDate ?? hearingDate ?? deadlineDate;

  let daysUntilCritical: number | null = null;
  if (deadlineStr && typeof deadlineStr === "string") {
    try {
      daysUntilCritical = Math.max(0, Math.floor((new Date(deadlineStr).getTime() - Date.now()) / 86400000));
    } catch { /* ignore parse failures */ }
  }

  // CRITICAL (0-30 days): auction, foreclosure sale, redemption deadline approaching
  if (evtType === "pre_foreclosure" || evtType === "foreclosure") {
    if (daysUntilCritical !== null && daysUntilCritical <= 30) {
      return { tier: "CRITICAL", daysUntilCritical, color: URGENCY_TIER_STYLES.CRITICAL.color, pitch: "Mention timeline pressure — they may lose the property in days" };
    }
    if (daysSinceDetected <= 30) {
      return { tier: "URGENT", daysUntilCritical, color: URGENCY_TIER_STYLES.URGENT.color, pitch: "Position as solution to their foreclosure — time is limited" };
    }
    return { tier: "MODERATE", daysUntilCritical, color: URGENCY_TIER_STYLES.MODERATE.color, pitch: "Build urgency around avoiding foreclosure damage to credit" };
  }

  if (evtType === "tax_lien" || evtType === "tax_delinquency") {
    const installments = Number(rawData?.NumberDelinquentInstallments ?? 0);
    if (daysUntilCritical !== null && daysUntilCritical <= 30) {
      return { tier: "CRITICAL", daysUntilCritical, color: URGENCY_TIER_STYLES.CRITICAL.color, pitch: "Tax auction imminent — emphasize losing the property entirely" };
    }
    if (installments >= 3 || daysSinceDetected <= 30) {
      return { tier: "URGENT", daysUntilCritical, color: URGENCY_TIER_STYLES.URGENT.color, pitch: "Position as way to resolve tax debt before auction" };
    }
    return { tier: "MODERATE", daysUntilCritical, color: URGENCY_TIER_STYLES.MODERATE.color, pitch: "Mention accumulating penalties and interest on the tax debt" };
  }

  if (evtType === "probate" || evtType === "deceased") {
    if (daysSinceDetected <= 60) {
      return { tier: "URGENT", daysUntilCritical: null, color: URGENCY_TIER_STYLES.URGENT.color, pitch: "Heirs often want quick liquidation — offer convenience and speed" };
    }
    return { tier: "MODERATE", daysUntilCritical: null, color: URGENCY_TIER_STYLES.MODERATE.color, pitch: "Estate may be stalled — offer to simplify the process" };
  }

  if (evtType === "bankruptcy") {
    if (daysSinceDetected <= 30) {
      return { tier: "URGENT", daysUntilCritical: null, color: URGENCY_TIER_STYLES.URGENT.color, pitch: "Motivated to resolve debts — cash offer can help restructure" };
    }
    return { tier: "MODERATE", daysUntilCritical: null, color: URGENCY_TIER_STYLES.MODERATE.color, pitch: "Offer a clean sale that simplifies their financial situation" };
  }

  if (evtType === "divorce") {
    if (daysSinceDetected <= 60) {
      return { tier: "URGENT", daysUntilCritical: null, color: URGENCY_TIER_STYLES.URGENT.color, pitch: "Court may force partition sale — offer a quick private alternative" };
    }
    return { tier: "MODERATE", daysUntilCritical: null, color: URGENCY_TIER_STYLES.MODERATE.color, pitch: "Position as clean split solution — no Realtor, no showings" };
  }

  if (evtType === "code_violation" || evtType === "condemned") {
    if (daysUntilCritical !== null && daysUntilCritical <= 30) {
      return { tier: "CRITICAL", daysUntilCritical, color: URGENCY_TIER_STYLES.CRITICAL.color, pitch: "Hearing imminent — daily fines may escalate rapidly" };
    }
    if (evtType === "condemned") {
      return { tier: "URGENT", daysUntilCritical, color: URGENCY_TIER_STYLES.URGENT.color, pitch: "Property condemned — offer to buy as-is and save them demo costs" };
    }
    return { tier: "MODERATE", daysUntilCritical, color: URGENCY_TIER_STYLES.MODERATE.color, pitch: "Mention accumulating fines — cash offer avoids repair costs" };
  }

  if (evtType === "water_shutoff") {
    return { tier: "URGENT", daysUntilCritical: null, color: URGENCY_TIER_STYLES.URGENT.color, pitch: "Utility shutoff signals abandonment — act fast before property degrades" };
  }

  if (evtType === "underwater") {
    return { tier: "MODERATE", daysUntilCritical: null, color: URGENCY_TIER_STYLES.MODERATE.color, pitch: "Potential short sale — may need lender approval, be patient" };
  }

  // LOW urgency: absentee, vacant, tired_landlord, inherited (no deadline), fsbo
  if (evtType === "vacant" || evtType === "absentee" || evtType === "tired_landlord" || evtType === "fsbo" || evtType === "inherited") {
    return { tier: "LOW", daysUntilCritical: null, color: URGENCY_TIER_STYLES.LOW.color, pitch: "Long-game approach — build rapport, emphasize convenience over speed" };
  }

  return { tier: "LOW", daysUntilCritical: null, color: URGENCY_TIER_STYLES.LOW.color, pitch: "Build rapport, learn about their situation before pitching" };
}

/** Sort order for urgency tiers */
const URGENCY_SORT: Record<UrgencyTier, number> = { CRITICAL: 0, URGENT: 1, MODERATE: 2, LOW: 3 };

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
  tired_landlord: "Tired Landlord", underwater: "Underwater",
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
  const assignFee = 15000;
  // Wholesale: Buyer's MAO = ARV × 70% − Rehab; Your MAO = Buyer's MAO − Assignment Fee
  const buyerMaoCalc = Math.round(arv * 0.70 - rehabEst);
  const yourMaoCalc = Math.round(buyerMaoCalc - assignFee);
  const wholesaleSpread = assignFee;

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

                {/* Per-signal detailed breakdown — sorted by urgency */}
                {cf.tags.length > 0 ? (() => {
                  // Sort tags by urgency tier
                  const sortedTags = [...cf.tags].sort((a, b) => {
                    const urgA = getDistressUrgency(a, new Date().toISOString());
                    const urgB = getDistressUrgency(b, new Date().toISOString());
                    return URGENCY_SORT[urgA.tier] - URGENCY_SORT[urgB.tier];
                  });
                  return (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Distress Signals</p>
                      {sortedTags.map((tag) => {
                        const cfg = DISTRESS_CFG[tag];
                        const TagIcon = cfg?.icon ?? Tag;
                        const baseWeight = SIGNAL_WEIGHTS[tag as DistressType] ?? 10;
                        const factor = factors.find((f) => f.name === tag);
                        const urgency = getDistressUrgency(tag, new Date().toISOString());
                        const tierStyle = URGENCY_TIER_STYLES[urgency.tier];
                        return (
                          <div key={tag} className={cn("rounded-[8px] border px-3 py-2.5", tierStyle.color)}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <TagIcon className={cn("h-3.5 w-3.5", cfg?.color?.split(" ")[0] ?? "text-muted-foreground")} />
                              <span className={cn("text-xs font-semibold", cfg?.color?.split(" ")[0] ?? "text-foreground")}>{cfg?.label ?? tag}</span>
                              <span className={cn("text-[7px] font-bold px-1.5 py-0 rounded-full border uppercase tracking-widest ml-1", tierStyle.badge)}>
                                {urgency.tier}
                              </span>
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
                            {/* Pitch hint for agents */}
                            <p className="text-[9px] italic opacity-60 mt-1.5">{urgency.pitch}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })() : (
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
                      <span className="text-muted-foreground">AVM</span>
                      <span className="font-mono font-bold text-neon">{arv > 0 ? formatCurrency(arv) : "—"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Tax Assessed</span>
                      <span className="font-mono font-bold text-amber-400">{(() => { const tv = Number(cf.ownerFlags?.tax_assessed_value) || 0; return tv > 0 ? formatCurrency(tv) : "—"; })()}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Equity %</span>
                      <span className="font-mono font-bold">{eqPct > 0 ? `${eqPct}%` : "—"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">AVM vs Tax</span>
                      <span className="font-mono font-semibold text-cyan">{(() => { const tv = Number(cf.ownerFlags?.tax_assessed_value) || 0; if (arv > 0 && tv > 0) { const delta = arv - tv; return `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`; } return "—"; })()}</span>
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

                {/* Wholesale profit projection */}
                {arv > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Wholesale Spread</p>
                    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ARV</span>
                        <span className="font-mono font-medium">{formatCurrency(arv)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Buyer{"'"}s MAO (70%)</span>
                        <span className="font-mono font-medium">{formatCurrency(buyerMaoCalc)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Your Offer</span>
                        <span className="font-mono font-medium">{formatCurrency(yourMaoCalc)}</span>
                      </div>
                      <div className="border-t border-white/[0.06] pt-1.5 mt-1.5 flex justify-between">
                        <span className="font-semibold">Assignment Spread</span>
                        <span className={cn("font-mono font-bold text-lg", wholesaleSpread >= 0 ? "text-neon" : "text-red-400")} style={wholesaleSpread >= 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.25)" } : {}}>
                          {formatCurrency(wholesaleSpread)}
                        </span>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 italic">
                      70% rule, ${(rehabEst / 1000).toFixed(0)}k rehab, ${(assignFee / 1000).toFixed(0)}k assignment fee. Adjust in Offer Calculator tab.
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
  source: "propertyradar" | "batchdata" | `openclaw_${string}` | string;
}

/** Score and rank phones by likelihood of reaching the owner. Higher = better. */
function rankPhones(phones: PhoneDetail[]): (PhoneDetail & { rankScore: number })[] {
  return phones
    .map((p) => {
      let score = 0;

      // Line type: mobile most likely to answer, voip okay, landline worst
      if (p.lineType === "mobile") score += 30;
      else if (p.lineType === "voip") score += 10;
      else if (p.lineType === "landline") score += 0;
      else score += 5; // unknown — slightly above landline

      // Confidence: direct contribution (0-100 scale → 0-40 points)
      score += Math.round((p.confidence ?? 50) * 0.4);

      // Source quality: BatchData most reliable, then OpenClaw, then PropertyRadar
      if (p.source === "batchdata") score += 15;
      else if (String(p.source).startsWith("openclaw")) score += 10;
      else if (p.source === "propertyradar") score += 5;

      // DNC penalty: push to bottom
      if (p.dnc) score -= 1000;

      return { ...p, rankScore: score };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

/** Color class for phone rank score badge */
function phoneRankColor(score: number): string {
  if (score >= 65) return "text-emerald-400 border-emerald-500/30";
  if (score >= 45) return "text-amber-400 border-amber-500/30";
  return "text-red-400 border-red-500/30";
}

interface EmailDetail {
  email: string;
  deliverable: boolean;
  source: "propertyradar" | "batchdata" | `openclaw_${string}` | string;
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
function DeepCrawlPanel({ result, onRecrawl, isRecrawling }: { result: any; onRecrawl?: () => void; isRecrawling?: boolean }) {
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
          <Brain className="h-3.5 w-3.5 text-cyan" />
          <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">Executive Summary</p>
          {ai.urgencyLevel && (
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", urgencyColor)}>
              {ai.urgencyLevel}
            </span>
          )}
        </div>
        <p className="text-[13px] text-foreground/90 leading-relaxed">{ai.summary ?? "No summary available"}</p>
        {ai.urgencyReason && (
          <p className="text-[11px] text-muted-foreground mt-1">{ai.urgencyReason}</p>
        )}
      </div>

      {/* Signal Analysis */}
      {ai.signalAnalysis && ai.signalAnalysis.length > 0 && (
        <div>
          <p className="text-[11px] text-orange-400/80 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />Signal Analysis
          </p>
          <div className="space-y-2">
            {ai.signalAnalysis.map((s: { headline: string; detail: string; daysUntilCritical: number | null; actionableInsight: string }, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
                  {s.headline}
                  {s.daysUntilCritical != null && s.daysUntilCritical <= 60 && (
                    <span className="text-[11px] text-red-400 font-mono ml-auto">{s.daysUntilCritical}d</span>
                  )}
                </p>
                <p className="text-[12px] text-muted-foreground leading-relaxed pl-5">{s.detail}</p>
                {s.actionableInsight && (
                  <p className="text-[12px] text-cyan/80 pl-5 flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 shrink-0" />{s.actionableInsight}
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
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />Owner Profile
          </p>
          <p className="text-[12px] text-foreground/80 leading-relaxed">{ai.ownerProfile}</p>
        </div>
      )}

      {/* Financial Snapshot */}
      {ai.financialAnalysis && (
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" />Financial Snapshot
          </p>
          <p className="text-[12px] text-foreground/80 leading-relaxed">{ai.financialAnalysis}</p>
          {ai.estimatedMAO && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground uppercase">Est. MAO:</span>
              <span className="text-[13px] font-semibold text-emerald-400">
                ${ai.estimatedMAO.low?.toLocaleString()} &ndash; ${ai.estimatedMAO.high?.toLocaleString()}
              </span>
              <span className="text-[11px] text-muted-foreground/60">{ai.estimatedMAO.basis}</span>
            </div>
          )}
        </div>
      )}

      {/* Approach & Talking Points */}
      {ai.suggestedApproach && (
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" />Suggested Approach
          </p>
          <p className="text-[12px] text-foreground/80 leading-relaxed">{ai.suggestedApproach}</p>
          {ai.talkingPoints && ai.talkingPoints.length > 0 && (
            <ul className="mt-2 space-y-1">
              {ai.talkingPoints.map((tp: string, i: number) => (
                <li key={i} className="text-[12px] text-cyan/80 flex items-start gap-1.5">
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
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />Web Findings
          </p>
          <div className="space-y-1.5">
            {ai.webFindings.map((w: { source: string; finding: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <Search className="h-3 w-3 text-cyan/50 mt-0.5 shrink-0" />
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
          <p className="text-[11px] text-red-400/80 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />Red Flags
          </p>
          <ul className="space-y-1">
            {ai.redFlags.map((flag: string, i: number) => (
              <li key={i} className="text-[12px] text-red-300/70 flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5 shrink-0">&#9679;</span>{flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-muted-foreground/50">
        <div className="flex items-center gap-2">
          {crawledAgo && <span>Crawled {crawledAgo}</span>}
          {sources.length > 0 && <span>&#183; Sources: {sources.join(", ")}</span>}
        </div>
        {onRecrawl && (
          <button
            onClick={onRecrawl}
            disabled={isRecrawling}
            className="text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors disabled:opacity-50"
          >
            {isRecrawling ? "Re-crawling…" : "↻ Re-crawl"}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DEEP SKIP PANEL — People intelligence from agents
// ═══════════════════════════════════════════════════════════════════════

const ROLE_COLORS: Record<string, string> = {
  owner: "text-cyan bg-cyan/10 border-cyan/30",
  heir: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  executor: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  attorney: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  beneficial_owner: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  spouse: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  family: "text-orange-400 bg-orange-500/10 border-orange-500/30",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeepSkipPanel({ result }: { result: any }) {
  if (!result || (!result.people?.length && !result.newPhones?.length && !result.newEmails?.length && !result.employmentSignals?.length)) {
    return null;
  }

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-purple-400" />
        <p className="text-[11px] text-purple-400/80 uppercase tracking-wider font-semibold">Deep Skip Report — People Intelligence</p>
        {result.agentMeta && (
          <span className="text-[10px] text-muted-foreground/50 ml-auto">
            {result.agentMeta.agentsSucceeded?.length ?? 0} agents · {result.people?.length ?? 0} people found
          </span>
        )}
      </div>

      {/* People Cards */}
      {result.people && result.people.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">People Found</p>
          <div className="grid gap-2">
            {result.people.map((person: { name: string; role: string; phones: string[]; emails: string[]; notes: string; source: string; confidence: number; address?: string }, i: number) => (
              <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <User className="h-3 w-3 text-foreground/60" />
                  <span className="text-[13px] font-semibold text-foreground">{person.name}</span>
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-[9px] font-bold border uppercase",
                    ROLE_COLORS[person.role] ?? "text-muted-foreground bg-white/5 border-white/10",
                  )}>
                    {person.role.replace(/_/g, " ")}
                  </span>
                  {person.confidence >= 0.8 && <CheckCircle className="h-3 w-3 text-emerald-400" />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-1.5 pl-5">{person.notes}</p>
                <div className="flex flex-wrap gap-3 pl-5 text-[11px]">
                  {person.phones.map((p: string, j: number) => (
                    <span key={j} className="flex items-center gap-1 text-emerald-400/80">
                      <Phone className="h-2.5 w-2.5" />{p}
                    </span>
                  ))}
                  {person.emails.map((e: string, j: number) => (
                    <span key={j} className="flex items-center gap-1 text-cyan/80">
                      <Mail className="h-2.5 w-2.5" />{e}
                    </span>
                  ))}
                  {person.address && (
                    <span className="flex items-center gap-1 text-muted-foreground/60">
                      <MapPin className="h-2.5 w-2.5" />{person.address}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 pl-5">
                  <span className="text-[9px] text-muted-foreground/40">via {person.source.replace(/_/g, " ")}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Contacts Found */}
      {((result.newPhones?.length > 0) || (result.newEmails?.length > 0)) && (
        <div>
          <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Plus className="h-3 w-3" />New Contacts Discovered
          </p>
          <div className="flex flex-wrap gap-2">
            {(result.newPhones ?? []).map((p: { number: string; source: string; personName?: string }, i: number) => (
              <span key={`p${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400">
                <Phone className="h-2.5 w-2.5" />
                {p.number}
                {p.personName && <span className="text-emerald-400/50">({p.personName})</span>}
                <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">OC</span>
              </span>
            ))}
            {(result.newEmails ?? []).map((e: { email: string; source: string; personName?: string }, i: number) => (
              <span key={`e${i}`} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium border border-cyan/20 bg-cyan/[0.06] text-cyan">
                <Mail className="h-2.5 w-2.5" />
                {e.email}
                {e.personName && <span className="text-cyan/50">({e.personName})</span>}
                <span className="text-[8px] px-1 py-0.5 rounded bg-cyan/20 text-cyan font-bold">OC</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Employment & Relocation Signals */}
      {result.employmentSignals && result.employmentSignals.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
            <Briefcase className="h-3 w-3" />Employment & Relocation Signals
          </p>
          <div className="space-y-1.5">
            {result.employmentSignals.map((s: { signal: string; source: string; date?: string; url?: string }, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <ArrowRight className="h-3 w-3 text-amber-400/60 mt-0.5 shrink-0" />
                <span className="text-foreground/70">{s.signal}</span>
                {s.date && <span className="text-muted-foreground/40 text-[10px] ml-auto shrink-0">{s.date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pt-2 border-t border-white/[0.06] text-[10px] text-muted-foreground/40">
        {result.crawledAt && <span>Generated {new Date(result.crawledAt).toLocaleString()}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DEEP CRAWL PROGRESS INDICATOR — SSE streaming steps
// ═══════════════════════════════════════════════════════════════════════

interface CrawlStep {
  phase: string;
  status: "started" | "complete" | "error";
  detail: string;
  elapsed?: number;
}

function CrawlProgressIndicator({ steps }: { steps: CrawlStep[] }) {
  if (steps.length === 0) return null;

  const phaseLabels: Record<string, string> = {
    data_gathering: "Data Gathering",
    normalization: "Normalizing Data",
    agents: "Research Agents",
    photos: "Property Photos",
    post_processing: "Contact & People Intel",
    grok_synthesis: "AI Synthesis",
    storage: "Saving Results",
    complete: "Complete",
    error: "Error",
  };

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-3.5 w-3.5 text-cyan animate-spin" />
        <p className="text-[11px] text-cyan/80 uppercase tracking-wider font-semibold">Deep Crawl in Progress</p>
      </div>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const icon = step.status === "complete"
          ? <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />
          : step.status === "error"
            ? <XCircle className="h-3 w-3 text-red-400 shrink-0" />
            : <Loader2 className="h-3 w-3 text-cyan animate-spin shrink-0" />;

        return (
          <div key={i} className={cn("flex items-center gap-2 text-[11px]", isLast && step.status === "started" ? "text-foreground" : "text-muted-foreground")}>
            {icon}
            <span className="font-medium">{phaseLabels[step.phase] ?? step.phase}</span>
            <span className="text-muted-foreground/50">{step.detail}</span>
            {step.elapsed != null && (
              <span className="text-[9px] text-muted-foreground/30 ml-auto font-mono">{(step.elapsed / 1000).toFixed(1)}s</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RESEARCH FINDINGS — distress events with source links for agent verification
// ═══════════════════════════════════════════════════════════════════════

const FINDING_ICONS: Record<string, typeof FileText> = {
  probate: Flame,
  pre_foreclosure: AlertTriangle,
  tax_lien: DollarSign,
  bankruptcy: Scale,
  divorce: Users,
  vacant: Home,
  code_violation: ShieldAlert,
  water_shutoff: AlertTriangle,
  inherited: Users,
  absentee: MapPinned,
  fsbo: Building,
  tired_landlord: Briefcase,
};

const FINDING_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  probate: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  pre_foreclosure: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  tax_lien: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  bankruptcy: { text: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
  divorce: { text: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  vacant: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  code_violation: { text: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20" },
  water_shutoff: { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  inherited: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  absentee: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  fsbo: { text: "text-blue-300", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  tired_landlord: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
};

const FINDING_LABELS: Record<string, string> = {
  probate: "Probate / Deceased",
  pre_foreclosure: "Pre-Foreclosure",
  tax_lien: "Tax Lien",
  bankruptcy: "Bankruptcy",
  divorce: "Divorce",
  vacant: "Vacant Property",
  code_violation: "Code Violation",
  water_shutoff: "Water Shut-off",
  inherited: "Inherited",
  absentee: "Absentee Owner",
  fsbo: "For Sale by Owner",
  tired_landlord: "Tired Landlord",
};

interface DistressEvent {
  id: string;
  event_type: string;
  source: string;
  severity: number;
  created_at: string;
  event_date: string | null;
  status: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_data: Record<string, any> | null;
}

// ── Owner Portfolio Component ─────────────────────────────────────────
// Shows all parcels owned by the same person in the same county.
// Data sources: (1) owner_flags.related_parcels from import rollup, (2) live DB query.

interface RelatedParcel {
  propertyId: string;
  apn: string;
  address: string;
  estimatedValue: number | null;
  lotSize: number | null;
  sqft: number | null;
  propertyType: string | null;
  isVacant: boolean;
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  SFR: "Single Family", RES: "Residential", CND: "Condo", MFR: "Multi-Family",
  COM: "Commercial", IND: "Industrial", AGR: "Agricultural", VAC: "Vacant Land",
};

function OwnerPortfolio({
  propertyId,
  ownerName,
  county,
  ownerFlags,
  estimatedValue,
}: {
  propertyId: string;
  ownerName: string;
  county: string;
  ownerFlags: Record<string, unknown>;
  estimatedValue: number | null;
}) {
  const [parcels, setParcels] = useState<RelatedParcel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Source 1: related_parcels from import-time rollup (already in owner_flags)
        const rolledUp = (ownerFlags?.related_parcels as RelatedParcel[]) ?? [];

        // Source 2: Live query for other properties with same owner + county
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: dbProps } = await (supabase.from("properties") as any)
          .select("id, apn, address, estimated_value, lot_size, sqft, property_type, owner_flags")
          .eq("county", county)
          .ilike("owner_name", ownerName.split(",")[0] + "%") // Match on last name prefix
          .neq("id", propertyId)
          .limit(20);

        const liveResults: RelatedParcel[] = (dbProps ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((p: any) => {
            // Skip properties that were rolled into another (avoid double-counting)
            const flags = (p.owner_flags ?? {}) as Record<string, unknown>;
            return !flags.rolled_into;
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => ({
            propertyId: p.id,
            apn: p.apn,
            address: p.address || "Vacant Land",
            estimatedValue: p.estimated_value,
            lotSize: p.lot_size,
            sqft: p.sqft,
            propertyType: p.property_type,
            isVacant: !p.sqft && !p.address?.match(/\d/),
          }));

        // Merge + deduplicate by APN
        const seen = new Set<string>();
        const merged: RelatedParcel[] = [];
        for (const p of [...rolledUp, ...liveResults]) {
          if (!seen.has(p.apn)) {
            seen.add(p.apn);
            merged.push(p);
          }
        }

        setParcels(merged);
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    load();
  }, [propertyId, ownerName, county, ownerFlags]);

  if (loading) return null; // Don't flash a loading state — it's supplementary info
  if (parcels.length === 0) return null; // Single-parcel owner — nothing to show

  const portfolioCount = parcels.length + 1; // +1 for the current property
  const thisPropertyValue = estimatedValue ?? 0;
  const portfolioTotal = parcels.reduce(
    (sum, p) => sum + (p.estimatedValue ?? 0),
    thisPropertyValue
  );

  const sqftToAcres = (sqft: number | null) =>
    sqft ? (sqft / 43560).toFixed(2) : null;

  return (
    <div className="rounded-[12px] border border-indigo-500/20 bg-indigo-500/[0.03] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-indigo-500/10 flex items-center justify-center">
            <Building className="h-3 w-3 text-indigo-400" />
          </div>
          <p className="text-[11px] text-indigo-300 uppercase tracking-wider font-semibold">
            Owner Portfolio
          </p>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-indigo-300 tabular-nums">
            {formatCurrency(portfolioTotal)}
          </span>
          <span className="text-[9px] text-muted-foreground ml-1.5">
            across {portfolioCount} parcel{portfolioCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Summary banner */}
      <div className="px-3 py-2 rounded-lg bg-indigo-500/[0.06] border border-indigo-500/15">
        <p className="text-[10px] text-muted-foreground">
          <span className="font-semibold text-indigo-300">{ownerName}</span> owns{" "}
          <span className="font-semibold text-foreground">{portfolioCount} parcels</span> in{" "}
          {county} County. If acquiring from this estate, additional lots may be included in the deal.
        </p>
      </div>

      {/* Parcel cards */}
      <div className="grid gap-2">
        {parcels.map((p) => (
          <div
            key={p.apn}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-[10px] border transition-colors",
              p.isVacant
                ? "border-emerald-500/15 bg-emerald-500/[0.03]"
                : "border-white/[0.06] bg-white/[0.02]"
            )}
          >
            {/* Icon */}
            <div className={cn(
              "h-7 w-7 rounded-md flex items-center justify-center shrink-0",
              p.isVacant ? "bg-emerald-500/10" : "bg-white/[0.04]"
            )}>
              {p.isVacant
                ? <LandPlot className="h-3.5 w-3.5 text-emerald-400" />
                : <Home className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-foreground truncate">
                  {p.isVacant ? "Vacant Land" : p.address}
                </span>
                {p.propertyType && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded border border-white/[0.08] bg-white/[0.04] text-muted-foreground font-medium shrink-0">
                    {PROPERTY_TYPE_LABELS[p.propertyType] ?? p.propertyType}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
                <span>APN: {p.apn}</span>
                {p.lotSize && <span>• {sqftToAcres(p.lotSize)} acres</span>}
                {p.sqft && <span>• {p.sqft.toLocaleString()} sqft</span>}
              </div>
            </div>

            {/* Value */}
            <div className="text-right shrink-0">
              {p.estimatedValue ? (
                <span className="text-xs font-bold tabular-nums text-foreground">
                  {formatCurrency(p.estimatedValue)}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/50">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchFindings({ propertyId, ownerFlags }: { propertyId: string; ownerFlags: Record<string, unknown> }) {
  const [findings, setFindings] = useState<DistressEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("distress_events") as any)
          .select("id, event_type, source, severity, created_at, event_date, status, raw_data")
          .eq("property_id", propertyId)
          .order("created_at", { ascending: false })
          .limit(30);
        if (!error && data) setFindings(data);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [propertyId]);

  // Quality gate badges from owner_flags
  const mlsListed = ownerFlags?.mls_listed === true;
  const ownershipVerified = ownerFlags?.ownership_verified;
  const ownershipNote = ownerFlags?.ownership_change_note as string | null;

  if (loading) {
    return (
      <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-[10px]">Loading research findings...</span>
        </div>
      </div>
    );
  }

  if (findings.length === 0 && !mlsListed && ownershipVerified !== false) {
    return null; // No findings to show
  }

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Search className="h-3 w-3" />Research Findings ({findings.length})
      </p>

      {/* Quality gate alerts */}
      {mlsListed && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06]">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-amber-300">MLS Listed</span>
          <span className="text-[10px] text-muted-foreground">This property is currently listed on MLS</span>
        </div>
      )}

      {ownershipVerified === false && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-orange-500/20 bg-orange-500/[0.06]">
          <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[11px] font-semibold text-orange-300">Ownership Changed</span>
            {ownershipNote && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{ownershipNote}</p>
            )}
          </div>
        </div>
      )}

      {/* Event cards */}
      <div className="space-y-2">
        {findings.map((evt) => {
          const colors = FINDING_COLORS[evt.event_type] ?? { text: "text-muted-foreground", bg: "bg-white/[0.04]", border: "border-white/[0.08]" };
          const Icon = FINDING_ICONS[evt.event_type] ?? FileText;
          const label = FINDING_LABELS[evt.event_type] ?? evt.event_type;
          const sourceUrl = evt.raw_data?.link as string | null;
          const snippet = evt.raw_data?.snippet as string | null;
          const nameInFinding = evt.raw_data?.name as string | null;
          const nameVerified = evt.raw_data?.name_verified;
          const nameMismatchNote = evt.raw_data?.name_mismatch_note as string | null;
          const ownershipChanged = evt.raw_data?.ownership_changed === true;
          const unverifiedReason = evt.raw_data?.unverified_reason as string | null;
          const daysSinceFound = Math.round((Date.now() - new Date(evt.created_at).getTime()) / 86400000);

          return (
            <div
              key={evt.id}
              className={cn(
                "rounded-[10px] border p-3 space-y-1.5",
                evt.status === "unverified" ? "border-orange-500/20 bg-orange-500/[0.03]" :
                evt.status === "resolved" ? "border-white/[0.06] bg-white/[0.01] opacity-60" :
                `${colors.border} ${colors.bg}`,
              )}
            >
              {/* Header row */}
              <div className="flex items-center gap-2">
                <div className={cn("h-6 w-6 rounded-md flex items-center justify-center shrink-0", colors.bg)}>
                  <Icon className={cn("h-3 w-3", colors.text)} />
                </div>
                <span className={cn("text-[11px] font-semibold", colors.text)}>{label}</span>

                {/* Status badges */}
                {evt.status === "unverified" && (
                  <Badge variant="outline" className="text-[7px] py-0 px-1 border-orange-500/30 text-orange-400">UNVERIFIED</Badge>
                )}
                {evt.status === "resolved" && (
                  <Badge variant="outline" className="text-[7px] py-0 px-1 border-white/20 text-muted-foreground">RESOLVED</Badge>
                )}
                {nameVerified === true && (
                  <Badge variant="outline" className="text-[7px] py-0 px-1 border-emerald-500/30 text-emerald-400">NAME MATCH</Badge>
                )}
                {nameVerified === false && (
                  <Badge variant="outline" className="text-[7px] py-0 px-1 border-red-500/30 text-red-400">NAME MISMATCH</Badge>
                )}

                {/* Source link */}
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground">{daysSinceFound === 0 ? "Today" : `${daysSinceFound}d ago`}</span>
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-0.5 text-[9px] text-cyan hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-2.5 w-2.5" />Source
                    </a>
                  )}
                </div>
              </div>

              {/* Details */}
              {nameInFinding && (
                <p className="text-[10px] text-foreground/80 pl-8">
                  <span className="text-muted-foreground">Subject: </span>{nameInFinding}
                </p>
              )}
              {snippet && (
                <p className="text-[10px] text-muted-foreground/70 pl-8 line-clamp-2">{snippet}</p>
              )}
              {nameMismatchNote && (
                <p className="text-[10px] text-orange-400/80 pl-8">{nameMismatchNote}</p>
              )}
              {unverifiedReason && (
                <p className="text-[10px] text-orange-400/80 pl-8">{unverifiedReason}</p>
              )}

              {/* Source attribution */}
              <div className="flex items-center gap-2 pl-8">
                <span className="text-[9px] text-muted-foreground/50">
                  via {evt.source} &middot; severity {evt.severity}/10
                  {evt.event_date && ` &middot; event ${evt.event_date.slice(0, 10)}`}
                </span>
              </div>
            </div>
          );
        })}
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
  const rawPhoneDetails: PhoneDetail[] = overlay?.phoneDetails
    ?? (cf.ownerFlags?.all_phones as PhoneDetail[] | undefined)?.filter((p) => typeof p === "object" && p !== null && "number" in p)
    ?? [];
  // Rank phones: mobile > voip > landline, high confidence first, DNC last
  const phoneDetails = rankPhones(rawPhoneDetails);
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
        // Rank phones before populating slots
        const ranked = rankPhones(overlay.phoneDetails);
        for (const pd of ranked) newPhones.push(pd.number);
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
            <p className="text-sm font-semibold text-foreground">{buildAddress(propertyAddr, propertyCity, propertyState, propertyZip) || "—"}</p>
            {(propertyAddr || propertyCity) && <CopyBtn text={buildAddress(propertyAddr, propertyCity, propertyState, propertyZip)} />}
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
                      {i === 0 && !detail?.dnc && <Badge variant="outline" className="text-[7px] py-0 px-1 border-cyan/30 text-cyan">BEST</Badge>}
                      {detail?.dnc && <Badge variant="outline" className="text-[7px] py-0 px-1 border-red-500/30 text-red-400">DNC</Badge>}
                      {/* Rank score indicator */}
                      {"rankScore" in (detail ?? {}) && (
                        <span className={cn("text-[9px] font-mono font-bold", phoneRankColor((detail as PhoneDetail & { rankScore: number }).rankScore))}>
                          {(detail as PhoneDetail & { rankScore: number }).rankScore}
                        </span>
                      )}
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
                          detail.source === "batchdata" ? "border-emerald-500/30 text-emerald-400"
                            : String(detail.source).startsWith("openclaw") ? "border-purple-500/30 text-purple-400"
                            : "border-cyan/30 text-cyan/70",
                        )}>
                          {detail.source === "batchdata" ? "BD" : String(detail.source).startsWith("openclaw") ? "OC" : "PR"}
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
                      detail.source === "batchdata" ? "border-emerald-500/30 text-emerald-400"
                        : String(detail.source).startsWith("openclaw") ? "border-purple-500/30 text-purple-400"
                        : "border-cyan/30 text-cyan/70",
                    )}>
                      {detail.source === "batchdata" ? "BD" : String(detail.source).startsWith("openclaw") ? "OC" : "PR"}
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
                        person.source === "batchdata" ? "border-emerald-500/30 text-emerald-400"
                          : String(person.source).startsWith("openclaw") ? "border-purple-500/30 text-purple-400"
                          : "border-cyan/30 text-cyan/70",
                      )}>
                        {person.source === "batchdata" ? "BD" : String(person.source).startsWith("openclaw") ? "OC" : "PR"}
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

      {/* ── Research Findings (distress events with source links) ── */}
      <ResearchFindings propertyId={cf.propertyId} ownerFlags={cf.ownerFlags} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════

function OverviewTab({ cf, computedArv, skipTracing, skipTraceResult, skipTraceMs, overlay, skipTraceError, onSkipTrace, onManualSkipTrace, onEdit, onDial, onSms, calling, dialHistory, autofilling, onAutofill, deepCrawling, deepCrawlResult, deepCrawlExpanded, setDeepCrawlExpanded, executeDeepCrawl, hasSavedReport, loadingReport, loadSavedReport, crawlSteps, deepSkipResult }: {
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
  hasSavedReport: boolean; loadingReport: boolean; loadSavedReport: () => void;
  crawlSteps: CrawlStep[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deepSkipResult: any;
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

  // Rich phone/email details from dual skip-trace — ranked by contact likelihood
  const rawPhoneDetailsOverview: PhoneDetail[] = overlay?.phoneDetails
    ?? (cf.ownerFlags?.all_phones as PhoneDetail[] | undefined)?.filter((p) => typeof p === "object" && p !== null && "number" in p)
    ?? [];
  const phoneDetails = rankPhones(rawPhoneDetailsOverview);
  const emailDetails: EmailDetail[] = overlay?.emailDetails
    ?? (cf.ownerFlags?.all_emails as EmailDetail[] | undefined)?.filter((e) => typeof e === "object" && e !== null && "email" in e)
    ?? [];
  const isLitigator = overlay?.isLitigator ?? (cf.ownerFlags?.is_litigator as boolean) ?? false;
  const hasDncNumbers = overlay?.hasDncNumbers ?? (cf.ownerFlags?.has_dnc_numbers as boolean) ?? false;
  const skipProviders = overlay?.providers ?? (cf.ownerFlags?.skip_trace_providers as string[]) ?? [];

  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreType | null>(null);
  const canEdit = ["prospect", "lead"].includes(cf.status);

  const { brief, loading: briefLoading, regenerate: regenerateBrief } = usePreCallBrief(cf.id);

  // Use ranked best phone (not just first phone in insertion order)
  const bestPhone = (phoneDetails[0]?.number) ?? allPhones[0] ?? displayPhone;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obitNextOfKin = (cf.ownerFlags?.obit_next_of_kin as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obitMailAddress = cf.ownerFlags?.obit_mail_address as { address: string; city: string; state: string; zip: string } | null ?? null;
  const obitMatchConfidence = cf.ownerFlags?.obit_match_confidence as number | undefined;
  const isObitRecord = !!(cf.ownerFlags?.crawler_source as string)?.startsWith("obituary:");

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

  // ── Zillow photo carousel ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oFlags = cf.ownerFlags as any;
  const cachedPhotos: string[] = (oFlags?.photos ?? oFlags?.deep_crawl?.photos ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean);
  const [zillowPhotos, setZillowPhotos] = useState<string[]>(cachedPhotos);
  const [zPhotoIdx, setZPhotoIdx] = useState(0);
  const [zPhotosLoading, setZPhotosLoading] = useState(false);

  useEffect(() => {
    // Re-fetch if fewer than 3 cached photos (old caches had only 1 Street View)
    if (cachedPhotos.length >= 3 || !cf.fullAddress) return;
    let cancelled = false;
    setZPhotosLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/property-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: cf.fullAddress, property_id: cf.propertyId, lat: propLat, lng: propLng }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.photos?.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setZillowPhotos(data.photos.map((p: any) => (typeof p === "string" ? p : p.url)));
        }
      } catch { /* ignore */ }
      if (!cancelled) setZPhotosLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cf.fullAddress, cf.propertyId]);

  const allPhotos = zillowPhotos.length > 0 ? zillowPhotos : [];

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
      case "tired_landlord": return "Long-term landlord showing signs of fatigue — may want to exit their rental portfolio";
      case "underwater": return "Negative equity means the owner owes more than the home is worth — potential short sale candidate";
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

          {/* Obituary: Next-of-Kin + Match Confidence */}
          {isObitRecord && (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] text-purple-400/80 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />Obituary Record
                {obitMatchConfidence != null && (
                  <span className={cn("ml-auto text-[9px] font-mono", obitMatchConfidence >= 0.90 ? "text-emerald-400" : obitMatchConfidence >= 0.70 ? "text-amber-400" : "text-red-400")}>
                    Match: {Math.round(obitMatchConfidence * 100)}%
                  </span>
                )}
              </p>

              {obitMailAddress && (
                <div className="rounded-md border border-purple-500/15 bg-purple-500/[0.04] p-2.5 text-xs space-y-0.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-purple-400/60" />
                    <span className="text-muted-foreground">Mailing Address</span>
                  </div>
                  <div className="pl-5 text-foreground">
                    {obitMailAddress.address}{obitMailAddress.city ? `, ${obitMailAddress.city}` : ""}{obitMailAddress.state ? ` ${obitMailAddress.state}` : ""} {obitMailAddress.zip ?? ""}
                  </div>
                </div>
              )}

              {obitNextOfKin.length > 0 && (
                <>
                  <p className="text-[10px] text-purple-400/60 uppercase tracking-wider">Next of Kin (from obituary)</p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {obitNextOfKin.map((kin: any, i: number) => (
                    <div key={i} className="rounded-md border border-purple-500/15 bg-purple-500/[0.04] p-2 text-xs flex items-center gap-2">
                      <User className="h-3 w-3 text-purple-400/60 shrink-0" />
                      <span className="font-semibold text-foreground">{kin.name}</span>
                      <span className="text-muted-foreground text-[10px]">({kin.relationship})</span>
                    </div>
                  ))}
                </>
              )}
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
            {/* Deep Crawl button — 4 states: idle, crawling, saved (not loaded), loaded */}
            {deepCrawlResult ? (
              <button
                onClick={() => setDeepCrawlExpanded(!deepCrawlExpanded)}
                className="h-6 px-2.5 rounded-md text-[9px] font-semibold border flex items-center gap-1 transition-colors border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400 hover:bg-emerald-500/[0.12]"
              >
                <FileText className="h-3 w-3" />
                {deepCrawlExpanded ? "Hide Report" : "Deep Crawl Report"}
              </button>
            ) : hasSavedReport ? (
              <button
                onClick={loadSavedReport}
                disabled={loadingReport}
                className="h-6 px-2.5 rounded-md text-[9px] font-semibold border flex items-center gap-1 transition-colors border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-400 hover:bg-emerald-500/[0.12]"
              >
                {loadingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                {loadingReport ? "Loading Report..." : "View Saved Report"}
              </button>
            ) : (
              <button
                onClick={executeDeepCrawl}
                disabled={deepCrawling}
                className="h-6 px-2.5 rounded-md text-[9px] font-semibold border flex items-center gap-1 transition-colors border-amber-500/30 bg-amber-500/[0.06] text-amber-400 hover:bg-amber-500/[0.12]"
              >
                {deepCrawling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                {deepCrawling ? "Deep Crawling..." : "~120s Deep Crawl"}
              </button>
            )}
          </div>
          {distressEvents.length > 0 ? (() => {
            // Sort events by urgency tier (CRITICAL first) then by recency
            const eventsWithUrgency = distressEvents.map((evt) => ({
              ...evt,
              urgency: getDistressUrgency(evt.event_type, evt.created_at, evt.raw_data ?? undefined),
            })).sort((a, b) => {
              const tierDiff = URGENCY_SORT[a.urgency.tier] - URGENCY_SORT[b.urgency.tier];
              if (tierDiff !== 0) return tierDiff;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });

            return (
              <div className="space-y-1.5">
                {eventsWithUrgency.slice(0, 8).map((evt) => {
                  const cfg = DISTRESS_CFG[evt.event_type];
                  const EvtIcon = cfg?.icon ?? AlertTriangle;
                  const evtDate = getEventDate(evt);
                  const tierStyle = URGENCY_TIER_STYLES[evt.urgency.tier];
                  const countdown = evt.urgency.daysUntilCritical;

                  return (
                    <div
                      key={evt.id}
                      title={evt.urgency.pitch}
                      className={cn(
                        "rounded-[8px] border px-2.5 py-1.5 cursor-default transition-colors",
                        tierStyle.color,
                        evt.urgency.tier === "CRITICAL" && "ring-1 ring-red-500/40",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <EvtIcon className="h-3 w-3 shrink-0" />
                        <span className="text-[10px] font-bold uppercase tracking-wider flex-1">
                          {cfg?.label ?? evt.event_type.replace(/_/g, " ")}
                        </span>
                        {/* Urgency tier badge */}
                        <span className={cn("text-[7px] font-bold px-1.5 py-0 rounded-full border uppercase tracking-widest", tierStyle.badge)}>
                          {evt.urgency.tier}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] opacity-70">
                          {evtDate.isActual ? "Filed" : "Detected"} {evtDate.date}
                        </span>
                        {countdown !== null && countdown <= 90 && (
                          <span className={cn(
                            "text-[9px] font-bold font-mono",
                            countdown <= 7 ? "text-red-400" : countdown <= 30 ? "text-orange-400" : "text-amber-400",
                          )}>
                            {countdown === 0 ? "TODAY" : countdown === 1 ? "TOMORROW" : `${countdown}d left`}
                          </span>
                        )}
                        {/* Pitch hint — only show for CRITICAL/URGENT */}
                        {(evt.urgency.tier === "CRITICAL" || evt.urgency.tier === "URGENT") && (
                          <span className="text-[8px] opacity-50 italic truncate flex-1 text-right">
                            {evt.urgency.pitch.split("—")[0]?.trim()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {eventsWithUrgency.length > 8 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-semibold border border-white/10 text-muted-foreground bg-white/[0.03]">
                    +{eventsWithUrgency.length - 8} more
                  </span>
                )}
              </div>
            );
          })() : (
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

      {/* ═══ 3b. DEEP CRAWL PROGRESS + RESULTS (collapsible) ═══ */}
      <AnimatePresence>
        {/* SSE Progress Indicator (during active crawl) */}
        {deepCrawling && crawlSteps.length > 0 && !deepCrawlResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <CrawlProgressIndicator steps={crawlSteps} />
          </motion.div>
        )}

        {/* Deep Crawl Report */}
        {deepCrawlResult && deepCrawlExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <DeepCrawlPanel result={deepCrawlResult} onRecrawl={executeDeepCrawl} isRecrawling={deepCrawling} />
          </motion.div>
        )}

        {/* Deep Skip Report (people intelligence) */}
        {deepCrawlExpanded && (deepSkipResult || deepCrawlResult?.deepSkip) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <DeepSkipPanel result={deepSkipResult ?? deepCrawlResult?.deepSkip} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ 4. PROPERTY SNAPSHOT — Photo Carousel + Address + Badges ═══ */}
      <div ref={sectionProperty} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {(allPhotos.length > 0 || imageUrl) && (
          <div className="relative block h-40 group">
            {allPhotos.length > 0 ? (
              <>
                <img
                  src={allPhotos[zPhotoIdx]}
                  alt={`Property photo ${zPhotoIdx + 1}`}
                  className="w-full h-full object-cover"
                />
                {allPhotos.length > 1 && (
                  <>
                    <button
                      onClick={() => setZPhotoIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setZPhotoIdx((i) => (i + 1) % allPhotos.length)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 z-10">
                  <ImageIcon className="h-2.5 w-2.5" />{zPhotoIdx + 1} / {allPhotos.length}
                </div>
              </>
            ) : (
              <a
                href={streetViewLink ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full cursor-pointer"
                onClick={(e) => { if (!streetViewLink) e.preventDefault(); }}
              >
                <img
                  src={imageUrl!}
                  alt="Property"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {streetViewLink && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <ExternalLink className="h-3 w-3" />{streetViewUrl ? "Open Street View" : "Open in Google Maps"}
                    </span>
                  </div>
                )}
              </a>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,7,13,0.85)] via-[rgba(7,7,13,0.2)] to-transparent pointer-events-none" />
            {zPhotosLoading && allPhotos.length === 0 && (
              <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-1 z-10">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />Loading photos...
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
                <ImageIcon className="h-2.5 w-2.5" />{allPhotos.length > 0 ? `${allPhotos.length} photos · Zillow` : streetViewLink ? `Click to explore · ${imageLabel}` : imageLabel}
              </div>
            </div>
          </div>
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

          {/* Distress type pill badges — sorted by urgency */}
          {(cf.tags.length > 0 || warningFlags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {[...cf.tags].filter((t) => !t.startsWith("score-"))
                .sort((a, b) => {
                  const urgA = getDistressUrgency(a, new Date().toISOString());
                  const urgB = getDistressUrgency(b, new Date().toISOString());
                  return URGENCY_SORT[urgA.tier] - URGENCY_SORT[urgB.tier];
                })
                .map((tag) => {
                const cfg = DISTRESS_CFG[tag];
                const urgency = getDistressUrgency(tag, new Date().toISOString());
                const tierStyle = URGENCY_TIER_STYLES[urgency.tier];
                return (
                  <span key={tag} title={urgency.pitch} className={cn(
                    "inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                    tierStyle.color,
                    urgency.tier === "CRITICAL" && "animate-pulse",
                  )}>
                    {cfg?.label ?? tag.replace(/_/g, " ")}
                    {urgency.tier !== "LOW" && (
                      <span className={cn("text-[7px] opacity-80")}>{urgency.tier === "CRITICAL" ? "!!!" : urgency.tier === "URGENT" ? "!!" : "!"}</span>
                    )}
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

      {/* ═══ 4b. OWNER PORTFOLIO — Adjacent parcels for deal context ═══ */}
      <OwnerPortfolio
        propertyId={cf.propertyId}
        ownerName={cf.ownerName}
        county={cf.county}
        ownerFlags={cf.ownerFlags}
        estimatedValue={cf.estimatedValue}
      />

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
                {(() => { const tv = Number(cf.ownerFlags?.tax_assessed_value) || 0; return tv > 0 ? <p className="text-amber-400/80">Tax {formatCurrency(tv)}</p> : null; })()}
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

      {/* ── Quick Call Summary (compact inline) ── */}
      {(cf.totalCalls > 0 || cf.lastContactAt) && (
        <div className="flex items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
          <Phone className="h-3.5 w-3.5 text-cyan shrink-0" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold shrink-0">Call Summary</p>
          <div className="flex items-center gap-2 ml-2 text-[11px] text-foreground/80 flex-wrap">
            {cf.lastContactAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground/50" />
                Last called: <span className="font-medium text-foreground">{(() => {
                  const diff = Date.now() - new Date(cf.lastContactAt).getTime();
                  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                  if (days === 0) return "Today";
                  if (days === 1) return "1d ago";
                  return `${days}d ago`;
                })()}</span>
              </span>
            )}
            {cf.lastContactAt && cf.totalCalls > 0 && <span className="text-muted-foreground/30">|</span>}
            {cf.totalCalls > 0 && (
              <span>Total: <span className="font-medium text-foreground">{cf.totalCalls}</span></span>
            )}
            {cf.liveAnswers > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>Live: <span className="font-medium text-emerald-400">{cf.liveAnswers}</span></span>
              </>
            )}
            {cf.voicemailsLeft > 0 && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>VM: <span className="font-medium text-blue-400">{cf.voicemailsLeft}</span></span>
              </>
            )}
            {callHistory.length > 0 && callHistory[0].disposition && (
              <>
                <span className="text-muted-foreground/30">|</span>
                <span>Last: <span className="font-medium text-purple-300">{callHistory[0].disposition}</span></span>
              </>
            )}
          </div>
          {cf.nextCallScheduledAt && (
            <span className="ml-auto text-[10px] text-cyan/70 flex items-center gap-1 shrink-0">
              <Calendar className="h-3 w-3" />
              Next: {new Date(cf.nextCallScheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* ── Call Playbook — Grok AI (upgraded pre-call brief) ── */}
      {brief || briefLoading ? (
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
            ) : (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
                <span className="text-xs text-purple-300/60">Generating playbook…</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Compact empty-state: single line instead of full card */
        <div className="flex items-center gap-2 rounded-[10px] border border-purple-500/10 bg-purple-500/[0.02] px-3 py-2">
          <Brain className="h-3.5 w-3.5 text-purple-400/40" />
          <p className="text-[11px] text-muted-foreground/40 italic">No call playbook yet</p>
          <button
            onClick={regenerateBrief}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-purple-400/60 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Generate
          </button>
        </div>
      )}

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
          {(prRaw.AssessedValue || cf.ownerFlags?.tax_assessed_value || lastTransferType || cf.lastSalePrice) && (
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 col-span-2">
              <div className="flex items-start gap-2">
                <Banknote className="h-3.5 w-3.5 text-cyan/60 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">Tax &amp; Transfer</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    {(prRaw.AssessedValue || cf.ownerFlags?.tax_assessed_value) && (
                      <p className="text-muted-foreground">Tax Assessed: <span className="text-amber-400 font-medium">{formatCurrency(Number(prRaw.AssessedValue || cf.ownerFlags?.tax_assessed_value))}</span></p>
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
          {cf.prediction ? (
            <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-2.5 col-span-2">
              <div className="flex items-start gap-2">
                <Zap className="h-3.5 w-3.5 text-purple-400/70 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">Predictive Intelligence</p>
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
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5 col-span-2">
              <Zap className="h-3 w-3 text-purple-400/30 shrink-0" />
              <p className="text-[10px] text-muted-foreground/35 italic">No predictive data yet</p>
            </div>
          )}
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

// ── Comp detail panel with auto-fetching Zillow photo carousel ────────

function CompDetailPanel({ comp, onClose }: { comp: CompProperty; onClose: () => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [enrichData, setEnrichData] = useState<{
    saleHistory?: { saleAmount: number; saleDate: string | null; buyer?: string | null; seller?: string | null; pricePerSqft?: number | null }[];
    assessmentHistory?: { year: number; assessedValue: number; marketValue?: number | null; taxAmount?: number | null }[];
    avmTrend?: { date: string; value: number }[];
    rentalAvm?: number | null;
    rentalAvmHigh?: number | null;
    rentalAvmLow?: number | null;
    countySales?: { date: string; price: number; year: number }[];
  } | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [activeEnrichTab, setActiveEnrichTab] = useState<"details" | "history" | "values">("details");

  // Build full address for photo lookup
  const fullAddress = [comp.streetAddress, comp.city, comp.state, comp.zip].filter(Boolean).join(", ");

  // Auto-fetch photos from Zillow via Apify
  useEffect(() => {
    if (!fullAddress) return;
    let cancelled = false;
    setLoading(true);
    setPhotos([]);
    setPhotoIdx(0);
    (async () => {
      try {
        const res = await fetch("/api/property-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: fullAddress, lat: comp.lat, lng: comp.lng }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.photos?.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setPhotos(data.photos.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean));
        }
      } catch { /* ignore — fallback to street view / satellite */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fullAddress]);

  // Auto-fetch enrichment data (sale history, assessment history, AVM trends, rental AVM)
  useEffect(() => {
    if (!comp.apn && !comp.streetAddress) return;
    let cancelled = false;
    setEnriching(true);
    setEnrichData(null);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const address2 = [comp.city, comp.state, comp.zip].filter(Boolean).join(", ");
        const res = await fetch("/api/comps/enrich", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            apn: comp.apn || undefined,
            address: comp.streetAddress || undefined,
            address2: address2 || undefined,
            county: comp.county || undefined,
            state: comp.state || undefined,
          }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.success) {
          setEnrichData(data);
        }
      } catch { /* ignore — enrichment is best-effort */ }
      if (!cancelled) setEnriching(false);
    })();
    return () => { cancelled = true; };
  }, [comp.apn, comp.streetAddress, comp.city, comp.state, comp.zip, comp.county]);

  // Fallback image sources
  const fallbackSrc = comp.photoUrl
    ?? comp.streetViewUrl
    ?? (comp.lat && comp.lng ? getSatelliteTileUrl(comp.lat, comp.lng, 17) : null);

  const allPhotos = photos.length > 0 ? photos : (fallbackSrc ? [fallbackSrc] : []);
  const safeIdx = allPhotos.length > 0 ? photoIdx % allPhotos.length : 0;

  const hasSaleHistory = (enrichData?.saleHistory?.length ?? 0) > 0;
  const hasAssessment = (enrichData?.assessmentHistory?.length ?? 0) > 0;
  const hasAvmTrend = (enrichData?.avmTrend?.length ?? 0) > 0;
  const hasRental = enrichData?.rentalAvm != null;
  const hasCountySales = (enrichData?.countySales?.length ?? 0) > 0;
  const hasEnrichData = hasSaleHistory || hasAssessment || hasAvmTrend || hasRental || hasCountySales;

  return (
    <div className="rounded-[10px] border border-cyan/20 bg-[rgba(12,12,22,0.6)] backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-cyan/[0.04]">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-cyan" />
          {comp.streetAddress}
          {comp.source && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground font-normal">
              {comp.source === "propertyradar" ? "PR" : comp.source === "attom" ? "ATTOM" : comp.source === "county_arcgis" ? "County" : comp.source}
            </span>
          )}
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex">
        {/* Photo carousel */}
        <div className="w-64 h-44 shrink-0 border-r border-white/[0.06] bg-black/30 relative group">
          {loading && allPhotos.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-cyan animate-spin" />
              <span className="ml-2 text-[10px] text-muted-foreground">Fetching photos…</span>
            </div>
          ) : allPhotos.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={allPhotos[safeIdx]}
                alt={`Comp photo ${safeIdx + 1}`}
                className="h-full w-full object-cover"
              />
              {allPhotos.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoIdx((i) => (i - 1 + allPhotos.length) % allPhotos.length)}
                    className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPhotoIdx((i) => (i + 1) % allPhotos.length)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 right-2 text-[9px] bg-black/60 text-white/80 px-1.5 py-0.5 rounded-full">
                    {safeIdx + 1}/{allPhotos.length}
                  </span>
                </>
              )}
              {loading && (
                <span className="absolute top-1.5 right-2 text-[8px] bg-black/60 text-cyan px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />loading more
                </span>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
              <span className="ml-2 text-[10px] text-muted-foreground">No photos available</span>
            </div>
          )}
        </div>
        {/* Property details */}
        <div className="flex-1 p-3 min-w-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
            <div><span className="text-muted-foreground">Beds:</span> <span className="font-medium">{comp.beds ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Baths:</span> <span className="font-medium">{comp.baths ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Sqft:</span> <span className="font-medium">{comp.sqft?.toLocaleString() ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Year:</span> <span className="font-medium">{comp.yearBuilt ?? "—"}</span></div>
            <div><span className="text-muted-foreground">AVM:</span> <span className="font-medium text-neon">{comp.avm ? formatCurrency(comp.avm) : "—"}</span></div>
            <div><span className="text-muted-foreground">Last Sale:</span> <span className="font-medium">{comp.lastSalePrice ? formatCurrency(comp.lastSalePrice) : "—"}</span></div>
            {comp.lastSaleDate && (
              <div><span className="text-muted-foreground">Sale Date:</span> <span className="font-medium">{new Date(comp.lastSaleDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
            )}
            {comp.lotSize != null && (
              <div><span className="text-muted-foreground">Lot:</span> <span className="font-medium">{comp.lotSize.toLocaleString()} sqft</span></div>
            )}
            {comp.sqft != null && (comp.lastSalePrice ?? comp.avm) ? (
              <div><span className="text-muted-foreground">$/sqft:</span> <span className="font-medium">${Math.round((comp.lastSalePrice ?? comp.avm ?? 0) / comp.sqft)}</span></div>
            ) : null}
            {hasRental && (
              <div className="col-span-2 pt-1 border-t border-white/[0.06]">
                <span className="text-muted-foreground">Rental Est:</span>{" "}
                <span className="font-medium text-emerald-400">
                  {formatCurrency(enrichData!.rentalAvm!)}/mo
                </span>
                {enrichData!.rentalAvmLow != null && enrichData!.rentalAvmHigh != null && (
                  <span className="text-[9px] text-muted-foreground ml-1">
                    ({formatCurrency(enrichData!.rentalAvmLow)} – {formatCurrency(enrichData!.rentalAvmHigh)})
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {comp.isVacant && <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20">Vacant</span>}
            {comp.isAbsentee && <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20">Absentee</span>}
            {comp.isFreeAndClear && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Free & Clear</span>}
            {comp.isForeclosure && <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/10 text-red-400 border border-red-500/20">Foreclosure</span>}
            {comp.isListedForSale && <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-400 border border-purple-500/20">Listed</span>}
            {comp.isRecentSale && <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan/10 text-cyan border border-cyan/20">Recent Sale</span>}
          </div>
          {comp.lat && comp.lng && (
            <a
              href={getGoogleStreetViewLink(comp.lat, comp.lng)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[9px] text-cyan hover:underline mt-2"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Street View
            </a>
          )}
        </div>
      </div>

      {/* Enhanced data tabs (ATTOM + County) */}
      {enriching && (
        <div className="px-4 py-2 border-t border-white/[0.06] flex items-center gap-2 text-[10px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin text-cyan" />
          Loading sale history, valuations & market data…
        </div>
      )}
      {hasEnrichData && (
        <div className="border-t border-white/[0.06]">
          {/* Sub-tabs */}
          <div className="flex border-b border-white/[0.06]">
            {[
              { key: "details" as const, label: "Details" },
              ...(hasSaleHistory || hasCountySales ? [{ key: "history" as const, label: `Sale History (${(enrichData?.saleHistory?.length ?? 0) + (enrichData?.countySales?.length ?? 0)})` }] : []),
              ...(hasAssessment || hasAvmTrend ? [{ key: "values" as const, label: "Value Trends" }] : []),
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveEnrichTab(tab.key)}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-medium transition-colors",
                  activeEnrichTab === tab.key
                    ? "text-cyan border-b border-cyan bg-cyan/[0.04]"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sale History tab */}
          {activeEnrichTab === "history" && (hasSaleHistory || hasCountySales) && (
            <div className="max-h-40 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.03]">
                    <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Price</th>
                    <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">$/sqft</th>
                    <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Buyer</th>
                    <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Src</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichData?.saleHistory?.map((s, i) => (
                    <tr key={`attom-${i}`} className="border-b border-white/[0.06]/50 hover:bg-white/[0.03]">
                      <td className="px-3 py-1">{s.saleDate ? new Date(s.saleDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</td>
                      <td className="px-3 py-1 text-right font-medium">{formatCurrency(s.saleAmount)}</td>
                      <td className="px-3 py-1 text-right">{s.pricePerSqft ? `$${Math.round(s.pricePerSqft)}` : "—"}</td>
                      <td className="px-3 py-1 truncate max-w-[120px]">{s.buyer ?? "—"}</td>
                      <td className="px-3 py-1"><span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400">ATTOM</span></td>
                    </tr>
                  ))}
                  {enrichData?.countySales?.map((s, i) => (
                    <tr key={`county-${i}`} className="border-b border-white/[0.06]/50 hover:bg-white/[0.03]">
                      <td className="px-3 py-1">{s.date ? new Date(s.date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"}</td>
                      <td className="px-3 py-1 text-right font-medium">{formatCurrency(s.price)}</td>
                      <td className="px-3 py-1 text-right">—</td>
                      <td className="px-3 py-1">—</td>
                      <td className="px-3 py-1"><span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400">County</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Value Trends tab */}
          {activeEnrichTab === "values" && (hasAssessment || hasAvmTrend) && (
            <div className="px-3 py-2 space-y-3 max-h-48 overflow-y-auto">
              {/* Assessment history */}
              {hasAssessment && (
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Assessment History
                  </p>
                  <div className="space-y-1">
                    {enrichData?.assessmentHistory?.slice(0, 5).map((a, i) => {
                      const prevYear = enrichData.assessmentHistory?.[i + 1];
                      const pctChange = prevYear?.assessedValue
                        ? Math.round(((a.assessedValue - prevYear.assessedValue) / prevYear.assessedValue) * 100)
                        : null;
                      return (
                        <div key={a.year} className="flex items-center gap-3 text-[10px]">
                          <span className="text-muted-foreground w-8">{a.year}</span>
                          <span className="font-medium flex-1">{formatCurrency(a.assessedValue)}</span>
                          {a.marketValue != null && (
                            <span className="text-muted-foreground">Mkt: {formatCurrency(a.marketValue)}</span>
                          )}
                          {a.taxAmount != null && (
                            <span className="text-muted-foreground">Tax: {formatCurrency(a.taxAmount)}</span>
                          )}
                          {pctChange != null && (
                            <span className={cn("text-[9px] font-medium",
                              pctChange > 0 ? "text-emerald-400" : pctChange < 0 ? "text-red-400" : "text-muted-foreground"
                            )}>
                              {pctChange > 0 ? "+" : ""}{pctChange}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AVM trend */}
              {hasAvmTrend && (
                <div>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    AVM Trend
                  </p>
                  <div className="space-y-1">
                    {enrichData?.avmTrend?.slice(-5).reverse().map((p, i, arr) => {
                      const prevPoint = arr[i + 1];
                      const pctChange = prevPoint
                        ? Math.round(((p.value - prevPoint.value) / prevPoint.value) * 100)
                        : null;
                      return (
                        <div key={p.date} className="flex items-center gap-3 text-[10px]">
                          <span className="text-muted-foreground w-20">{new Date(p.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                          <span className="font-medium text-neon flex-1">{formatCurrency(p.value)}</span>
                          {pctChange != null && (
                            <span className={cn("text-[9px] font-medium",
                              pctChange > 0 ? "text-emerald-400" : pctChange < 0 ? "text-red-400" : "text-muted-foreground"
                            )}>
                              {pctChange > 0 ? "+" : ""}{pctChange}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Details tab (default — shows when no enrichment sub-tab is active) */}
          {activeEnrichTab === "details" && hasRental && (
            <div className="px-3 py-2 text-[10px] space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Rental Est.</span>
                <span className="font-medium text-emerald-400">{formatCurrency(enrichData!.rentalAvm!)}/mo</span>
              </div>
              {enrichData!.rentalAvmLow != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rental Range</span>
                  <span className="font-medium">{formatCurrency(enrichData!.rentalAvmLow!)} – {formatCurrency(enrichData!.rentalAvmHigh!)}</span>
                </div>
              )}
              {comp.avm && enrichData!.rentalAvm && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Rent Multiplier</span>
                  <span className="font-medium">{(comp.avm / (enrichData!.rentalAvm! * 12)).toFixed(1)}</span>
                </div>
              )}
              {comp.lastSalePrice && enrichData!.rentalAvm && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cap Rate (est.)</span>
                  <span className="font-medium">{((enrichData!.rentalAvm! * 12 * 0.55) / comp.lastSalePrice * 100).toFixed(1)}%</span>
                </div>
              )}
            </div>
          )}
        </div>
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
  const [focusedComp, setFocusedComp] = useState<CompProperty | null>(null);
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
  const [rehabEst, setRehabEst] = useState(40000);
  const [assignFeeEst, setAssignFeeEst] = useState(15000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oFlagsComps = (cf.ownerFlags ?? {}) as any;
  const cachedPhotos = useMemo(() => {
    const urls: string[] = [];
    // Zillow photos from owner_flags (cached from Apify)
    const cached = oFlagsComps?.photos ?? oFlagsComps?.deep_crawl?.photos ?? [];
    if (Array.isArray(cached)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      urls.push(...cached.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean));
    }
    // PropertyRadar photos
    if (Array.isArray(prRaw.Photos)) urls.push(...prRaw.Photos.filter((u: unknown) => typeof u === "string"));
    if (Array.isArray(prRaw.photos)) urls.push(...prRaw.photos.filter((u: unknown) => typeof u === "string"));
    if (typeof prRaw.PropertyImageUrl === "string" && prRaw.PropertyImageUrl) urls.push(prRaw.PropertyImageUrl);
    if (typeof prRaw.StreetViewUrl === "string" && prRaw.StreetViewUrl) urls.push(prRaw.StreetViewUrl);
    // Deduplicate
    return [...new Set(urls)];
  }, [prRaw, oFlagsComps]);

  // Auto-fetch photos from Google Places if none cached
  const [fetchedPhotos, setFetchedPhotos] = useState<string[]>([]);
  useEffect(() => {
    // Re-fetch if fewer than 3 cached photos (old caches had only 1 Street View)
    if (cachedPhotos.length >= 3 || !cf.fullAddress) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/property-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: cf.fullAddress, property_id: cf.propertyId, lat, lng }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (data.photos?.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setFetchedPhotos(data.photos.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean));
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cf.fullAddress, cf.propertyId, lat, lng]);

  const photos = cachedPhotos.length > 0 ? cachedPhotos : fetchedPhotos;

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

  // Wholesale math: Buyer's MAO = ARV × 70% − Rehab; Your MAO = Buyer's MAO − Assignment Fee
  const compsBuyerMao = Math.round(arv * 0.70 - rehabEst);
  const compsYourMao = Math.round(compsBuyerMao - assignFeeEst);
  const compsSpread = assignFeeEst;

  useEffect(() => { if (arv > 0) onArvChange(arv); }, [arv, onArvChange]);

  if (geocoding) {
    return (
      <div className="text-center py-12">
        <Loader2 className="h-10 w-10 text-cyan mx-auto mb-3 animate-spin" />
        <p className="text-sm text-muted-foreground">Geocoding address...</p>
      </div>
    );
  }

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

  const hasCoords = !!(lat && lng);

  const subject: SubjectProperty = {
    lat: lat ?? 0, lng: lng ?? 0, address: cf.fullAddress,
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

      {/* Interactive map — only when we have coordinates */}
      {hasCoords ? (
        <CompsMap
          subject={subject}
          selectedComps={selectedComps}
          onAddComp={onAddComp}
          onRemoveComp={onRemoveComp}
          focusedComp={focusedComp}
        />
      ) : (
        <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <MapPin className="h-6 w-6 text-amber-400 mx-auto mb-2" />
          <p className="text-xs font-medium text-amber-300 mb-1">No coordinates available</p>
          <p className="text-[10px] text-muted-foreground mb-3">Map view requires lat/lng. ARV and deal numbers still work below.</p>
          <button
            onClick={handleRetryGeocode}
            disabled={geocoding}
            className="px-3 py-1.5 rounded-md text-[10px] font-medium bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/20 transition-colors"
          >
            {geocoding ? "Geocoding..." : "Try Geocode"}
          </button>
          {geocodeError && <p className="text-[10px] text-red-400 mt-2">{geocodeError}</p>}
        </div>
      )}

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
                  <tr key={comp.apn} className="border-b border-white/[0.06]/50 hover:bg-white/[0.04] cursor-pointer" onClick={() => setFocusedComp(prev => prev?.apn === comp.apn ? null : comp)}>
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

      {/* Focused comp detail panel with photo carousel */}
      {focusedComp && (
        <CompDetailPanel comp={focusedComp} onClose={() => setFocusedComp(null)} />
      )}

      {/* Condition Adjustment slider */}
      <div className="rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Condition Adjustment</p>
          <span className={cn("text-xs font-bold", conditionAdj > 0 ? "text-emerald-400" : conditionAdj < 0 ? "text-red-400" : "text-muted-foreground")}>
            {CONDITION_LABELS[conditionAdj] ?? `${conditionAdj > 0 ? "+" : ""}${conditionAdj}%`}
          </span>
        </div>
        <p className="text-[9px] text-muted-foreground/60 mb-2">Adjust the ARV up or down based on the subject property{"'"}s condition relative to the comps. If it needs more work than the comps, slide left. If it{"'"}s in better shape, slide right.</p>
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
            Wholesale Spread
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ARV</span>
              <span className="font-medium">{formatCurrency(arv)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Rehab
                <input type="number" value={rehabEst} onChange={(e) => setRehabEst(Number(e.target.value) || 0)} className="w-16 h-5 text-[10px] text-right bg-white/[0.06] border border-white/[0.1] rounded px-1 font-mono" />
              </span>
              <span className="font-medium text-red-400">-{formatCurrency(rehabEst)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buyer{"'"}s MAO (70%)</span>
              <span className="font-medium">{formatCurrency(compsBuyerMao)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Your Offer</span>
              <span className="font-medium">{formatCurrency(compsYourMao)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                Assign Fee
                <input type="number" value={assignFeeEst} onChange={(e) => setAssignFeeEst(Number(e.target.value) || 0)} className="w-16 h-5 text-[10px] text-right bg-white/[0.06] border border-white/[0.1] rounded px-1 font-mono" />
              </span>
              <span className="font-medium text-emerald-400">+{formatCurrency(assignFeeEst)}</span>
            </div>
            <div className="pt-1.5 mt-1.5 border-t border-white/[0.06] flex justify-between">
              <span className="font-semibold">Assignment Spread</span>
              <span className={cn("font-bold text-lg", compsSpread >= 0 ? "text-neon" : "text-red-400")} style={compsSpread >= 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.3)" } : {}}>
                {formatCurrency(compsSpread)}
              </span>
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
  const [rehab, setRehab] = useState("40000");
  const [assignmentFee, setAssignmentFee] = useState("15000");
  const [closing, setClosing] = useState("3000");

  const arvNum = parseFloat(arv) || 0;
  const rehabNum = parseFloat(rehab) || 0;
  const feeNum = parseFloat(assignmentFee) || 0;
  const closingNum = parseFloat(closing) || 0;

  // Wholesale math: Buyer's MAO = ARV × 70% − Rehab
  const buyerMao = arvNum > 0 ? Math.round(arvNum * 0.70 - rehabNum) : 0;
  // Your MAO = Buyer's MAO − Your Assignment Fee
  const yourMao = buyerMao > 0 ? Math.round(buyerMao - feeNum) : 0;
  // If you offer at Your MAO, your spread = assignment fee
  const assignmentSpread = feeNum;

  return (
    <div className="space-y-4">
      <Section title="Wholesale Deal Inputs" icon={Calculator}>
        {computedArv > 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-cyan/70 mb-2">
            <CheckCircle2 className="h-3 w-3" />
            ARV auto-filled from Comps &amp; ARV tab
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <NumericInput label="ARV (After Repair Value)" value={arv} onChange={setArv} prefix="$" min={0} />
          <NumericInput label="Rehab Estimate" value={rehab} onChange={setRehab} prefix="$" min={0} />
          <NumericInput label="Assignment Fee" value={assignmentFee} onChange={setAssignmentFee} prefix="$" min={0} />
          <NumericInput label="Closing / Earnest" value={closing} onChange={setClosing} prefix="$" min={0} />
        </div>
      </Section>

      <Section title="Wholesale Profit Projection" icon={TrendingUp}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-cyan/20 bg-cyan/4 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Buyer{"'"}s MAO</p>
            <p className="text-xl font-bold text-neon" style={{ textShadow: "0 0 10px rgba(0,212,255,0.3)" }}>
              {buyerMao > 0 ? formatCurrency(buyerMao) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ARV × 70% − Rehab</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/4 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Your MAO (Offer)</p>
            <p className={cn("text-xl font-bold", yourMao > 0 ? "text-emerald-400" : "text-red-400")} style={yourMao > 0 ? { textShadow: "0 0 10px rgba(0,255,136,0.3)" } : undefined}>
              {yourMao > 0 ? formatCurrency(yourMao) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Buyer{"'"}s MAO − Assignment Fee</p>
          </div>
          <div className={cn("rounded-[10px] border p-3 text-center col-span-2", assignmentSpread > 0 ? "border-cyan/20 bg-cyan/4" : "border-white/[0.06] bg-white/[0.04]")}>
            <p className="text-[10px] text-muted-foreground uppercase">Assignment Spread</p>
            <p className={cn("text-2xl font-bold", assignmentSpread > 0 ? "text-neon" : "text-muted-foreground")} style={assignmentSpread > 0 ? { textShadow: "0 0 12px rgba(0,212,255,0.4)" } : undefined}>
              {assignmentSpread > 0 ? formatCurrency(assignmentSpread) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Your profit on this assignment</p>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground/50 italic mt-2">
          70% rule: Cash buyer pays ARV × 70% minus rehab. You make the assignment fee spread.
        </p>
      </Section>

      {yourMao < 0 && arvNum > 0 && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Negative MAO — rehab costs exceed the deal margin. Lower rehab estimate or increase ARV.
        </div>
      )}

      {buyerMao > 0 && arvNum > 0 && (
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 text-[10px] text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground/80 mb-1">Script Helper</p>
          <p>{"\""}I can offer you <span className="font-bold text-neon">{formatCurrency(yourMao)}</span> for the property at {cf.fullAddress}. That{"'"}s a cash offer, close in 2-3 weeks, no inspections, we handle all closing costs.{"\""}
          </p>
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
  const [crawlSteps, setCrawlSteps] = useState<CrawlStep[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deepSkipResult, setDeepSkipResult] = useState<any>(null);

  // Pre-populate deep crawl from cached results
  // Results persist permanently once crawled (like addresses/phone numbers)
  // Uses a ref to avoid infinite re-render loops from ownerFlags dependency
  // Check if a saved Deep Crawl report exists for this property
  const [hasSavedReport, setHasSavedReport] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const deepCrawlCheckedRef = useRef<string | null>(null);

  useEffect(() => {
    const propId = clientFile?.propertyId;
    if (!propId || deepCrawlCheckedRef.current === propId) return;
    deepCrawlCheckedRef.current = propId;

    // First check inline ownerFlags (works for prospects with full data)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inlineCached = (clientFile?.ownerFlags as any)?.deep_crawl;
    if (inlineCached?.crawledAt && (inlineCached.grokSuccess === true || inlineCached.aiDossier?.webFindings?.length > 0)) {
      setHasSavedReport(true);
      return;
    }

    // For leads (ownerFlags is empty), do a lightweight DB check
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase.from("properties") as any)
          .select("owner_flags")
          .eq("id", propId)
          .single();
        const dc = data?.owner_flags?.deep_crawl;
        if (dc?.crawledAt && (dc.grokSuccess === true || dc.aiDossier?.webFindings?.length > 0)) {
          setHasSavedReport(true);
        }
      } catch {
        // Silently fail
      }
    })();
  }, [clientFile?.propertyId, clientFile?.ownerFlags]);

  // Load saved report from DB when user clicks "View Report"
  const loadSavedReport = useCallback(async () => {
    const propId = clientFile?.propertyId;
    if (!propId) return;
    setLoadingReport(true);
    try {
      // First try inline ownerFlags
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inlineCached = (clientFile?.ownerFlags as any)?.deep_crawl;
      if (inlineCached?.crawledAt) {
        setDeepCrawlResult(inlineCached);
        setDeepCrawlExpanded(true);
        // Also load deep skip if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ds = (clientFile?.ownerFlags as any)?.deep_skip ?? inlineCached?.deepSkip;
        if (ds) setDeepSkipResult(ds);
        return;
      }
      // Fetch from DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("properties") as any)
        .select("owner_flags")
        .eq("id", propId)
        .single();
      const dc = data?.owner_flags?.deep_crawl;
      if (dc?.crawledAt) {
        setDeepCrawlResult(dc);
        setDeepCrawlExpanded(true);
        // Also load deep skip
        const ds = data?.owner_flags?.deep_skip ?? dc?.deepSkip;
        if (ds) setDeepSkipResult(ds);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingReport(false);
    }
  }, [clientFile?.propertyId, clientFile?.ownerFlags]);

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
      setHasSavedReport(false);
      setLoadingReport(false);
      setCrawlSteps([]);
      setDeepSkipResult(null);
      deepCrawlCheckedRef.current = null;
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
    setCrawlSteps([]);
    setDeepCrawlExpanded(true); // Show progress immediately
    try {
      const res = await fetch("/api/prospects/deep-crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: clientFile.propertyId, lead_id: clientFile.id }),
      });

      // Check if this is an SSE stream or regular JSON (cached responses are still JSON)
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && res.body) {
        // SSE streaming mode — read events as they arrive
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? ""; // Keep incomplete chunk

          for (const line of lines) {
            const dataLine = line.trim();
            if (!dataLine.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(dataLine.slice(6));

              if (event.phase === "complete" && event.result) {
                // Final event — the full result
                setDeepCrawlResult(event.result);
                setHasSavedReport(true);
                // deepSkip is sent as a sibling field (not nested inside result)
                const ds = event.deepSkip ?? event.result.deepSkip;
                if (ds) {
                  setDeepSkipResult(ds);
                  // Immediately inject new phones/emails into overlay so Contact tab updates
                  // without waiting for full parent re-fetch
                  if (ds.newPhones?.length > 0 || ds.newEmails?.length > 0) {
                    setOverlay(prev => {
                      const base = prev ?? { phones: [], emails: [], persons: [], primaryPhone: null, primaryEmail: null, phoneDetails: [], emailDetails: [], providers: [], isLitigator: false, hasDncNumbers: false };
                      const existingNums = new Set(base.phoneDetails.map((p: PhoneDetail) => p.number.replace(/\D/g, "").slice(-10)));
                      const existingEmails = new Set(base.emailDetails.map((e: EmailDetail) => e.email.toLowerCase()));
                      const addedPhones: PhoneDetail[] = (ds.newPhones ?? [])
                        .filter((np: { number: string }) => !existingNums.has(np.number.replace(/\D/g, "").slice(-10)))
                        .map((np: { number: string; source: string }) => ({
                          number: np.number,
                          lineType: "unknown" as const,
                          confidence: 60,
                          dnc: false,
                          source: `openclaw_${np.source}`,
                        }));
                      const addedEmails: EmailDetail[] = (ds.newEmails ?? [])
                        .filter((ne: { email: string }) => !existingEmails.has(ne.email.toLowerCase()))
                        .map((ne: { email: string; source: string }) => ({
                          email: ne.email,
                          deliverable: true,
                          source: `openclaw_${ne.source}`,
                        }));
                      return {
                        ...base,
                        phoneDetails: [...base.phoneDetails, ...addedPhones],
                        emailDetails: [...base.emailDetails, ...addedEmails],
                        phones: [...base.phones, ...addedPhones.map(p => p.number)],
                        emails: [...base.emails, ...addedEmails.map(e => e.email)],
                      };
                    });
                  }
                }
                toast.success(`Deep Crawl complete — ${event.result.sources?.join(", ") ?? "done"}`);
                // Also re-fetch from parent to get full updated data
                onRefresh?.();
              } else if (event.phase === "error") {
                toast.error(`Deep Crawl failed: ${event.detail}`);
              } else if (event.phase && event.status) {
                // Progress event
                setCrawlSteps(prev => {
                  // Update existing step or add new one
                  const existing = prev.findIndex(s => s.phase === event.phase);
                  if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = { phase: event.phase, status: event.status, detail: event.detail, elapsed: event.elapsed };
                    return updated;
                  }
                  return [...prev, { phase: event.phase, status: event.status, detail: event.detail, elapsed: event.elapsed }];
                });
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } else {
        // Regular JSON response (cached results)
        const data = await res.json();
        if (data.error) {
          toast.error(`Deep Crawl failed: ${data.error}`);
        } else {
          setDeepCrawlResult(data);
          setDeepCrawlExpanded(true);
          setHasSavedReport(true);
          // Backward compat: cached results may still have nested deepSkip
          if (data.deepSkip) setDeepSkipResult(data.deepSkip);
          toast.success(`Deep Crawl complete — ${data.sources?.join(", ") ?? "done"}`);
          onRefresh?.();
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deep Crawl network error");
    } finally {
      setDeepCrawling(false);
      setCrawlSteps([]);
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
                      <OverviewTab cf={clientFile} computedArv={computedArv} skipTracing={skipTracing} skipTraceResult={skipTraceResult} skipTraceMs={skipTraceMs} overlay={overlay} skipTraceError={skipTraceError} onSkipTrace={handleSkipTrace} onManualSkipTrace={handleManualSkipTrace} onEdit={() => setEditOpen(true)} onDial={handleDial} onSms={handleSendSms} calling={calling} dialHistory={dialHistoryMap} autofilling={autofilling} onAutofill={handleAutofill} deepCrawling={deepCrawling} deepCrawlResult={deepCrawlResult} deepCrawlExpanded={deepCrawlExpanded} setDeepCrawlExpanded={setDeepCrawlExpanded} executeDeepCrawl={executeDeepCrawl} hasSavedReport={hasSavedReport} loadingReport={loadingReport} loadSavedReport={loadSavedReport} crawlSteps={crawlSteps} deepSkipResult={deepSkipResult} />
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
