"use client";

import { cn } from "@/lib/utils";

/**
 * Marks a subtree as operator-critical under alternate theme packs.
 * Parent theme CSS resets semantic + --shell-* tokens for descendants so
 * workflow density stays stable while the app shell can go heavy.
 *
 * Prefer route-level layout wrappers (see `src/app/(sentinel)/dialer/layout.tsx`)
 * over sprinkling this everywhere; use `PageShell operatorSafe` only when a page
 * is not covered by a layout segment.
 */
export function OperatorSafeBoundary({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(className)} data-operator-safe="">
      {children}
    </div>
  );
}
