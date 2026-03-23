"use client";

import { useSentinelTheme } from "@/providers/theme-provider";

/** Returns true when the Psalm 20 theme is currently active. */
export function usePsalm20(): boolean {
  const { theme } = useSentinelTheme();
  return theme === "psalm20";
}

/** Short scripture fragments from Psalm 20, curated for sparse placement. */
export const PSALM20_VERSES = [
  "We will raise our banners.",
  "Stand firm.",
  "Help from the sanctuary.",
  "May your plans succeed.",
  "Rise and stand upright.",
  "Some trust in chariots and some in horses\u2026",
  "We trust in the name\u2026",
  "Grant you your heart\u2019s desire.",
  "May He send you help from the sanctuary.",
  "May He remember all your offerings.",
] as const;

/** Stable fragment for a given page route — deterministic, not random */
export function verseForRoute(pathname: string): string {
  const route = pathname.replace(/\/$/, "") || "/dashboard";
  const routeVerseMap: Record<string, string> = {
    "/dashboard": "May your plans succeed.",
    "/leads": "We will raise our banners.",
    "/dialer": "Stand firm.",
    "/dispo": "Grant you your heart\u2019s desire.",
    "/pipeline": "Rise and stand upright.",
    "/analytics": "May He remember all your offerings.",
    "/settings": "Help from the sanctuary.",
    "/buyers": "We trust in the name\u2026",
    "/contacts": "May He send you help from the sanctuary.",
    "/ads": "Some trust in chariots and some in horses\u2026",
    "/campaigns": "We will raise our banners.",
    "/properties/lookup": "Help from the sanctuary.",
    "/gmail": "Stand firm.",
    "/admin/import": "Rise and stand upright.",
    "/admin/health": "May your plans succeed.",
    "/grok": "We trust in the name\u2026",
  };

  for (const [prefix, verse] of Object.entries(routeVerseMap)) {
    if (route === prefix || route.startsWith(prefix + "/")) return verse;
  }

  let hash = 0;
  for (let i = 0; i < route.length; i++) {
    hash = (hash * 31 + route.charCodeAt(i)) | 0;
  }
  return PSALM20_VERSES[Math.abs(hash) % PSALM20_VERSES.length];
}
