"use client";

import { Fragment, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, User, Phone, Mail, DollarSign, Home, TrendingUp,
  Calendar, Tag, Shield, Zap, ExternalLink, Clock, AlertTriangle,
  Copy, CheckCircle2, Search, Loader2, Building, Ruler, LandPlot,
  Banknote, Scale, UserX, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import type { ProspectRow } from "@/hooks/use-prospects";
import type { AIScore } from "@/lib/types";

interface ProspectDetailModalProps {
  prospect: ProspectRow | null;
  open: boolean;
  onClose: () => void;
  onClaim: (id: string) => void;
  onRefresh?: () => void;
}

const DISTRESS_LABELS: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  probate: { label: "Probate", icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  pre_foreclosure: { label: "Pre-Foreclosure", icon: AlertTriangle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  tax_lien: { label: "Tax Lien", icon: Banknote, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  code_violation: { label: "Code Violation", icon: Shield, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  vacant: { label: "Vacant", icon: Home, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  divorce: { label: "Divorce", icon: Scale, color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  bankruptcy: { label: "Bankruptcy", icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  fsbo: { label: "FSBO", icon: Building, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  absentee: { label: "Absentee", icon: UserX, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  inherited: { label: "Inherited", icon: User, color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
};

const scoreLabelConfig: Record<AIScore["label"], { text: string; color: string; bg: string }> = {
  fire: { text: "FIRE", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  hot: { text: "HOT", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  warm: { text: "WARM", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  cold: { text: "COLD", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
};

function InfoRow({ icon: Icon, label, value, mono, highlight }: {
  icon: typeof MapPin; label: string; value: string | number | null | undefined; mono?: boolean; highlight?: boolean;
}) {
  if (value == null || value === "" || value === undefined) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", highlight ? "text-neon" : "text-muted-foreground")} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn(
          "text-sm truncate",
          mono && "font-mono",
          highlight ? "text-neon font-semibold" : "text-foreground"
        )}>{value}</p>
      </div>
    </div>
  );
}

function OwnerFlag({ active, label, icon: Icon }: { active: boolean; label: string; icon: typeof Home }) {
  if (!active) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium">
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}

export function ProspectDetailModal({ prospect, open, onClose, onClaim, onRefresh }: ProspectDetailModalProps) {
  const [skipTracing, setSkipTracing] = useState(false);
  const [skipTraceResult, setSkipTraceResult] = useState<string | null>(null);

  const handleSkipTrace = useCallback(async () => {
    if (!prospect) return;
    setSkipTracing(true);
    setSkipTraceResult(null);

    try {
      const res = await fetch("/api/prospects/skip-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: prospect.property_id,
          lead_id: prospect.id,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const parts = [];
        if (data.phones?.length) parts.push(`${data.phones.length} phone(s)`);
        if (data.emails?.length) parts.push(`${data.emails.length} email(s)`);
        if (data.persons?.length) parts.push(`${data.persons.length} person(s)`);
        const msg = parts.length > 0
          ? `Found ${parts.join(", ")} — refreshing...`
          : "Complete — no contact info found in PropertyRadar";
        setSkipTraceResult(msg);
        onRefresh?.();
      } else {
        setSkipTraceResult(data.error ?? "Skip trace failed");
      }
    } catch (err) {
      setSkipTraceResult(err instanceof Error ? err.message : "Network error");
    } finally {
      setSkipTracing(false);
    }
  }, [prospect, onRefresh]);

  if (!prospect) return null;

  const lbl = scoreLabelConfig[prospect.score_label];
  const fullAddress = [prospect.address, prospect.city, prospect.state, prospect.zip].filter(Boolean).join(", ");

  // Persons data from owner_flags (after skip trace)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persons = (prospect.owner_flags?.persons as any[]) ?? [];
  const allPhones = (prospect.owner_flags?.all_phones as string[]) ?? [];
  const allEmails = (prospect.owner_flags?.all_emails as string[]) ?? [];
  const skipTraced = !!prospect.owner_flags?.skip_traced;

  return (
    <AnimatePresence>
      {open && (
        <Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-[3%] bottom-[3%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[720px] z-50 flex flex-col"
          >
            <div className="flex-1 overflow-y-auto rounded-xl border border-glass-border bg-glass backdrop-blur-xl shadow-2xl holo-border">
              {/* ── Header ─────────────────────────────────────────────── */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-glass-border bg-glass/90 backdrop-blur-xl rounded-t-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold", lbl.bg, lbl.color)}>
                    <Zap className="h-3 w-3" />
                    {prospect.composite_score} {lbl.text}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold truncate" style={{ textShadow: "0 0 12px rgba(0,255,136,0.12)" }}>
                      {prospect.owner_name}
                    </h2>
                    <p className="text-xs text-muted-foreground truncate">{fullAddress}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {prospect.enriched && (
                    <Badge variant="outline" className="text-[9px] gap-1 text-neon border-neon/30">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Enriched
                    </Badge>
                  )}
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary/40 transition-colors text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* ── 1. Score Dashboard ────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-3">
                  <ScoreCard label="Composite" value={prospect.composite_score} />
                  <ScoreCard label="Motivation" value={prospect.motivation_score} />
                  <ScoreCard label="Deal Score" value={prospect.deal_score} />
                </div>

                {/* ── 2. Distress Signals ───────────────────────────────── */}
                {prospect.tags.length > 0 && (
                  <Section title="Distress Signals" icon={AlertTriangle}>
                    <div className="flex flex-wrap gap-1.5">
                      {prospect.tags.map((tag) => {
                        const cfg = DISTRESS_LABELS[tag];
                        const TagIcon = cfg?.icon ?? Tag;
                        return (
                          <div key={tag} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium", cfg?.color ?? "text-muted-foreground bg-secondary/20 border-glass-border")}>
                            <TagIcon className="h-3 w-3" />
                            {cfg?.label ?? tag}
                          </div>
                        );
                      })}
                    </div>
                    {prospect.foreclosure_stage && (
                      <div className="mt-2 text-xs text-orange-400">
                        Foreclosure Stage: <span className="font-semibold">{prospect.foreclosure_stage}</span>
                        {prospect.default_amount && <> &mdash; Default: {formatCurrency(prospect.default_amount)}</>}
                      </div>
                    )}
                    {prospect.delinquent_amount && prospect.delinquent_amount > 0 && (
                      <div className="text-xs text-amber-400">
                        Tax Delinquent: <span className="font-semibold">{formatCurrency(prospect.delinquent_amount)}</span>
                      </div>
                    )}
                  </Section>
                )}

                {/* ── 3. Ownership Flags ────────────────────────────────── */}
                {(prospect.is_vacant || prospect.is_absentee || prospect.is_free_clear || prospect.is_high_equity || prospect.is_cash_buyer) && (
                  <div className="flex flex-wrap gap-2">
                    <OwnerFlag active={prospect.is_absentee} label="Absentee Owner" icon={UserX} />
                    <OwnerFlag active={prospect.is_vacant} label="Vacant Property" icon={Home} />
                    <OwnerFlag active={prospect.is_free_clear} label="Free & Clear" icon={CheckCircle2} />
                    <OwnerFlag active={prospect.is_high_equity} label="High Equity" icon={TrendingUp} />
                    <OwnerFlag active={prospect.is_cash_buyer} label="Cash Buyer" icon={DollarSign} />
                  </div>
                )}

                {/* ── 4. Financial Overview ─────────────────────────────── */}
                <Section title="Financial Overview" icon={DollarSign}>
                  <div className="grid grid-cols-2 gap-x-6">
                    <InfoRow icon={DollarSign} label="ARV / AVM" value={prospect.estimated_value ? formatCurrency(prospect.estimated_value) : null} highlight />
                    <InfoRow icon={TrendingUp} label="Equity %" value={prospect.equity_percent != null ? `${prospect.equity_percent}%` : null} highlight={prospect.equity_percent != null && prospect.equity_percent > 40} />
                    <InfoRow icon={Banknote} label="Available Equity" value={prospect.available_equity ? formatCurrency(prospect.available_equity) : null} />
                    <InfoRow icon={Banknote} label="Total Loans" value={prospect.total_loan_balance ? formatCurrency(prospect.total_loan_balance) : null} />
                    <InfoRow icon={DollarSign} label="Last Sale Price" value={prospect.last_sale_price ? formatCurrency(prospect.last_sale_price) : null} />
                    <InfoRow icon={Calendar} label="Last Sale Date" value={prospect.last_sale_date ? new Date(prospect.last_sale_date).toLocaleDateString() : null} />
                  </div>
                  {!prospect.estimated_value && !prospect.available_equity && !prospect.total_loan_balance && (
                    <p className="text-[11px] text-muted-foreground/60 mt-1 italic">
                      {prospect.enriched
                        ? "No financial data available from PropertyRadar"
                        : "Financial data populates after enrichment — click Skip Trace below"}
                    </p>
                  )}
                </Section>

                {/* ── 5. Property Details ───────────────────────────────── */}
                <Section title="Property Details" icon={Home}>
                  <div className="grid grid-cols-2 gap-x-6">
                    <InfoRow icon={MapPin} label="Full Address" value={fullAddress} />
                    <InfoRow icon={Copy} label="APN" value={prospect.apn} mono />
                    <InfoRow icon={MapPin} label="County" value={prospect.county} />
                    <InfoRow icon={Building} label="Property Type" value={prospect.property_type} />
                    <InfoRow icon={Home} label="Beds / Baths" value={prospect.bedrooms ? `${prospect.bedrooms} bd / ${prospect.bathrooms ?? "?"} ba` : null} />
                    <InfoRow icon={Ruler} label="Sq Ft" value={prospect.sqft ? prospect.sqft.toLocaleString() : null} />
                    <InfoRow icon={LandPlot} label="Lot Size" value={prospect.lot_size ? `${prospect.lot_size.toLocaleString()} sqft` : null} />
                    <InfoRow icon={Calendar} label="Year Built" value={prospect.year_built} />
                  </div>
                </Section>

                {/* ── 6. Owner & Contact ────────────────────────────────── */}
                <Section title="Owner & Contact" icon={User}>
                  <InfoRow icon={User} label="Owner" value={prospect.owner_name} />

                  {/* Primary contact */}
                  {prospect.owner_phone && (
                    <InfoRow icon={Phone} label="Phone" value={prospect.owner_phone} highlight />
                  )}
                  {prospect.owner_email && (
                    <InfoRow icon={Mail} label="Email" value={prospect.owner_email} highlight />
                  )}

                  {/* All phones from skip trace */}
                  {allPhones.length > 1 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All Phone Numbers</p>
                      {allPhones.map((ph, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Phone className="h-3 w-3 text-neon/60" />
                          <span className="font-mono">{ph}</span>
                          {i === 0 && <Badge variant="outline" className="text-[8px] py-0">PRIMARY</Badge>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* All emails from skip trace */}
                  {allEmails.length > 1 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All Emails</p>
                      {allEmails.map((em, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Mail className="h-3 w-3 text-neon/60" />
                          <span>{em}</span>
                          {i === 0 && <Badge variant="outline" className="text-[8px] py-0">PRIMARY</Badge>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Persons from skip trace */}
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
                          {p.phones?.length > 0 && (
                            <div className="pl-5 text-muted-foreground">
                              Phones: {p.phones.join(", ")}
                            </div>
                          )}
                          {p.emails?.length > 0 && (
                            <div className="pl-5 text-muted-foreground">
                              Emails: {p.emails.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No contact info message */}
                  {!prospect.owner_phone && !prospect.owner_email && !skipTraced && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground bg-amber-500/5 border border-amber-500/10 rounded-md px-3 mt-2">
                      <Search className="h-3.5 w-3.5 text-amber-400" />
                      No contact info yet &mdash; click <strong className="text-amber-400 mx-1">Skip Trace</strong> to pull all data from PropertyRadar
                    </div>
                  )}

                  {/* Not enriched hint */}
                  {!prospect.enriched && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/10 rounded-md px-3 mt-2">
                      <Zap className="h-3.5 w-3.5 text-blue-400" />
                      Property not yet enriched &mdash; Skip Trace will auto-pull property data, scoring, and contact info
                    </div>
                  )}

                  {/* Skip trace result feedback */}
                  {skipTraceResult && (
                    <div className={cn(
                      "mt-2 text-xs px-3 py-2 rounded-md border",
                      skipTraceResult.startsWith("Found") ? "text-neon bg-neon/5 border-neon/20" : "text-red-400 bg-red-500/5 border-red-500/20"
                    )}>
                      {skipTraceResult}
                    </div>
                  )}
                </Section>

                {/* ── 7. AI Scoring Factors ─────────────────────────────── */}
                {Array.isArray(prospect.factors) && prospect.factors.length > 0 && (
                  <Section title="AI Scoring Breakdown" icon={Zap}>
                    <div className="space-y-1">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(prospect.factors as any[]).map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{f.name}</span>
                          <span className="font-mono text-foreground">+{f.contribution}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* ── 8. Metadata ──────────────────────────────────────── */}
                <Section title="Metadata" icon={Eye}>
                  <div className="grid grid-cols-2 gap-x-6">
                    <InfoRow icon={Zap} label="Source" value={prospect.source} />
                    <InfoRow icon={Clock} label="Promoted" value={prospect.promoted_at ? new Date(prospect.promoted_at).toLocaleDateString() : null} />
                    <InfoRow icon={Copy} label="Model Version" value={prospect.model_version} />
                    <InfoRow icon={ExternalLink} label="Radar ID" value={prospect.radar_id} mono />
                  </div>
                  {prospect.notes && (
                    <div className="mt-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Notes</p>
                      <p className="text-xs text-foreground/80">{prospect.notes}</p>
                    </div>
                  )}
                </Section>

                {/* PropertyRadar link */}
                {prospect.radar_id && (
                  <a
                    href={`https://app.propertyradar.com/properties/${prospect.radar_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-neon/70 hover:text-neon transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View on PropertyRadar
                  </a>
                )}
              </div>

              {/* ── Footer Actions ──────────────────────────────────────── */}
              <div className="sticky bottom-0 flex items-center gap-3 px-6 py-4 border-t border-glass-border bg-glass/90 backdrop-blur-xl rounded-b-xl">
                <Button size="sm" className="flex-1 gap-2" onClick={() => onClaim(prospect.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Claim Prospect
                </Button>
                {prospect.owner_phone && (
                  <Button size="sm" variant="outline" className="gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("gap-2", skipTracing && "opacity-70 pointer-events-none")}
                  onClick={handleSkipTrace}
                  disabled={skipTracing}
                >
                  {skipTracing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  {skipTracing ? "Pulling data..." : skipTraced ? "Re-Trace" : prospect.enriched ? "Skip Trace" : "Enrich + Skip Trace"}
                </Button>
              </div>
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  );
}

// ── Section wrapper ─────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Home; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-glass-border bg-secondary/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ── Score card ──────────────────────────────────────────────────────────

function ScoreCard({ label, value }: { label: string; value: number }) {
  const pct = Math.min(value, 100);
  return (
    <div className="rounded-lg border border-glass-border bg-secondary/10 p-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold" style={{ textShadow: pct >= 80 ? "0 0 10px rgba(0,255,136,0.3)" : undefined }}>
        {value}
      </p>
      <div className="h-1 rounded-full bg-secondary mt-2 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 85 ? "bg-orange-400" : pct >= 65 ? "bg-red-400" : pct >= 40 ? "bg-yellow-400" : "bg-blue-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
