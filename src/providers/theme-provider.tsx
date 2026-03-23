"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SentinelThemeId } from "@/themes/types";
import { isSentinelThemeId, migrateLegacyThemeId } from "@/themes/types";
import { DEFAULT_SENTINEL_THEME } from "@/themes/registry";
import { SENTINEL_THEME_STORAGE_KEY } from "@/themes/constants";
import { supabase } from "@/lib/supabase";

interface ThemeContextValue {
  theme: SentinelThemeId;
  setTheme: (id: SentinelThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_VARIANTS = new Set<SentinelThemeId>(["dark", "psalm20"]);

function applyThemeToDocument(id: SentinelThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-sentinel-theme", id);
  document.documentElement.classList.toggle("dark", DARK_VARIANTS.has(id));
}

async function persistToSupabase(id: SentinelThemeId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from("user_profiles") as any)
      .select("preferences")
      .eq("id", user.id)
      .single();
    const prefs = (profile?.preferences as Record<string, unknown>) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("user_profiles") as any)
      .update({ preferences: { ...prefs, theme: id } })
      .eq("id", user.id);
  } catch {
    // Non-fatal — localStorage is the fast path
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<SentinelThemeId>(DEFAULT_SENTINEL_THEME);

  useEffect(() => {
    // 1. Apply localStorage immediately (prevents flash)
    let resolved: SentinelThemeId = DEFAULT_SENTINEL_THEME;
    try {
      const raw = localStorage.getItem(SENTINEL_THEME_STORAGE_KEY);
      const migrated = migrateLegacyThemeId(raw);
      if (raw !== migrated) {
        try { localStorage.setItem(SENTINEL_THEME_STORAGE_KEY, migrated); } catch { /* */ }
      }
      if (isSentinelThemeId(migrated)) resolved = migrated;
    } catch { /* */ }
    setThemeState(resolved);
    applyThemeToDocument(resolved);

    // 2. Then check Supabase for the durable preference (overrides localStorage on login)
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase.from("user_profiles") as any)
          .select("preferences")
          .eq("id", user.id)
          .single();
        const saved = (profile?.preferences as Record<string, unknown>)?.theme;
        if (typeof saved === "string" && isSentinelThemeId(saved) && saved !== resolved) {
          setThemeState(saved);
          applyThemeToDocument(saved);
          try { localStorage.setItem(SENTINEL_THEME_STORAGE_KEY, saved); } catch { /* */ }
        }
      } catch { /* */ }
    })();
  }, []);

  const setTheme = useCallback((id: SentinelThemeId) => {
    setThemeState(id);
    applyThemeToDocument(id);
    try { localStorage.setItem(SENTINEL_THEME_STORAGE_KEY, id); } catch { /* */ }
    void persistToSupabase(id);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useSentinelTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useSentinelTheme must be used within ThemeProvider");
  }
  return ctx;
}
