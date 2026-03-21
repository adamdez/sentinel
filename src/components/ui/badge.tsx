import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[8px] border px-3 py-1 text-xs font-semibold leading-tight transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
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
          "border-white/20 bg-white/[0.08] text-foreground shadow-[var(--shadow-badge-glow-tight)]",
        silver:
          "border-white/15 bg-white/[0.06] text-muted-foreground",
        bronze:
          "border-white/12 bg-white/[0.05] text-muted-foreground",
        neon:
          "border-primary/20 bg-primary/8 text-primary shadow-[var(--shadow-badge-glow-tight)]",
        cyan:
          "border-primary/20 bg-primary/8 text-primary shadow-[var(--shadow-badge-glow-tight)]",
        purple:
          "border-primary/20 bg-primary/8 text-primary shadow-[var(--shadow-badge-glow-tight)]",
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
