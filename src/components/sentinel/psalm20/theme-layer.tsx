"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePsalm20, PSALM20_VERSES } from "./use-psalm20";
import { GoldDivider, ShieldIcon, BannerIcon } from "./icons";

const CYCLE_MS = 12_000;

/**
 * Psalm20ThemeLayer — renders persistent verse banner and decorative elements
 * at the top of every page when the Psalm 20 theme is active. Mounted inside
 * the sentinel layout so it wraps all page content.
 *
 * The banner cycles through all 10 curated ESV fragments with a crossfade,
 * rotating every 12 seconds.
 */
export function Psalm20ThemeLayer({ children }: { children: React.ReactNode }) {
  const active = usePsalm20();
  const [idx, setIdx] = useState(0);

  const advance = useCallback(() => {
    setIdx((prev) => (prev + 1) % PSALM20_VERSES.length);
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(advance, CYCLE_MS);
    return () => clearInterval(timer);
  }, [active, advance]);

  if (!active) return <>{children}</>;

  const verse = PSALM20_VERSES[idx];

  return (
    <>
      {/* Ambient sanctuary glow — top-center radial, never blocks interaction */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse 60% 30% at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Verse banner bar — persistent across pages, cycles through full psalm */}
      <div
        className="relative z-10 flex items-center justify-center gap-4 px-6 py-3 border-b overflow-hidden"
        style={{
          background: "rgba(201,168,76,0.03)",
          borderColor: "rgba(201,168,76,0.08)",
        }}
      >
        <ShieldIcon className="h-5 w-5 shrink-0 text-[var(--psalm20-gold)] opacity-50" />

        <div className="relative h-[28px] flex items-center justify-center min-w-0">
          <AnimatePresence mode="wait">
            <motion.span
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 0.82, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              className="text-[22px] tracking-[0.18em] uppercase font-medium whitespace-nowrap"
              style={{
                color: "var(--psalm20-gold)",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 600,
                letterSpacing: "0.14em",
              }}
            >
              {verse}
            </motion.span>
          </AnimatePresence>
        </div>

        <BannerIcon className="h-5 w-5 shrink-0 text-[var(--psalm20-gold)] opacity-50" />
      </div>

      {/* Gold divider below verse bar */}
      <GoldDivider className="relative z-10 opacity-60" />

      {/* Page content */}
      <div className="relative z-10 flex-1 overflow-auto">
        {children}
      </div>
    </>
  );
}
