"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  glow?: boolean;
  glowStrong?: boolean;
  glowCyan?: boolean;
  glowPurple?: boolean;
  hover?: boolean;
  delay?: number;
}

export function GlassCard({
  glow,
  glowStrong,
  glowCyan,
  glowPurple,
  hover = true,
  delay = 0,
  className,
  children,
  ...props
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      whileHover={hover ? {
        y: -4,
        transition: { duration: 0.25 },
      } : undefined}
      className={cn(
        "rounded-[14px] border border-white/[0.07] bg-[rgba(12,12,22,0.45)] backdrop-blur-[24px] p-5",
        "shadow-[0_12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(0,0,0,0.3)]",
        "transition-all duration-300 holo-border",
        glow && "neon-glow animate-neon-pulse holo-border-always",
        glowStrong && "neon-glow-strong holo-border-always",
        glowCyan && "cyan-glow holo-border-always",
        glowPurple && "purple-glow holo-border-always",
        hover && "hover:border-white/[0.12] hover:shadow-[0_16px_50px_rgba(0,0,0,0.5),0_0_30px_rgba(0,229,255,0.04),inset_0_1px_0_rgba(255,255,255,0.08)]",
        className
      )}
      style={{ transformStyle: "preserve-3d", perspective: 1000 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
