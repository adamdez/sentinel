"use client";

import { Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, MapPin, User, Phone, Mail, DollarSign, Home,
  Calendar, Tag, Shield, Zap, ExternalLink, Clock,
  Copy, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProspectRow } from "@/hooks/use-prospects";
import type { AIScore } from "@/lib/types";

interface ProspectDetailModalProps {
  prospect: ProspectRow | null;
  open: boolean;
  onClose: () => void;
  onClaim: (id: string) => void;
}

const DISTRESS_LABELS: Record<string, string> = {
  probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee", inherited: "Inherited",
};

const labelConfig: Record<AIScore["label"], { text: string; color: string; bg: string }> = {
  fire: { text: "FIRE", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  hot: { text: "HOT", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  warm: { text: "WARM", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  cold: { text: "COLD", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
};

function InfoRow({ icon: Icon, label, value, mono }: {
  icon: typeof MapPin; label: string; value: string | number | null; mono?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={cn("text-sm text-foreground truncate", mono && "font-mono")}>{value}</p>
      </div>
    </div>
  );
}

export function ProspectDetailModal({ prospect, open, onClose, onClaim }: ProspectDetailModalProps) {
  if (!prospect) return null;

  const lbl = labelConfig[prospect.score_label];
  const fullAddress = [prospect.address, prospect.city, prospect.state, prospect.zip].filter(Boolean).join(", ");

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
            className="fixed inset-x-4 top-[5%] bottom-[5%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[640px] z-50 flex flex-col"
          >
            <div className="flex-1 overflow-y-auto rounded-xl border border-glass-border bg-glass backdrop-blur-xl shadow-2xl holo-border">
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-glass-border bg-glass/90 backdrop-blur-xl rounded-t-xl">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-bold", lbl.bg, lbl.color)}>
                    <Zap className="h-3 w-3" />
                    {prospect.composite_score} {lbl.text}
                  </div>
                  <h2
                    className="text-lg font-bold truncate"
                    style={{ textShadow: "0 0 12px rgba(0,255,136,0.12)" }}
                  >
                    {prospect.owner_name}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-secondary/40 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Score breakdown */}
                <div className="grid grid-cols-3 gap-3">
                  <ScoreCard label="Composite" value={prospect.composite_score} />
                  <ScoreCard label="Motivation" value={prospect.motivation_score} />
                  <ScoreCard label="Deal" value={prospect.deal_score} />
                </div>

                {/* Distress tags */}
                {prospect.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {prospect.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px] gap-1">
                        <Tag className="h-2.5 w-2.5" />
                        {DISTRESS_LABELS[tag] ?? tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Property info */}
                <div className="rounded-lg border border-glass-border bg-secondary/10 p-4 space-y-0.5">
                  <InfoRow icon={MapPin} label="Address" value={fullAddress} />
                  <InfoRow icon={Home} label="APN" value={prospect.apn} mono />
                  <InfoRow icon={MapPin} label="County" value={prospect.county} />
                  <InfoRow icon={Home} label="Type" value={prospect.property_type} />
                  <InfoRow icon={DollarSign} label="Estimated Value" value={prospect.estimated_value ? `$${prospect.estimated_value.toLocaleString()}` : null} />
                  <InfoRow icon={DollarSign} label="Equity" value={prospect.equity_percent != null ? `${prospect.equity_percent}%` : null} />
                  {prospect.sqft && <InfoRow icon={Home} label="Sq Ft" value={prospect.sqft.toLocaleString()} />}
                  {prospect.bedrooms && <InfoRow icon={Home} label="Beds / Baths" value={`${prospect.bedrooms} bd / ${prospect.bathrooms ?? "?"} ba`} />}
                  {prospect.year_built && <InfoRow icon={Calendar} label="Year Built" value={prospect.year_built} />}
                </div>

                {/* Owner contact */}
                <div className="rounded-lg border border-glass-border bg-secondary/10 p-4 space-y-0.5">
                  <InfoRow icon={User} label="Owner" value={prospect.owner_name} />
                  <InfoRow icon={Phone} label="Phone" value={prospect.owner_phone} />
                  <InfoRow icon={Mail} label="Email" value={prospect.owner_email} />
                  {!prospect.owner_phone && !prospect.owner_email && (
                    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      No contact info — skip trace recommended
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="rounded-lg border border-glass-border bg-secondary/10 p-4 space-y-0.5">
                  <InfoRow icon={Zap} label="Source" value={prospect.source} />
                  <InfoRow icon={Clock} label="Promoted" value={prospect.promoted_at ? new Date(prospect.promoted_at).toLocaleDateString() : null} />
                  <InfoRow icon={Copy} label="Model Version" value={prospect.model_version} />
                  {prospect.notes && <InfoRow icon={CheckCircle2} label="Notes" value={prospect.notes} />}
                </div>

                {/* AI Factors */}
                {Array.isArray(prospect.factors) && prospect.factors.length > 0 && (
                  <div className="rounded-lg border border-glass-border bg-secondary/10 p-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">AI Scoring Factors</p>
                    <div className="space-y-1">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(prospect.factors as any[]).map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{f.name}</span>
                          <span className="font-mono text-foreground">+{f.contribution}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PropertyRadar link */}
                {typeof prospect.owner_flags?.radar_id === "string" && (
                  <a
                    href={`https://app.propertyradar.com/properties/${prospect.owner_flags.radar_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-neon/70 hover:text-neon transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View on PropertyRadar
                  </a>
                )}
              </div>

              {/* Footer actions */}
              <div className="sticky bottom-0 flex items-center gap-3 px-6 py-4 border-t border-glass-border bg-glass/90 backdrop-blur-xl rounded-b-xl">
                <Button
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => onClaim(prospect.id)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Claim Lead
                </Button>
                {prospect.owner_phone && (
                  <Button size="sm" variant="outline" className="gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    Call
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-2">
                  <Shield className="h-3.5 w-3.5" />
                  Skip Trace
                </Button>
                {/* TODO: Wire skip trace to actual API */}
                {/* TODO: Wire Claim to PATCH /api/leads/:id { status: "lead", assigned_to: currentUser.id } */}
                {/* TODO: Wire Call to dialer integration */}
              </div>
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  );
}

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
