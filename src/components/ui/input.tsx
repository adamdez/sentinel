import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[12px] border border-white/[0.07] bg-[rgba(12,12,22,0.4)] backdrop-blur-xl px-3 py-1 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all duration-200",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground/60",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan/30 focus-visible:border-cyan/20 focus-visible:shadow-[0_0_15px_rgba(0,229,255,0.08)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
