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
          "bg-cyan/15 text-cyan border border-cyan/20 backdrop-blur-sm shadow-[0_0_20px_rgba(0,212,255,0.1)] hover:bg-cyan/25 hover:border-cyan/35 hover:shadow-[0_0_30px_rgba(0,212,255,0.2)]",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/20 hover:bg-destructive/25",
        outline:
          "border border-glass-border bg-glass/50 backdrop-blur-xl hover:bg-cyan/5 hover:border-cyan/15 hover:text-cyan",
        secondary:
          "bg-secondary text-secondary-foreground border border-glass-border hover:bg-secondary/80",
        ghost:
          "hover:bg-cyan/5 hover:text-cyan",
        link:
          "text-cyan underline-offset-4 hover:underline",
        neon:
          "bg-transparent border border-neon/25 text-neon hover:bg-neon/8 hover:border-neon/50 shadow-[0_0_12px_rgba(0,255,136,0.08)] hover:shadow-[0_0_20px_rgba(0,255,136,0.18)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-[10px] px-3 text-xs",
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
