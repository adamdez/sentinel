"use client";

import { Fragment, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, User, Phone, Mail, DollarSign, Home, TrendingUp,
  Calendar, Tag, Shield, Zap, ExternalLink, Clock, AlertTriangle,
  Copy, CheckCircle2, Search, Loader2, Building, Ruler, LandPlot,
  Banknote, Scale, UserX, Eye, FileText, Calculator, Globe, Send,
  Radar, LayoutDashboard, Map, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import type { ProspectRow } from "@/hooks/use-prospects";
import type { LeadRow } from "@/lib/leads-data";
import type { AIScore, DistressType } from "@/lib/types";
import { CompsMap, type CompProperty, type SubjectProperty } from "@/components/sentinel/comps/comps-map";
import { PredictiveDistressBadge, type PredictiveDistressData } from "@/components/sentinel/predictive-distress-badge";

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
  return parts.filter(Boolean).join(", ");
}

export function clientFileFromProspect(p: ProspectRow): ClientFile {
  return {
    id: p.id, propertyId: p.property_id, apn: p.apn, county: p.county,
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
  const sl = (n: number): AIScore["label"] => n >= 85 ? "fire" : n >= 65 ? "hot" : n >= 40 ? "warm" : "cold";

  return {
    id: lead.id, propertyId: lead.property_id ?? "", apn: prop.apn ?? "", county: prop.county ?? "",
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
    enriched: flags.source === "propertyradar" || !!flags.radar_id,
    lockVersion: lead.lock_version ?? 0,
    prediction: lead._prediction ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "propertyradar", label: "PropertyRadar", icon: Radar },
  { id: "county", label: "County Records", icon: Globe },
  { id: "comps", label: "Comps & ARV", icon: Map },
  { id: "calculator", label: "Offer Calculator", icon: Calculator },
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
};

const SCORE_LABEL_CFG: Record<AIScore["label"], { text: string; color: string; bg: string }> = {
  fire: { text: "FIRE", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  hot:  { text: "HOT",  color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30" },
  warm: { text: "WARM", color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30" },
  cold: { text: "COLD", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
};

const COUNTY_LINKS: Record<string, { name: string; gis: string; assessor: string; treasurer?: string }> = {
  spokane: {
    name: "Spokane County",
    gis: "https://cp.spokanecounty.org/scout/propertyinformation/",
    assessor: "https://www.spokanecounty.org/236/Assessor",
    treasurer: "https://www.spokanecounty.org/272/Treasurer",
  },
  kootenai: {
    name: "Kootenai County",
    gis: "https://gis.kcgov.us/kootenaimaps/",
    assessor: "https://www.kcgov.us/186/Assessor",
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

function ScoreCard({ label, value }: { label: string; value: number }) {
  const pct = Math.min(value, 100);
  return (
    <div className="rounded-lg border border-glass-border bg-secondary/10 p-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ textShadow: pct >= 80 ? "0 0 10px rgba(0,212,255,0.3)" : undefined }}>{value}</p>
      <div className="h-1 rounded-full bg-secondary mt-2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", pct >= 85 ? "bg-orange-400" : pct >= 65 ? "bg-red-400" : pct >= 40 ? "bg-yellow-400" : "bg-blue-400")} style={{ width: `${pct}%` }} />
      </div>
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
// Tab: Overview
// ═══════════════════════════════════════════════════════════════════════

interface SkipTraceOverlay { phones: string[]; emails: string[]; persons: Record<string, unknown>[]; primaryPhone: string | null; primaryEmail: string | null; }

function OverviewTab({ cf, skipTracing, skipTraceResult, skipTraceMs, overlay, onSkipTrace }: {
  cf: ClientFile; skipTracing: boolean; skipTraceResult: string | null; skipTraceMs: number | null;
  overlay: SkipTraceOverlay | null; onSkipTrace: () => void;
}) {
  const skipTraced = !!overlay || !!cf.ownerFlags?.skip_traced;
  const displayPhone = overlay?.primaryPhone ?? cf.ownerPhone;
  const displayEmail = overlay?.primaryEmail ?? cf.ownerEmail;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persons = overlay?.persons ?? (cf.ownerFlags?.persons as any[]) ?? [];
  const allPhones = overlay?.phones ?? (cf.ownerFlags?.all_phones as string[]) ?? [];
  const allEmails = overlay?.emails ?? (cf.ownerFlags?.all_emails as string[]) ?? [];

  return (
    <div className="space-y-5">
      {/* Score Dashboard */}
      <div className="grid grid-cols-3 gap-3">
        <ScoreCard label="Composite" value={cf.compositeScore} />
        <ScoreCard label="Motivation" value={cf.motivationScore} />
        <ScoreCard label="Deal Score" value={cf.dealScore} />
      </div>

      {/* Predictive Distress Intelligence */}
      {cf.prediction && (
        <Section title="Predictive Intelligence (v2.0)" icon={Zap}>
          <div className="flex items-center gap-3 mb-3">
            <PredictiveDistressBadge data={cf.prediction as PredictiveDistressData} size="lg" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-glass-border bg-secondary/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Distress In</p>
              <p className="text-xl font-bold text-orange-400">~{cf.prediction.daysUntilDistress}d</p>
            </div>
            <div className="rounded-lg border border-glass-border bg-secondary/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Confidence</p>
              <p className="text-xl font-bold text-cyan">{cf.prediction.confidence}%</p>
            </div>
            <div className="rounded-lg border border-glass-border bg-secondary/10 p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pred Score</p>
              <p className="text-xl font-bold">{cf.prediction.predictiveScore}</p>
            </div>
          </div>
          {cf.prediction.ownerAgeInference && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Est. owner age: <span className="text-foreground font-medium">{cf.prediction.ownerAgeInference}</span>
              {cf.prediction.lifeEventProbability != null && cf.prediction.lifeEventProbability > 0.10 && (
                <> &middot; <span className="text-orange-400">Elevated life-event probability ({Math.round(cf.prediction.lifeEventProbability * 100)}%)</span></>
              )}
            </p>
          )}
        </Section>
      )}

      {/* Distress Signals */}
      {cf.tags.length > 0 && (
        <Section title="Distress Signals" icon={AlertTriangle}>
          <div className="flex flex-wrap gap-1.5">
            {cf.tags.map((tag) => {
              const cfg = DISTRESS_CFG[tag];
              const TagIcon = cfg?.icon ?? Tag;
              return (
                <div key={tag} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium", cfg?.color ?? "text-muted-foreground bg-secondary/20 border-glass-border")}>
                  <TagIcon className="h-3 w-3" />{cfg?.label ?? tag}
                </div>
              );
            })}
          </div>
          {cf.foreclosureStage && (
            <div className="mt-2 text-xs text-orange-400">
              Foreclosure Stage: <span className="font-semibold">{cf.foreclosureStage}</span>
              {cf.defaultAmount ? <> &mdash; Default: {formatCurrency(cf.defaultAmount)}</> : null}
            </div>
          )}
          {cf.delinquentAmount != null && cf.delinquentAmount > 0 && (
            <div className="text-xs text-amber-400">Tax Delinquent: <span className="font-semibold">{formatCurrency(cf.delinquentAmount)}</span></div>
          )}
        </Section>
      )}

      {/* Owner Flags */}
      {(cf.isVacant || cf.isAbsentee || cf.isFreeClear || cf.isHighEquity || cf.isCashBuyer) && (
        <div className="flex flex-wrap gap-2">
          <OwnerFlag active={cf.isAbsentee} label="Absentee Owner" icon={UserX} />
          <OwnerFlag active={cf.isVacant} label="Vacant Property" icon={Home} />
          <OwnerFlag active={cf.isFreeClear} label="Free & Clear" icon={CheckCircle2} />
          <OwnerFlag active={cf.isHighEquity} label="High Equity" icon={TrendingUp} />
          <OwnerFlag active={cf.isCashBuyer} label="Cash Buyer" icon={DollarSign} />
        </div>
      )}

      {/* Financial Overview */}
      <Section title="Financial Overview" icon={DollarSign}>
        <div className="grid grid-cols-2 gap-x-6">
          <InfoRow icon={DollarSign} label="ARV / AVM" value={cf.estimatedValue ? formatCurrency(cf.estimatedValue) : null} highlight />
          <InfoRow icon={TrendingUp} label="Equity %" value={cf.equityPercent != null ? `${cf.equityPercent}%` : null} highlight={cf.equityPercent != null && cf.equityPercent > 40} />
          <InfoRow icon={Banknote} label="Available Equity" value={cf.availableEquity ? formatCurrency(cf.availableEquity) : null} />
          <InfoRow icon={Banknote} label="Total Loans" value={cf.totalLoanBalance ? formatCurrency(cf.totalLoanBalance) : null} />
          <InfoRow icon={DollarSign} label="Last Sale Price" value={cf.lastSalePrice ? formatCurrency(cf.lastSalePrice) : null} />
          <InfoRow icon={Calendar} label="Last Sale Date" value={cf.lastSaleDate ? new Date(cf.lastSaleDate).toLocaleDateString() : null} />
        </div>
        {!cf.estimatedValue && !cf.availableEquity && !cf.totalLoanBalance && (
          <p className="text-[11px] text-muted-foreground/60 mt-1 italic">
            {cf.enriched ? "No financial data available from PropertyRadar" : "Financial data populates after enrichment — click Skip Trace below"}
          </p>
        )}
      </Section>

      {/* Property Details */}
      <Section title="Property Details" icon={Home}>
        <div className="grid grid-cols-2 gap-x-6">
          <InfoRow icon={MapPin} label="Full Address" value={cf.fullAddress} />
          <InfoRow icon={Copy} label="APN" value={cf.apn} mono />
          <InfoRow icon={MapPin} label="County" value={cf.county} />
          <InfoRow icon={Building} label="Property Type" value={cf.propertyType} />
          <InfoRow icon={Home} label="Beds / Baths" value={cf.bedrooms ? `${cf.bedrooms} bd / ${cf.bathrooms ?? "?"} ba` : null} />
          <InfoRow icon={Ruler} label="Sq Ft" value={cf.sqft ? cf.sqft.toLocaleString() : null} />
          <InfoRow icon={LandPlot} label="Lot Size" value={cf.lotSize ? `${cf.lotSize.toLocaleString()} sqft` : null} />
          <InfoRow icon={Calendar} label="Year Built" value={cf.yearBuilt} />
        </div>
      </Section>

      {/* Owner & Contact */}
      <Section title="Owner & Contact" icon={User}>
        <InfoRow icon={User} label="Owner" value={cf.ownerName} />
        {displayPhone && <InfoRow icon={Phone} label="Phone" value={displayPhone} highlight />}
        {displayEmail && <InfoRow icon={Mail} label="Email" value={displayEmail} highlight />}

        {allPhones.length > 1 && (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All Phone Numbers</p>
            {allPhones.map((ph: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Phone className="h-3 w-3 text-cyan/60" /><span className="font-mono">{ph}</span>
                {i === 0 && <Badge variant="outline" className="text-[8px] py-0">PRIMARY</Badge>}
              </div>
            ))}
          </div>
        )}

        {allEmails.length > 1 && (
          <div className="mt-2 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All Emails</p>
            {allEmails.map((em: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Mail className="h-3 w-3 text-cyan/60" /><span>{em}</span>
                {i === 0 && <Badge variant="outline" className="text-[8px] py-0">PRIMARY</Badge>}
              </div>
            ))}
          </div>
        )}

        {persons.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Associated Persons</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {persons.map((p: any, i: number) => (
              <div key={i} className="rounded-md border border-glass-border bg-secondary/10 p-2.5 text-xs space-y-0.5">
                <div className="flex items-center gap-2">
                  <User className="h-3 w-3 text-muted-foreground" />
                  <span className="font-semibold text-foreground">{p.name}</span>
                  <span className="text-muted-foreground">({p.relation})</span>
                  {p.age && <span className="text-muted-foreground">Age {p.age}</span>}
                </div>
                {p.phones?.length > 0 && <div className="pl-5 text-muted-foreground">Phones: {p.phones.join(", ")}</div>}
                {p.emails?.length > 0 && <div className="pl-5 text-muted-foreground">Emails: {p.emails.join(", ")}</div>}
              </div>
            ))}
          </div>
        )}

        {!displayPhone && !displayEmail && !skipTraced && (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/10 rounded-md px-3 mt-2">
            <Search className="h-3.5 w-3.5 text-amber-400" />
            No contact info yet &mdash; click <strong className="text-amber-400 mx-1">Skip Trace</strong> to pull all data
          </div>
        )}

        {!cf.enriched && (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/10 rounded-md px-3 mt-2">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            Not enriched &mdash; Skip Trace will auto-pull property data, scoring, and contact info
          </div>
        )}

        {skipTraceResult && (
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

        <Button size="sm" variant="outline" className={cn("mt-3 gap-2", skipTracing && "opacity-70 pointer-events-none")} onClick={onSkipTrace} disabled={skipTracing}>
          {skipTracing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {skipTracing ? "Pulling data..." : skipTraced ? "Re-Trace" : cf.enriched ? "Skip Trace" : "Enrich + Skip Trace"}
        </Button>
      </Section>

      {/* AI Scoring Factors */}
      {Array.isArray(cf.factors) && cf.factors.length > 0 && (
        <Section title="AI Scoring Breakdown" icon={Zap}>
          <div className="space-y-1">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(cf.factors as any[]).map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{f.name}</span>
                <span className="font-mono text-foreground">+{f.contribution}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Metadata */}
      <Section title="Metadata" icon={Eye}>
        <div className="grid grid-cols-2 gap-x-6">
          <InfoRow icon={Zap} label="Source" value={cf.source} />
          <InfoRow icon={Clock} label="Promoted" value={cf.promotedAt ? new Date(cf.promotedAt).toLocaleDateString() : null} />
          <InfoRow icon={Clock} label="Last Contact" value={cf.lastContactAt ? new Date(cf.lastContactAt).toLocaleDateString() : null} />
          <InfoRow icon={Calendar} label="Follow-Up" value={cf.followUpDate ? new Date(cf.followUpDate).toLocaleDateString() : null} />
          <InfoRow icon={Copy} label="Model Version" value={cf.modelVersion} />
          <InfoRow icon={ExternalLink} label="Radar ID" value={cf.radarId} mono />
        </div>
        {cf.notes && (
          <div className="mt-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
            <p className="text-xs text-foreground/80">{cf.notes}</p>
          </div>
        )}
      </Section>

      {cf.radarId && (
        <a href={`https://app.propertyradar.com/properties/${cf.radarId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-cyan/70 hover:text-cyan transition-colors">
          <ExternalLink className="h-3 w-3" />View on PropertyRadar
        </a>
      )}
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
            <a href={countyInfo.gis} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Map className="h-3.5 w-3.5 text-cyan" />GIS / Parcel Map — {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            <a href={countyInfo.assessor} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-xs w-full justify-start">
                <Building className="h-3.5 w-3.5 text-cyan" />Assessor&apos;s Office — {countyInfo.name}
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </a>
            {countyInfo.treasurer && (
              <a href={countyInfo.treasurer} target="_blank" rel="noopener noreferrer">
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

function CompsTab({ cf, selectedComps, onAddComp, onRemoveComp }: {
  cf: ClientFile;
  selectedComps: CompProperty[];
  onAddComp: (comp: CompProperty) => void;
  onRemoveComp: (apn: string) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prRaw = (cf.ownerFlags?.pr_raw ?? {}) as Record<string, any>;
  const lat = prRaw.Latitude ? parseFloat(String(prRaw.Latitude)) : null;
  const lng = prRaw.Longitude ? parseFloat(String(prRaw.Longitude)) : null;

  if (!lat || !lng) {
    return (
      <div className="text-center py-12">
        <Map className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-2">No location data available</p>
        <p className="text-xs text-muted-foreground/60">
          This property needs enrichment from PropertyRadar to get latitude/longitude.
          Go to the <strong>Overview</strong> tab and click <strong>&ldquo;Enrich + Skip Trace&rdquo;</strong>.
        </p>
      </div>
    );
  }

  const subject: SubjectProperty = {
    lat, lng, address: cf.fullAddress,
    beds: cf.bedrooms, baths: cf.bathrooms,
    sqft: cf.sqft, yearBuilt: cf.yearBuilt,
    propertyType: cf.propertyType, avm: cf.estimatedValue,
  };

  // ARV from selected comps
  const avms = selectedComps.map((c) => c.avm).filter((v): v is number => v != null);
  const lastSales = selectedComps.map((c) => c.lastSalePrice).filter((v): v is number => v != null);
  const avgAvm = avms.length > 0 ? Math.round(avms.reduce((a, b) => a + b, 0) / avms.length) : null;
  const avgLastSale = lastSales.length > 0 ? Math.round(lastSales.reduce((a, b) => a + b, 0) / lastSales.length) : null;
  const arv = avgAvm ?? avgLastSale ?? cf.estimatedValue ?? 0;

  // Profit projection
  const offer = Math.round(arv * 0.65);
  const rehab = 15000;
  const holdingCosts = Math.round(arv * 0.03);
  const sellingCosts = Math.round(arv * 0.08);
  const totalCost = offer + rehab + holdingCosts + sellingCosts;
  const profit = arv - totalCost;
  const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Interactive map */}
      <CompsMap
        subject={subject}
        selectedComps={selectedComps}
        onAddComp={onAddComp}
        onRemoveComp={onRemoveComp}
      />

      {/* Selected comps table */}
      {selectedComps.length > 0 && (
        <div className="rounded-lg border border-glass-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-glass/50 border-b border-glass-border">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-cyan" />
              Selected Comps ({selectedComps.length})
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-glass-border bg-secondary/10">
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
                {selectedComps.map((comp) => (
                  <tr key={comp.apn} className="border-b border-glass-border/50 hover:bg-secondary/10">
                    <td className="px-3 py-2 max-w-[180px] truncate">{comp.streetAddress}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Live ARV + Profit projection */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-cyan/15 bg-cyan/4 p-4">
          <p className="text-[10px] font-semibold text-cyan uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            Live ARV Estimate
          </p>
          {selectedComps.length > 0 ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg AVM ({selectedComps.length} comps)</span>
                <span className="font-bold text-neon text-lg">{avgAvm ? formatCurrency(avgAvm) : "—"}</span>
              </div>
              {avgLastSale && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Last Sale</span>
                  <span className="font-semibold">{formatCurrency(avgLastSale)}</span>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-cyan/15 flex justify-between">
                <span className="font-medium">Estimated ARV</span>
                <span className="font-bold text-neon text-xl" style={{ textShadow: "0 0 10px rgba(0,212,255,0.4)" }}>
                  {formatCurrency(arv)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Click markers on the map and &ldquo;Add as Comp&rdquo; to calculate ARV</p>
          )}
        </div>

        <div className="rounded-[12px] border border-glass-border bg-secondary/10 p-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            Profit Projection
          </p>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ARV</span>
              <span className="font-medium">{formatCurrency(arv)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Offer (65% ARV)</span>
              <span className="font-medium text-red-400">-{formatCurrency(offer)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rehab est.</span>
              <span className="font-medium text-red-400">-{formatCurrency(rehab)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Holding (3%)</span>
              <span className="font-medium text-red-400">-{formatCurrency(holdingCosts)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selling (8%)</span>
              <span className="font-medium text-red-400">-{formatCurrency(sellingCosts)}</span>
            </div>
            <div className="pt-2 mt-2 border-t border-glass-border flex justify-between">
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

function OfferCalcTab({ cf }: { cf: ClientFile }) {
  const [arv, setArv] = useState(cf.estimatedValue?.toString() ?? "");
  const [purchase, setPurchase] = useState("");
  const [rehab, setRehab] = useState("");
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

  const mao = arvNum > 0 ? Math.round(arvNum * 0.70 - rehabNum) : 0;
  const totalCosts = purchaseNum + rehabNum + holdNum + closingNum;
  const grossProfit = arvNum - totalCosts;
  const netProfit = grossProfit - feeNum;
  const roi = totalCosts > 0 ? ((grossProfit / totalCosts) * 100).toFixed(1) : "0";

  function CalcField({ label, value, onChange, prefix }: { label: string; value: string; onChange: (v: string) => void; prefix?: string }) {
    return (
      <div className="space-y-1">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</label>
        <div className="relative">
          {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
          <Input className={cn("font-mono text-sm", prefix && "pl-7")} value={value} onChange={(e) => onChange(e.target.value)} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Deal Inputs" icon={Calculator}>
        <div className="grid grid-cols-2 gap-3">
          <CalcField label="ARV (After Repair Value)" value={arv} onChange={setArv} prefix="$" />
          <CalcField label="Purchase Price" value={purchase} onChange={setPurchase} prefix="$" />
          <CalcField label="Rehab Estimate" value={rehab} onChange={setRehab} prefix="$" />
          <CalcField label="Closing Costs" value={closing} onChange={setClosing} prefix="$" />
          <CalcField label="Holding Period (months)" value={holdMonths} onChange={setHoldMonths} />
          <CalcField label="Monthly Holding Cost" value={monthlyHold} onChange={setMonthlyHold} prefix="$" />
          <CalcField label="Assignment Fee Target" value={assignmentFee} onChange={setAssignmentFee} prefix="$" />
        </div>
      </Section>

      <Section title="Profit Projection" icon={TrendingUp}>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-cyan/20 bg-cyan/4 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">MAO (70% Rule)</p>
            <p className="text-xl font-bold text-neon" style={{ textShadow: "0 0 10px rgba(0,212,255,0.3)" }}>
              {mao > 0 ? formatCurrency(mao) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ARV × 0.70 − Rehab</p>
          </div>
          <div className="rounded-lg border border-glass-border bg-secondary/10 p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Costs</p>
            <p className="text-xl font-bold">{totalCosts > 0 ? formatCurrency(totalCosts) : "—"}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Purchase + Rehab + Hold + Close</p>
          </div>
          <div className={cn("rounded-lg border p-3 text-center", grossProfit > 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
            <p className="text-[10px] text-muted-foreground uppercase">Gross Profit</p>
            <p className={cn("text-xl font-bold", grossProfit > 0 ? "text-emerald-400" : "text-red-400")}>
              {arvNum > 0 && purchaseNum > 0 ? formatCurrency(grossProfit) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ROI: {roi}%</p>
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

function DocumentsTab({ cf }: { cf: ClientFile }) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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
    `PURCHASE PRICE: $____________`,
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
  ].join("\n"), [cf, today]);

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
        <pre className="text-[11px] leading-relaxed text-foreground/80 bg-secondary/20 rounded-lg p-4 border border-glass-border overflow-auto max-h-64 whitespace-pre-wrap font-mono">
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
  const [selectedComps, setSelectedComps] = useState<CompProperty[]>([]);

  const handleAddComp = useCallback((comp: CompProperty) => {
    setSelectedComps((prev) => prev.some((c) => c.apn === comp.apn) ? prev : [...prev, comp]);
  }, []);

  const handleRemoveComp = useCallback((apn: string) => {
    setSelectedComps((prev) => prev.filter((c) => c.apn !== apn));
  }, []);

  const handleSkipTrace = useCallback(async () => {
    if (!clientFile) return;
    setSkipTracing(true);
    setSkipTraceResult(null);
    setSkipTraceMs(null);
    const t0 = performance.now();

    try {
      const res = await fetch("/api/prospects/skip-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: clientFile.propertyId, lead_id: clientFile.id }),
      });
      const tApi = performance.now();
      const data = await res.json();

      if (data.success) {
        setOverlay({
          phones: data.phones ?? [], emails: data.emails ?? [],
          persons: data.persons ?? [], primaryPhone: data.primary_phone ?? null,
          primaryEmail: data.primary_email ?? null,
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
        setSkipTraceResult(data.error ?? "Skip trace failed");
        setSkipTraceMs(Math.round(performance.now() - t0));
      }
    } catch (err) {
      setSkipTraceResult(err instanceof Error ? err.message : "Network error");
      setSkipTraceMs(Math.round(performance.now() - t0));
    } finally {
      setSkipTracing(false);
    }
  }, [clientFile, onRefresh]);

  if (!clientFile) return null;

  const lbl = SCORE_LABEL_CFG[clientFile.scoreLabel];
  const displayPhone = overlay?.primaryPhone ?? clientFile.ownerPhone;

  return (
    <AnimatePresence>
      {open && (
        <Fragment>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn("fixed inset-x-4 top-[2%] bottom-[2%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 flex flex-col transition-all duration-300", activeTab === "comps" ? "md:w-[1060px]" : "md:w-[860px]")}
          >
            <div className="flex-1 overflow-hidden rounded-xl border border-glass-border bg-glass backdrop-blur-xl shadow-2xl holo-border flex flex-col">
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-glass-border bg-glass/90 backdrop-blur-xl rounded-t-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold", lbl.bg, lbl.color)}>
                    <Zap className="h-3 w-3" />{clientFile.compositeScore} {lbl.text}
                  </div>
                  {clientFile.prediction && (
                    <PredictiveDistressBadge data={clientFile.prediction as PredictiveDistressData} size="sm" />
                  )}
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold truncate" style={{ textShadow: "0 0 12px rgba(0,212,255,0.12)" }}>{clientFile.ownerName}</h2>
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
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/40 transition-colors text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-glass-border bg-glass/50 overflow-x-auto scrollbar-none">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap",
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
                    key={activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    {activeTab === "overview" && (
                      <OverviewTab cf={clientFile} skipTracing={skipTracing} skipTraceResult={skipTraceResult} skipTraceMs={skipTraceMs} overlay={overlay} onSkipTrace={handleSkipTrace} />
                    )}
                    {activeTab === "propertyradar" && <PropertyRadarTab cf={clientFile} />}
                    {activeTab === "county" && <CountyRecordsTab cf={clientFile} />}
                    {activeTab === "comps" && <CompsTab cf={clientFile} selectedComps={selectedComps} onAddComp={handleAddComp} onRemoveComp={handleRemoveComp} />}
                    {activeTab === "calculator" && <OfferCalcTab cf={clientFile} />}
                    {activeTab === "documents" && <DocumentsTab cf={clientFile} />}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-t border-glass-border bg-glass/90 backdrop-blur-xl rounded-b-xl">
                {onClaim && (
                  <Button size="sm" className="gap-2" onClick={() => onClaim(clientFile.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" />Claim Lead
                  </Button>
                )}
                {displayPhone && (
                  <Button size="sm" variant="outline" className="gap-2">
                    <Phone className="h-3.5 w-3.5" />Call {displayPhone.slice(-4)}
                  </Button>
                )}
                {clientFile.ownerEmail && (
                  <Button size="sm" variant="outline" className="gap-2" asChild>
                    <a href={`mailto:${clientFile.ownerEmail}`}><Mail className="h-3.5 w-3.5" />Email</a>
                  </Button>
                )}
                <div className="ml-auto text-[10px] text-muted-foreground">
                  ID: {clientFile.id.slice(0, 8)} • {clientFile.source}
                </div>
              </div>
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  );
}
