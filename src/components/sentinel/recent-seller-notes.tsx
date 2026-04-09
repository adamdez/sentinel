"use client";

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadNotesPreview } from "@/lib/dialer/types";
import { splitPreviewContent } from "@/lib/dialer/note-preview";

type RecentSellerNotesProps = {
  preview: LeadNotesPreview | null | undefined;
  title?: string;
  className?: string;
  maxItems?: number;
};

function formatNoteTimestamp(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RecentSellerNotes({
  preview,
  title = "Recent Notes",
  className,
  maxItems = 3,
}: RecentSellerNotesProps) {
  const items = (preview?.items ?? []).slice(0, Math.max(1, maxItems));
  if (items.length === 0) return null;

  return (
    <div className={cn("rounded-xl border border-border/20 bg-muted/[0.04] p-3 space-y-2", className)}>
      <div className="ops-text-meta flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground/65">
        <MessageSquare className="h-3 w-3" />
        {title}
      </div>

      <div className="space-y-2">
        {items.map((item, index) => {
          const lines = splitPreviewContent(item.content);
          if (lines.length === 0) return null;

          return (
            <div
              key={item.id}
              className={cn(index > 0 && "border-t border-border/10 pt-2")}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="ops-text-faint text-[10px] uppercase tracking-wide text-muted-foreground/45">
                  {item.sourceLabel}
                </span>
                <span className="ops-text-faint shrink-0 text-[10px] text-muted-foreground/40">
                  {formatNoteTimestamp(item.createdAt)}
                </span>
              </div>

              <div className="space-y-1">
                {lines.map((line) => (
                  <div key={`${item.id}:${line}`} className="flex items-start gap-2 text-sm">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                    <span
                      className={cn(
                        "leading-snug",
                        item.isAiGenerated && !item.isConfirmed
                          ? "ops-text-meta text-muted-foreground/65 italic"
                          : "ops-text-body text-foreground/80",
                      )}
                    >
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
