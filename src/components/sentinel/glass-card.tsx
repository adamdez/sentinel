"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: boolean;
  glowStrong?: boolean;
  hover?: boolean;
  delay?: number;
}

export function GlassCard({
  glow,
  glowStrong,
  hover = true,
  delay = 0,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cn(
        "rounded-xl border border-glass-border bg-glass backdrop-blur-xl p-5 transition-all duration-300",
        glow && "neon-glow animate-neon-pulse",
        glowStrong && "neon-glow-strong",
        hover && "hover:border-white/10 hover:bg-glass/80",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
