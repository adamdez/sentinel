"use client";

import { useRef, useCallback } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

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

  const tileRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!hover) return;
    const el = tileRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1200px) rotateY(${x * 2}deg) rotateX(${y * -2}deg) translateY(-4px) translateZ(6px)`;
  }, [hover]);

  const handleMouseLeave = useCallback(() => {
    const el = tileRef.current;
    if (!el) return;
    el.style.transform = "perspective(1200px) rotateY(0deg) rotateX(0deg) translateY(0px) translateZ(0px)";
  }, []);

  return (
    <motion.div
      ref={tileRef}
      initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.12, delay, ease: "easeOut" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        `rounded-[14px] border border-glass-border p-5 ${glassClass} holo-border holo-ring wet-shine`,
        glow && "neon-glow animate-cyan-pulse holo-border-always",
        glowStrong && "neon-glow-strong holo-border-always",
        hover && "hover:border-cyan/12",
        className
      )}
      style={{ transformStyle: "preserve-3d", willChange: "transform", transition: "transform 0.1s ease, box-shadow 0.1s ease" }}
      {...props}
    >
      <div className="relative z-[6]">{children as React.ReactNode}</div>
    </motion.div>
  );
}
