"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useHydrated } from "@/providers/hydration-provider";
import { usePsalm20, verseForRoute } from "@/components/sentinel/psalm20/use-psalm20";
import { BannerIcon, GoldDivider } from "@/components/sentinel/psalm20/icons";

interface PageShellProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * When true, alternate themes keep workflow tokens on the default stack.
   * Prefer `src/app/(sentinel)/dialer/layout.tsx` for `/dialer/*`; use this for
   * ad-hoc pages (e.g. pipeline) until a route-group layout exists.
   */
  operatorSafe?: boolean;
}

export function PageShell({ title, description, children, actions, operatorSafe }: PageShellProps) {
  const hydrated = useHydrated();
  const isPsalm20 = usePsalm20();
  const pathname = usePathname();

  return (
    <motion.div
      initial={hydrated ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1 }}
      className="flex-1 overflow-auto"
      {...(operatorSafe ? { "data-operator-safe": "" } : {})}
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            {isPsalm20 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05, duration: 0.3 }}
                className="flex items-center gap-2 mb-1"
              >
                <BannerIcon className="h-3 w-3" color="var(--psalm20-gold-dim)" />
                <span
                  className="text-[12px] tracking-[0.2em] uppercase font-medium"
                  style={{ color: "var(--psalm20-gold-dim)", opacity: 0.75 }}
                >
                  {verseForRoute(pathname)}
                </span>
              </motion.div>
            )}
            <motion.h1
              initial={hydrated ? { opacity: 0, x: -8 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="text-2xl font-semibold tracking-tight text-foreground"
              style={isPsalm20 ? { textShadow: "0 0 30px rgba(201,168,76,0.08)" } : undefined}
            >
              {title}
            </motion.h1>
            {description && (
              <motion.p
                initial={hydrated ? { opacity: 0, x: -8 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03, duration: 0.1, ease: "easeOut" }}
                className="text-sm text-muted-foreground/70 mt-1"
              >
                {description}
              </motion.p>
            )}
          </div>

          <div className="flex-1" />

          {actions && (
            <motion.div
              initial={hydrated ? { opacity: 0, x: 8 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="flex items-center gap-2 shrink-0"
            >
              {actions}
            </motion.div>
          )}
        </div>
        {isPsalm20 && <GoldDivider className="opacity-40" />}
        {children}
      </div>
    </motion.div>
  );
}
