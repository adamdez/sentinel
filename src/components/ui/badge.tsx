import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[8px] border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/12 text-primary",
        secondary:
          "border-white/[0.06] bg-[rgba(18,18,32,0.5)] text-secondary-foreground",
        destructive:
          "border-destructive/25 bg-destructive/12 text-destructive shadow-[0_0_10px_rgba(255,68,102,0.12)]",
        outline:
          "border-white/[0.08] text-foreground bg-white/[0.02]",
        fire:
          "border-orange-500/25 bg-orange-500/12 text-orange-400 shadow-[0_0_12px_rgba(255,107,53,0.2)]",
        hot:
          "border-red-500/25 bg-red-500/12 text-red-400 shadow-[0_0_12px_rgba(255,68,68,0.2)]",
        warm:
          "border-yellow-500/25 bg-yellow-500/12 text-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.1)]",
        cold:
          "border-blue-500/25 bg-blue-500/12 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.1)]",
        neon:
          "border-neon/25 bg-neon/8 text-neon shadow-[0_0_12px_rgba(0,255,136,0.15)]",
        cyan:
          "border-cyan/25 bg-cyan/8 text-cyan shadow-[0_0_12px_rgba(0,229,255,0.15)]",
        purple:
          "border-purple/25 bg-purple/8 text-purple shadow-[0_0_12px_rgba(168,85,247,0.15)]",
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
