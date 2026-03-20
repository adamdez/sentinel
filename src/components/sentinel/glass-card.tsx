"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/providers/hydration-provider";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: boolean;
  glowStrong?: boolean;
  hover?: boolean;
  delay?: number;
  variant?: "default" | "ultra" | "strong";
}

export function GlassCard({
  glow,
  glowStrong,
  hover = true,
  delay = 0,
  variant = "default",
  className,
  children,
  ...props
}: GlassCardProps) {
  const glassClass =
    variant === "ultra" ? "glass-ultra" :
    variant === "strong" ? "glass-strong" :
    "glass-card";

  const hydrated = useHydrated();

  return (
    <motion.div
      initial={hydrated ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, delay, ease: "easeOut" }}
      className={cn(
        `rounded-[14px] border border-glass-border p-5 ${glassClass}`,
        glow && "ring-1 ring-primary/30",
        glowStrong && "ring-1 ring-primary/45",
        hover && "hover:border-white/15 transition-colors duration-150",
        className
      )}
      {...props}
    >
      <div className="relative z-[6]">{children as React.ReactNode}</div>
    </motion.div>
  );
}
