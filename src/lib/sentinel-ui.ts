/**
 * Reusable class strings for Sentinel-specific UI — prefer these over
 * repeated border-white/* + text-primary patterns so theme tokens flow through.
 */
export const filterChip = {
  active: "bg-primary/12 text-primary border-primary/20",
  idle:
    "border-border-hairline text-muted-foreground hover:text-foreground hover:border-border-hairline-hover",
} as const;

export const sentinelInput =
  "rounded-[10px] text-sm font-mono bg-surface-inset-mid border border-border-hairline text-foreground " +
  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 " +
  "transition-all hover:border-border-hairline-hover";
