import { LampDesk } from "lucide-react";
import { cn } from "@/lib/utils";

type SkipGenieBadgeSize = "sm" | "md";

export function SkipGenieBadge({
  className,
  title,
  size = "md",
}: {
  className?: string;
  title?: string;
  size?: SkipGenieBadgeSize;
}) {
  const compact = size === "sm";

  return (
    <span
      title={title ?? "Imported from Skip Genie"}
      className={cn(
        "inline-flex items-center rounded-md border font-semibold shrink-0",
        "border-amber-500/25 bg-amber-500/10 text-amber-200",
        compact ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-1.5 px-3 py-1.5 text-xs",
        className,
      )}
    >
      <LampDesk className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Skip Genie
    </span>
  );
}
