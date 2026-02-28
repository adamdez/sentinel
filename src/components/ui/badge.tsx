import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[8px] border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-cyan/15 bg-cyan/8 text-cyan",
        secondary:
          "border-glass-border bg-secondary text-secondary-foreground",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive",
        outline:
          "border-glass-border text-foreground",
        fire:
          "border-orange-500/25 bg-orange-500/10 text-orange-400 shadow-[0_0_10px_rgba(255,107,53,0.15)]",
        hot:
          "border-red-500/25 bg-red-500/10 text-red-400 shadow-[0_0_10px_rgba(255,68,68,0.15)]",
        warm:
          "border-yellow-500/25 bg-yellow-500/10 text-yellow-400",
        cold:
          "border-blue-500/25 bg-blue-500/10 text-blue-400",
        neon:
          "border-neon/20 bg-neon/8 text-neon shadow-[0_0_8px_rgba(0,255,136,0.1)]",
        cyan:
          "border-cyan/20 bg-cyan/8 text-cyan shadow-[0_0_8px_rgba(0,212,255,0.1)]",
        purple:
          "border-purple/20 bg-purple/8 text-purple shadow-[0_0_8px_rgba(168,85,247,0.1)]",
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
