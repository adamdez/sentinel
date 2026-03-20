import type { SentinelThemeId } from "./types";

export interface SentinelThemeDefinition {
  id: SentinelThemeId;
  label: string;
  /** Short operator-facing description */
  description: string;
  /** For seasonal / promo themes: keep false until explicitly launched */
  experimental?: boolean;
}

/**
 * Single registry for all theme packs. To add e.g. "st-patricks":
 * 1. Extend SentinelThemeId in types.ts
 * 2. Append here
 * 3. Add html[data-sentinel-theme="st-patricks"] { ... } in a dedicated CSS file
 */
export const SENTINEL_THEMES: SentinelThemeDefinition[] = [
  {
    id: "default",
    label: "Sentinel (default)",
    description: "Production baseline — charcoal shell, muted teal accents, neutral glass.",
  },
  {
    id: "ghost-mode",
    label: "Ghost Mode / Night Ops",
    description: "Tactical dark shell — colder contrast on chrome; workflow surfaces stay readable.",
    experimental: true,
  },
];

export const DEFAULT_SENTINEL_THEME: SentinelThemeId = "default";

export function getThemeDefinition(id: SentinelThemeId): SentinelThemeDefinition {
  return SENTINEL_THEMES.find((t) => t.id === id) ?? SENTINEL_THEMES[0];
}
