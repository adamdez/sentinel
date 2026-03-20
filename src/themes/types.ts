/**
 * Sentinel UI theme identifiers.
 * Add new ids here and in registry.ts — CSS targets html[data-sentinel-theme="<id>"].
 */
export type SentinelThemeId = "default" | "ghost-mode";

export function isSentinelThemeId(value: string): value is SentinelThemeId {
  return value === "default" || value === "ghost-mode";
}
