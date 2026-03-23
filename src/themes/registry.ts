import type { SentinelThemeId } from "./types";

export interface SentinelThemeDefinition {
  id: SentinelThemeId;
  label: string;
  /** Short operator-facing description */
  description: string;
  experimental?: boolean;
}

/**
 * Registry for selectable themes. Add new ids in types.ts + CSS under
 * html[data-sentinel-theme="<id>"].
 */
export const SENTINEL_THEMES: SentinelThemeDefinition[] = [
  {
    id: "dark",
    label: "Dark",
    description: "Charcoal shell, white text, monochrome glass — default for low-light ops.",
  },
  {
    id: "light",
    label: "Light",
    description: "Near-white surfaces, black text, monochrome glass — high-contrast daytime.",
  },
  {
    id: "psalm20",
    label: "Psalm 20 — Banner of Victory",
    description: "Midnight navy, brushed gold, sanctuary glow — a fortified command center under banner and purpose.",
  },
];

export const DEFAULT_SENTINEL_THEME: SentinelThemeId = "dark";

export function getThemeDefinition(id: SentinelThemeId): SentinelThemeDefinition {
  return SENTINEL_THEMES.find((t) => t.id === id) ?? SENTINEL_THEMES[0];
}
