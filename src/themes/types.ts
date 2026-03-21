/**
 * Sentinel UI theme identifiers — user-facing: Light and Dark only.
 * CSS: html[data-sentinel-theme="<id>"] and html.dark for Tailwind `dark:` (dark theme only).
 */
export type SentinelThemeId = "light" | "dark";

const LEGACY_TO_DARK: Record<string, true> = {
  default: true,
  "ghost-mode": true,
};

export function migrateLegacyThemeId(raw: string | null | undefined): SentinelThemeId {
  if (raw === "light" || raw === "dark") return raw;
  if (raw && LEGACY_TO_DARK[raw]) return "dark";
  return "dark";
}

export function isSentinelThemeId(value: string): value is SentinelThemeId {
  return value === "light" || value === "dark";
}
