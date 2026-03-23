"use client";

import { useSentinelTheme } from "@/providers/theme-provider";

/** Returns true when the Psalm 20 theme is currently active. */
export function usePsalm20(): boolean {
  const { theme } = useSentinelTheme();
  return theme === "psalm20";
}

/** Short scripture fragments from Psalm 20 (ESV), curated for sparse placement. */
export const PSALM20_VERSES = [
  "In the name of our God we will set up our banners.",
  "We rise and stand upright.",
  "May he send you help from the sanctuary.",
  "May he fulfill all your plans.",
  "Some trust in chariots and some in horses, but we trust in the name of the LORD our God.",
  "May he grant you your heart\u2019s desire.",
  "May he remember all your offerings.",
  "We will shout for joy over your salvation.",
  "May the LORD answer you in the day of trouble.",
  "May the name of the God of Jacob protect you.",
] as const;

/** The full text of Psalm 20 (ESV) for background watermark rendering. */
export const PSALM20_FULL_ESV = `May the LORD answer you in the day of trouble!
May the name of the God of Jacob protect you!
May he send you help from the sanctuary
and give you support from Zion!
May he remember all your offerings
and regard with favor your burnt sacrifices! Selah
May he grant you your heart's desire
and fulfill all your plans!
May we shout for joy over your salvation,
and in the name of our God set up our banners!
May the LORD fulfill all your petitions!
Now I know that the LORD saves his anointed;
he will answer him from his holy heaven
with the saving might of his right hand.
Some trust in chariots and some in horses,
but we trust in the name of the LORD our God.
They collapse and fall,
but we rise and stand upright.
O LORD, save the king!
May he answer us when we call.`;

/** Stable fragment for a given page route — deterministic, not random */
export function verseForRoute(pathname: string): string {
  const route = pathname.replace(/\/$/, "") || "/dashboard";
  const routeVerseMap: Record<string, string> = {
    "/dashboard": "May he fulfill all your plans.",
    "/leads": "In the name of our God we will set up our banners.",
    "/dialer": "We rise and stand upright.",
    "/dispo": "May he grant you your heart\u2019s desire.",
    "/pipeline": "May the LORD fulfill all your petitions.",
    "/analytics": "May he remember all your offerings.",
    "/settings": "May he send you help from the sanctuary.",
    "/buyers": "We trust in the name of the LORD our God.",
    "/contacts": "May the name of the God of Jacob protect you.",
    "/ads": "Some trust in chariots and some in horses, but we trust in the name of the LORD our God.",
    "/campaigns": "In the name of our God we will set up our banners.",
    "/properties/lookup": "May he send you help from the sanctuary.",
    "/gmail": "We rise and stand upright.",
    "/admin/import": "May the LORD answer you in the day of trouble.",
    "/admin/health": "May he fulfill all your plans.",
    "/grok": "We trust in the name of the LORD our God.",
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
