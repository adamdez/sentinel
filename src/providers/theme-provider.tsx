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
import { isSentinelThemeId } from "@/themes/types";
import { DEFAULT_SENTINEL_THEME } from "@/themes/registry";
import { SENTINEL_THEME_STORAGE_KEY } from "@/themes/constants";

interface ThemeContextValue {
  theme: SentinelThemeId;
  setTheme: (id: SentinelThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(id: SentinelThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-sentinel-theme", id);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<SentinelThemeId>(DEFAULT_SENTINEL_THEME);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SENTINEL_THEME_STORAGE_KEY);
      if (raw && isSentinelThemeId(raw)) {
        setThemeState(raw);
        applyThemeToDocument(raw);
        return;
      }
    } catch {
      /* ignore */
    }
    applyThemeToDocument(DEFAULT_SENTINEL_THEME);
  }, []);

  const setTheme = useCallback((id: SentinelThemeId) => {
    setThemeState(id);
    applyThemeToDocument(id);
    try {
      localStorage.setItem(SENTINEL_THEME_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
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
