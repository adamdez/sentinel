"use client";

import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientFile } from "../master-client-file-helpers";

interface QualificationGapsProps {
  cf: ClientFile;
}

interface GapItem {
  label: string;
  filled: boolean;
}

export function QualificationGaps({ cf }: QualificationGapsProps) {
  const items: GapItem[] = [
    { label: "Motivation level", filled: cf.motivationLevel != null && cf.motivationLevel > 0 },
    { label: "Seller timeline", filled: cf.sellerTimeline != null },
    { label: "Asking price", filled: cf.priceExpectation != null && cf.priceExpectation > 0 },
    { label: "Decision maker confirmed", filled: cf.decisionMakerConfirmed === true },
    { label: "Property condition", filled: cf.conditionLevel != null && cf.conditionLevel > 0 },
    { label: "Next action scheduled", filled: !!(cf.nextCallScheduledAt ?? cf.nextActionDueAt ?? cf.followUpDate) },
    { label: "Recent contact", filled: !!cf.lastContactAt && (Date.now() - new Date(cf.lastContactAt).getTime()) < 14 * 24 * 60 * 60 * 1000 },
    { label: "Valid phone number", filled: !!cf.ownerPhone },
  ];

  const gaps = items.filter((i) => !i.filled);
  const filled = items.filter((i) => i.filled);

  if (gaps.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/[0.03] p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          What We Still Need
        </span>
        <span className="text-xs text-muted-foreground/50 ml-auto">
          {filled.length}/{items.length} captured
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 py-0.5">
            {item.filled ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500/70 shrink-0" />
            ) : (
              <Circle className="h-3 w-3 text-amber-400/60 shrink-0" />
            )}
            <span className={cn(
              "text-xs",
              item.filled
                ? "text-muted-foreground/50 line-through"
                : "text-foreground/80 font-medium"
            )}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
