"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-medium transition-all duration-250 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(0,255,136,0.2),0_0_40px_rgba(0,255,136,0.06)] hover:shadow-[0_0_30px_rgba(0,255,136,0.35),0_0_60px_rgba(0,255,136,0.1)] hover:brightness-110 border border-neon/20",
        destructive:
          "bg-destructive/90 text-destructive-foreground hover:bg-destructive border border-destructive/30 shadow-[0_0_15px_rgba(255,68,102,0.15)]",
        outline:
          "border border-white/[0.08] bg-[rgba(12,12,22,0.4)] backdrop-blur-xl hover:bg-white/[0.05] hover:border-cyan/20 hover:shadow-[0_0_20px_rgba(0,229,255,0.08)]",
        secondary:
          "bg-[rgba(18,18,32,0.6)] text-secondary-foreground hover:bg-[rgba(24,24,44,0.7)] border border-white/[0.06]",
        ghost:
          "hover:bg-white/[0.04] hover:text-accent-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
        neon:
          "bg-transparent border border-neon/25 text-neon hover:bg-neon/8 hover:border-neon/50 shadow-[0_0_15px_rgba(0,255,136,0.08)] hover:shadow-[0_0_25px_rgba(0,255,136,0.2)]",
        cyan:
          "bg-transparent border border-cyan/25 text-cyan hover:bg-cyan/8 hover:border-cyan/50 shadow-[0_0_15px_rgba(0,229,255,0.08)] hover:shadow-[0_0_25px_rgba(0,229,255,0.2)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[10px] px-3 text-xs",
        lg: "h-10 rounded-[12px] px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
