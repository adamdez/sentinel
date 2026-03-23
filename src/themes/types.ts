/**
 * Sentinel UI theme identifiers.
 * CSS: html[data-sentinel-theme="<id>"] and html.dark for Tailwind `dark:` (dark + psalm20).
 */
export type SentinelThemeId = "light" | "dark" | "psalm20";

const VALID_IDS = new Set<string>(["light", "dark", "psalm20"]);

const LEGACY_TO_DARK: Record<string, true> = {
  default: true,
  "ghost-mode": true,
};

export function migrateLegacyThemeId(raw: string | null | undefined): SentinelThemeId {
  if (raw && VALID_IDS.has(raw)) return raw as SentinelThemeId;
  if (raw && LEGACY_TO_DARK[raw]) return "dark";
  return "dark";
}

export function isSentinelThemeId(value: string): value is SentinelThemeId {
  return VALID_IDS.has(value);
}
