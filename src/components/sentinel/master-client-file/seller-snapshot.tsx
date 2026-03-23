"use client";

import { User, Phone, Clock, DollarSign, Calendar } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { ClientFile } from "../master-client-file-helpers";
import { formatRelativeFromNow } from "../master-client-file-helpers";

const TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "30_days": "Within 30 days",
  "60_days": "Within 60 days",
  "90_days": "Within 90 days",
  "6_months": "Within 6 months",
  flexible: "Flexible / no rush",
};

const MOTIVATION_LABELS = ["", "Very Low", "Low", "Moderate", "High", "Very High"];

interface SellerSnapshotProps {
  cf: ClientFile;
  phoneConfidence: number | null;
}

export function SellerSnapshot({ cf, phoneConfidence }: SellerSnapshotProps) {
  const items: { label: string; value: string | null; icon: typeof User; tone?: "dim" | "normal" | "highlight" }[] = [
    {
      label: "Motivation",
      value: cf.motivationLevel
        ? `${MOTIVATION_LABELS[cf.motivationLevel] ?? cf.motivationLevel} (${cf.motivationLevel}/5)`
        : null,
      icon: User,
      tone: cf.motivationLevel && cf.motivationLevel >= 4 ? "highlight" : "normal",
    },
    {
      label: "Timeline",
      value: cf.sellerTimeline ? (TIMELINE_LABELS[cf.sellerTimeline] ?? cf.sellerTimeline) : null,
      icon: Calendar,
      tone: cf.sellerTimeline === "immediate" || cf.sellerTimeline === "30_days" ? "highlight" : "normal",
    },
    {
      label: "Asking Price",
      value: cf.priceExpectation ? formatCurrency(cf.priceExpectation) : null,
      icon: DollarSign,
    },
    {
      label: "Decision Maker",
      value: cf.decisionMakerConfirmed ? "Confirmed" : null,
      icon: User,
      tone: cf.decisionMakerConfirmed ? "highlight" : "dim",
    },
    {
      label: "Phone Quality",
      value: phoneConfidence
        ? `${phoneConfidence}% confidence`
        : cf.ownerPhone ? "Phone on file" : null,
      icon: Phone,
      tone: phoneConfidence && phoneConfidence >= 80 ? "highlight" : "normal",
    },
    {
      label: "Last Contact",
      value: cf.lastContactAt ? formatRelativeFromNow(cf.lastContactAt) : null,
      icon: Clock,
    },
  ];

  const situation = cf.sellerSituationSummaryShort ?? cf.recommendedCallAngle;
  const hasAnyData = items.some((i) => i.value) || situation;

  if (!hasAnyData) return null;

  return (
    <div className="rounded-[12px] border border-overlay-8 bg-overlay-2 p-3.5 space-y-3">
      <div className="flex items-center gap-2">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Seller Snapshot
        </span>
      </div>

      {situation && (
        <p className="text-sm text-foreground/90 leading-relaxed">
          {situation}
        </p>
      )}

      <div className="grid grid-cols-3 gap-x-4 gap-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const display = item.value ?? "Not captured";
          const isMissing = !item.value;
          return (
            <div key={item.label} className="min-w-0">
              <p className="text-xs text-muted-foreground/60 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <Icon className="h-2.5 w-2.5" />
                {item.label}
              </p>
              <p className={cn(
                "text-sm truncate",
                isMissing
                  ? "text-muted-foreground/40 italic"
                  : item.tone === "highlight"
                    ? "text-foreground font-semibold"
                    : "text-foreground/80"
              )}>
                {display}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
