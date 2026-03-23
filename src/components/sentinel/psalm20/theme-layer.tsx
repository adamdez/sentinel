"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { usePsalm20, verseForRoute } from "./use-psalm20";
import { GoldDivider, ShieldIcon } from "./icons";

/**
 * Psalm20ThemeLayer — renders persistent verse banner and decorative elements
 * at the top of every page when the Psalm 20 theme is active. Mounted inside
 * the sentinel layout so it wraps all page content.
 */
export function Psalm20ThemeLayer({ children }: { children: React.ReactNode }) {
  const active = usePsalm20();
  const pathname = usePathname();

  if (!active) return <>{children}</>;

  const verse = verseForRoute(pathname);

  return (
    <>
      {/* Ambient sanctuary glow — top-center radial, never blocks interaction */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse 60% 30% at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Verse banner bar — persistent across pages */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="relative z-10 flex items-center justify-center gap-3 px-4 py-1.5 border-b"
        style={{
          background: "rgba(201,168,76,0.03)",
          borderColor: "rgba(201,168,76,0.08)",
        }}
      >
        <ShieldIcon className="h-3.5 w-3.5 text-[var(--psalm20-gold)] opacity-40" />
        <span
          className="text-[11px] tracking-[0.18em] uppercase font-medium"
          style={{ color: "var(--psalm20-gold)", opacity: 0.55 }}
        >
          {verse}
        </span>
        <ShieldIcon className="h-3.5 w-3.5 text-[var(--psalm20-gold)] opacity-40" />
      </motion.div>

      {/* Gold divider below verse bar */}
      <GoldDivider className="relative z-10 opacity-60" />

      {/* Page content */}
      <div className="relative z-10 flex-1 overflow-auto">
        {children}
      </div>
    </>
  );
}
