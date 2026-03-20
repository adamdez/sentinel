"use client";

import { motion } from "framer-motion";
import { useHydrated } from "@/providers/hydration-provider";
interface PageShellProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageShell({ title, description, children, actions }: PageShellProps) {
  const hydrated = useHydrated();

  return (
    <motion.div
      initial={hydrated ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1 }}
      className="flex-1 overflow-auto"
    >
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <motion.h1
              initial={hydrated ? { opacity: 0, x: -8 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="text-2xl font-semibold tracking-tight text-foreground"
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
        {children}
      </div>
    </motion.div>
  );
}
