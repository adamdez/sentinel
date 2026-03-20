import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[8px] border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-primary/15 bg-primary/8 text-primary shadow-[var(--shadow-badge-glow-tight)]",
        secondary:
          "border-glass-border bg-secondary text-secondary-foreground",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive",
        outline:
          "border-border-hairline text-foreground bg-surface-inset",
        platinum:
          "border-primary/25 bg-primary/10 text-primary shadow-[var(--shadow-badge-glow)]",
        gold:
          "border-amber-500/25 bg-amber-500/10 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
        silver:
          "border-slate-400/25 bg-slate-400/10 text-slate-300",
        bronze:
          "border-orange-600/25 bg-orange-600/10 text-orange-500",
        neon:
          "border-neon/20 bg-neon/8 text-neon shadow-[var(--shadow-badge-glow-tight)]",
        cyan:
          "border-primary/20 bg-primary/8 text-primary shadow-[var(--shadow-badge-glow-tight)]",
        purple:
          "border-purple/20 bg-purple/8 text-purple shadow-[var(--shadow-badge-glow-tight)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
