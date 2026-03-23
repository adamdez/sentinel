"use client";

import { motion } from "framer-motion";
import { usePsalm20, PSALM20_VERSES } from "./use-psalm20";
import { ShieldIcon, GoldDivider } from "./icons";

interface Psalm20EmptyStateProps {
  /** Standard empty-state message shown regardless of theme */
  message: string;
  /** Optional icon to show above message — in psalm20 mode, shield is used instead */
  children?: React.ReactNode;
}

/**
 * Wraps or replaces standard empty states. When psalm20 is active, renders a
 * premium gold-tinted empty state with a shield motif and scripture fragment.
 * When not psalm20, renders children as-is (passthrough).
 */
export function Psalm20EmptyState({ message, children }: Psalm20EmptyStateProps) {
  const isPsalm20 = usePsalm20();

  if (!isPsalm20) return <>{children}</>;

  const verse = PSALM20_VERSES[Math.abs(message.length) % PSALM20_VERSES.length];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-16 px-8"
    >
      <div
        className="h-16 w-16 rounded-xl flex items-center justify-center mb-5"
        style={{
          background: "rgba(201,168,76,0.06)",
          border: "1px solid rgba(201,168,76,0.12)",
          boxShadow: "0 0 30px rgba(201,168,76,0.06)",
        }}
      >
        <ShieldIcon className="h-8 w-8" color="rgba(201,168,76,0.35)" />
      </div>

      <p className="text-sm text-muted-foreground mb-3">{message}</p>

      <GoldDivider className="w-48 opacity-40 mb-3" />

      <span
        className="text-[10px] tracking-[0.18em] uppercase italic"
        style={{ color: "rgba(201,168,76,0.35)" }}
      >
        &ldquo;{verse}&rdquo;
      </span>
    </motion.div>
  );
}
