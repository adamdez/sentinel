"use client";

import { useRef, useCallback } from "react";
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

  const tileRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!hover) return;
    const el = tileRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1200px) rotateY(${x * 3}deg) rotateX(${y * -3}deg) translateY(-6px) translateZ(8px)`;
    el.style.filter = "brightness(1.15)";
  }, [hover]);

  const handleMouseLeave = useCallback(() => {
    const el = tileRef.current;
    if (!el) return;
    el.style.transform = "perspective(1200px) rotateY(0deg) rotateX(0deg) translateY(0px) translateZ(0px)";
    el.style.filter = "brightness(1)";
  }, []);

  return (
    <motion.div
      ref={tileRef}
      initial={hydrated ? { opacity: 0, y: 8, filter: "blur(3px)" } : false}
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
      style={{ transformStyle: "preserve-3d", willChange: "transform, filter", transition: "transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease" }}
      {...props}
    >
      <div className="relative z-[6]">{children as React.ReactNode}</div>
    </motion.div>
  );
}
