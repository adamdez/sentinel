"use client";

import { motion } from "framer-motion";
import { BannerLarge, ShieldIcon, CrownIcon, GoldDivider, BannerIcon } from "./icons";

/**
 * Psalm 20 dashboard hero — replaces the standard "Today" header with a
 * dramatic banner-of-victory treatment when the theme is active.
 */
export function Psalm20DashboardHero() {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative rounded-[16px] overflow-hidden mb-2"
      style={{
        background: "linear-gradient(135deg, rgba(14,18,36,0.80) 0%, rgba(10,14,28,0.60) 100%)",
        border: "1px solid rgba(201,168,76,0.10)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.3), 0 0 60px rgba(201,168,76,0.04)",
      }}
    >
      {/* Ambient gold glow at top center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 40% at 50% -10%, rgba(201,168,76,0.07) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 px-8 py-6">
        {/* Top row: shield + date */}
        <div className="flex items-center gap-3 mb-4">
          <ShieldIcon className="h-5 w-5" color="rgba(201,168,76,0.6)" />
          <span
            className="text-xs tracking-[0.2em] uppercase font-medium"
            style={{ color: "rgba(201,168,76,0.55)" }}
          >
            {dateStr}
          </span>
        </div>

        {/* Banner graphic */}
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <h1
              className="text-3xl font-bold tracking-tight mb-1"
              style={{ color: "var(--psalm20-ivory)", textShadow: "0 0 40px rgba(201,168,76,0.12)" }}
            >
              Today&rsquo;s Command
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <BannerIcon className="h-3 w-3" color="rgba(201,168,76,0.4)" />
              <span
                className="text-[11px] tracking-[0.18em] uppercase italic"
                style={{ color: "rgba(201,168,76,0.45)" }}
              >
                &ldquo;May he fulfill all your plans.&rdquo;
              </span>
            </div>
          </div>
          <div className="hidden sm:block w-48 opacity-70">
            <BannerLarge />
          </div>
          <div className="hidden sm:flex flex-col items-center gap-1.5">
            <CrownIcon className="h-8 w-8" color="rgba(201,168,76,0.25)" />
            <span className="text-[8px] tracking-[0.3em] uppercase" style={{ color: "rgba(201,168,76,0.25)" }}>
              Victory
            </span>
          </div>
        </div>

        {/* Bottom gold divider */}
        <GoldDivider className="mt-5 opacity-50" />
      </div>
    </motion.div>
  );
}
