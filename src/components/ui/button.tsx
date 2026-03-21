"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-white/12 backdrop-blur-sm shadow-[var(--shadow-badge-glow-tight)] hover:opacity-95",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/20 hover:bg-destructive/25",
        outline:
          "border border-glass-border bg-glass/50 backdrop-blur-xl hover:bg-white/[0.06] hover:border-white/15 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground border border-glass-border hover:bg-secondary/80",
        ghost:
          "hover:bg-white/[0.06] hover:text-foreground",
        link:
          "text-foreground underline-offset-4 hover:underline",
        neon:
          "bg-transparent border border-white/20 text-foreground hover:bg-white/[0.06] hover:border-white/28 shadow-[var(--shadow-badge-glow-tight)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-9 rounded-[10px] px-3.5 text-sm",
        lg: "h-10 rounded-[14px] px-8",
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
