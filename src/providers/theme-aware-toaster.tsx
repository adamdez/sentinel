"use client";

import { Toaster } from "sonner";
import { useSentinelTheme } from "./theme-provider";

/**
 * Sonner theme + glass styles follow Light/Dark (monochrome tokens via globals).
 */
export function ThemeAwareToaster() {
  const { theme } = useSentinelTheme();

  return (
    <Toaster
      position="bottom-right"
      theme={theme === "dark" ? "dark" : "light"}
      toastOptions={{
        style: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          backdropFilter: "blur(20px)",
          color: "var(--popover-foreground)",
        },
      }}
    />
  );
}
