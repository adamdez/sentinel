"use client";

import { motion } from "framer-motion";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  Calendar,
  DollarSign,
  ShieldCheck,
  ShieldAlert,
  User,
  FileText,
  Sparkles,
  ExternalLink,
  Copy,
  Tag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import type { LeadRow } from "@/lib/leads-data";
import type { DistressType } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

interface LeadDetailModalProps {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  prospect: { label: "Prospect", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  lead: { label: "Lead", color: "bg-green-500/15 text-green-400 border-green-500/30" },
  negotiation: { label: "Negotiation", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  disposition: { label: "Disposition", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  nurture: { label: "Nurture", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  dead: { label: "Dead", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  closed: { label: "Closed", color: "bg-neon/15 text-neon border-neon/30" },
};

const DISTRESS_LABELS: Record<DistressType, string> = {
  probate: "Probate",
  pre_foreclosure: "Pre-Foreclosure",
  tax_lien: "Tax Lien",
  code_violation: "Code Violation",
  vacant: "Vacant",
  divorce: "Divorce",
  bankruptcy: "Bankruptcy",
  fsbo: "FSBO",
  absentee: "Absentee",
  inherited: "Inherited",
};

function InfoRow({ icon: Icon, label, value, className }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}

function ScoreRow({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className={cn(
            "h-full rounded-full",
            pct >= 80 ? "bg-neon" : pct >= 60 ? "bg-yellow-400" : pct >= 40 ? "bg-blue-400" : "bg-muted-foreground"
          )}
        />
      </div>
    </div>
  );
}

function formatRelative(date: string | null): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 0) return `In ${Math.abs(days)}d`;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function formatFollowUpFull(date: string | null): { text: string; overdue: boolean } {
  if (!date) return { text: "Not set", overdue: false };
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.round(diff / 86400000);

  const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (days < 0) return { text: `${formatted} (${Math.abs(days)}d overdue)`, overdue: true };
  if (days === 0) return { text: `${formatted} (Today)`, overdue: false };
  if (days === 1) return { text: `${formatted} (Tomorrow)`, overdue: false };
  return { text: `${formatted} (in ${days}d)`, overdue: false };
}

export function LeadDetailModal({ lead, open, onOpenChange, isOwner }: LeadDetailModalProps) {
  if (!lead) return null;

  const statusConfig = STATUS_LABELS[lead.status] ?? STATUS_LABELS.lead;
  const followUp = formatFollowUpFull(lead.followUpDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg flex items-center gap-2">
                {lead.ownerName}
                <Badge className={cn("text-[10px]", statusConfig.color)}>
                  {statusConfig.label}
                </Badge>
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1.5 mt-1">
                <MapPin className="h-3 w-3" />
                {lead.address}, {lead.city}, {lead.state} {lead.zip}
              </DialogDescription>
            </div>
            <AIScoreBadge score={lead.score} size="lg" />
          </div>
        </DialogHeader>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            disabled={!lead.complianceClean}
          >
            <Phone className="h-3 w-3" />
            Call {lead.ownerPhone ? lead.ownerPhone.slice(-4) : "—"}
          </Button>
          {lead.ownerEmail && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Mail className="h-3 w-3" />
              Email
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Copy className="h-3 w-3" />
            Copy APN
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ExternalLink className="h-3 w-3" />
            County Records
          </Button>

          {!lead.complianceClean && (
            <Badge variant="destructive" className="text-[10px] gap-1 ml-auto">
              <ShieldAlert className="h-3 w-3" />
              Compliance Block
            </Badge>
          )}
          {lead.complianceClean && (
            <Badge variant="neon" className="text-[10px] gap-1 ml-auto">
              <ShieldCheck className="h-3 w-3" />
              Clear
            </Badge>
          )}
        </div>

        <Separator className="bg-glass-border" />

        {/* Two-column info grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <InfoRow icon={FileText} label="APN" value={<span className="font-mono">{lead.apn}</span>} />
          <InfoRow icon={MapPin} label="County" value={lead.county} />
          <InfoRow icon={User} label="Assigned To" value={lead.assignedName ?? "Unassigned"} />
          <InfoRow icon={Tag} label="Source" value={lead.source.replace(/_/g, " ")} />
          <InfoRow
            icon={DollarSign}
            label="Estimated Value"
            value={lead.estimatedValue ? formatCurrency(lead.estimatedValue) : "—"}
          />
          <InfoRow
            icon={DollarSign}
            label="Equity"
            value={lead.equityPercent != null ? `${lead.equityPercent}%` : "—"}
          />
          <InfoRow
            icon={Clock}
            label="Last Contact"
            value={formatRelative(lead.lastContactAt)}
          />
          <InfoRow
            icon={Calendar}
            label="Follow-Up"
            value={
              <span className={cn(followUp.overdue && "text-red-400 font-semibold")}>
                {followUp.text}
              </span>
            }
          />
        </div>

        <Separator className="bg-glass-border" />

        {/* Distress Signals */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Distress Signals ({lead.distressSignals.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lead.distressSignals.map((d) => (
              <Badge key={d} variant="outline" className="text-[11px]">
                {DISTRESS_LABELS[d]}
              </Badge>
            ))}
            {lead.distressSignals.length >= 3 && (
              <Badge variant="fire" className="text-[10px] gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Stacked ×{lead.distressSignals.length}
              </Badge>
            )}
          </div>
        </div>

        {/* AI Score Breakdown */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Sparkles className="inline h-3 w-3 mr-1 text-neon" />
            AI Score Breakdown
          </p>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-glass-border bg-glass/50 p-3">
            <ScoreRow label="Composite" value={lead.score.composite} />
            <ScoreRow label="Motivation" value={lead.score.motivation} />
            <ScoreRow label="Equity Velocity" value={lead.score.equityVelocity} />
            <ScoreRow label="Urgency" value={lead.score.urgency} />
            <ScoreRow label="Historical Conv." value={lead.score.historicalConversion} />
            <ScoreRow label="Predictive Priority" value={lead.predictivePriority} />
          </div>
          {lead.score.aiBoost > 0 && (
            <p className="text-[11px] text-neon mt-2 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              AI Boost: +{lead.score.aiBoost} from predictive pattern matching
            </p>
          )}
        </div>

        {/* Tags */}
        {lead.tags.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {lead.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {lead.notes && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
            <p className="text-sm text-foreground/80 bg-glass/50 rounded-lg border border-glass-border p-3">
              {lead.notes}
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <Separator className="bg-glass-border" />
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground">
            Promoted {formatRelative(lead.promotedAt)} • ID: {lead.id}
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button variant="outline" size="sm" className="text-xs">
                Log Disposition
              </Button>
            )}
            {!lead.assignedTo && (
              <Button variant="neon" size="sm" className="text-xs">
                Claim Lead
              </Button>
            )}
            {/* TODO: Concurrency-safe claim (optimistic locking with lock_version) */}
            {/* TODO: Status transition guardrails */}
            {/* TODO: Activity timeline */}
            {/* TODO: Disposition logging */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
