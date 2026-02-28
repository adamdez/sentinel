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
      whileHover={hover ? { y: -3, rotateX: -0.5, rotateY: 0.5, transition: { duration: 0.25 } } : undefined}
      className={cn(
        "rounded-[14px] border border-glass-border bg-glass backdrop-blur-2xl p-5 transition-all duration-300 holo-border inner-glow-card",
        glow && "neon-glow animate-cyan-pulse holo-border-always",
        glowStrong && "neon-glow-strong holo-border-always",
        hover && "hover:border-cyan/10 hover:bg-glass/80",
        className
      )}
      style={{ transformStyle: "preserve-3d", perspective: 800 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
