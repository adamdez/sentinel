"use client";

import { motion } from "framer-motion";

interface PageShellProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageShell({ title, description, children, actions }: PageShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1 }}
      className="flex-1 overflow-auto"
    >
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <motion.h1
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="text-2xl font-bold tracking-tight title-holo text-glow-heading"
            >
              {title}
            </motion.h1>
            {description && (
              <motion.p
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03, duration: 0.1, ease: "easeOut" }}
                className="text-sm text-muted-foreground/70 mt-1"
              >
                {description}
              </motion.p>
            )}
          </div>
          {actions && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="flex items-center gap-2"
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
