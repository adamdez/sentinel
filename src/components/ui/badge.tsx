import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/15 text-primary",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive/15 text-destructive",
        outline:
          "border-glass-border text-foreground",
        fire:
          "border-orange-500/30 bg-orange-500/15 text-orange-400 shadow-[0_0_10px_rgba(255,107,53,0.2)]",
        hot:
          "border-red-500/30 bg-red-500/15 text-red-400 shadow-[0_0_10px_rgba(255,68,68,0.2)]",
        warm:
          "border-yellow-500/30 bg-yellow-500/15 text-yellow-400",
        cold:
          "border-blue-500/30 bg-blue-500/15 text-blue-400",
        neon:
          "border-neon/30 bg-neon/10 text-neon shadow-[0_0_10px_rgba(0,255,136,0.15)]",
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
