import type { FeatureFlags } from "./types";

const defaultFlags: FeatureFlags = {
  aiScoring: true,
  dialer: true,
  ghostMode: true,
  teamChat: true,
  campaigns: true,
};

export function getFeatureFlags(): FeatureFlags {
  if (typeof window === "undefined") return defaultFlags;

  return {
    aiScoring: process.env.NEXT_PUBLIC_FEATURE_AI_SCORING !== "false",
    dialer: process.env.NEXT_PUBLIC_FEATURE_DIALER !== "false",
    ghostMode: process.env.NEXT_PUBLIC_FEATURE_GHOST_MODE !== "false",
    teamChat: process.env.NEXT_PUBLIC_FEATURE_TEAM_CHAT !== "false",
    campaigns: process.env.NEXT_PUBLIC_FEATURE_CAMPAIGNS !== "false",
  };
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag];
}
