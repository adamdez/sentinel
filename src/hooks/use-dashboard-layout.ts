"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  DEFAULT_LAYOUT,
  MAX_DASHBOARD_TILES,
  type DashboardLayout,
  type DashboardTile,
  type WidgetId,
  type WidgetSize,
} from "@/lib/dashboard-config";
import { useSentinelStore } from "@/lib/store";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const STORAGE_KEY = "sentinel_dashboard_layout";

function loadFromStorage(userId: string): DashboardLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(userId: string, layout: DashboardLayout) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(layout));
}

async function saveToSupabase(userId: string, layout: DashboardLayout) {
  try {
    const user = await getCurrentUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("user_profiles") as any)
      .update({ saved_dashboard_layout: layout })
      .eq("id", userId);

    if (error) {
      console.warn("[Dashboard] Supabase save failed:", error.message ?? error);
    }
  } catch {
    // Supabase not connected — localStorage is the fallback
  }
}

async function loadFromSupabase(userId: string): Promise<DashboardLayout | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("user_profiles") as any)
      .select("saved_dashboard_layout")
      .eq("id", userId)
      .single() as {
        data: { saved_dashboard_layout: DashboardLayout | null } | null;
        error: { code?: string; message?: string } | null;
      };

    if (error) {
      if (error.code === "PGRST116") {
        console.debug("[Dashboard] No profile found — will use defaults");
      }
      return null;
    }

    return data?.saved_dashboard_layout ?? null;
  } catch {
    return null;
  }
}

export function useDashboardLayout() {
  const { currentUser } = useSentinelStore();
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [isDirty, setIsDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const localLayout = loadFromStorage(currentUser.id);
    if (localLayout) {
      setLayout(localLayout);
    }

    loadFromSupabase(currentUser.id).then((remote) => {
      if (remote && remote.updatedAt > (localLayout?.updatedAt ?? "")) {
        setLayout(remote);
        saveToStorage(currentUser.id, remote);
      }
    });
  }, [currentUser.id]);

  const updateLayout = useCallback(
    (newLayout: DashboardLayout) => {
      const stamped = { ...newLayout, updatedAt: new Date().toISOString() };
      setLayout(stamped);
      setIsDirty(true);

      saveToStorage(currentUser.id, stamped);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveToSupabase(currentUser.id, stamped);
      }, 1500);

      logAudit(currentUser.id, "settings.changed", "dashboard_layout", currentUser.id, {
        tileCount: stamped.tiles.length,
      });
    },
    [currentUser.id]
  );

  const reorderTiles = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newTiles = [...layout.tiles];
      const [moved] = newTiles.splice(fromIndex, 1);
      newTiles.splice(toIndex, 0, moved);
      const reordered = newTiles.map((t, i) => ({ ...t, order: i }));
      updateLayout({ ...layout, tiles: reordered });
    },
    [layout, updateLayout]
  );

  const addWidget = useCallback(
    (widgetId: WidgetId, size: WidgetSize) => {
      if (layout.tiles.length >= MAX_DASHBOARD_TILES) return false;
      if (layout.tiles.some((t) => t.widgetId === widgetId)) return false;

      const newTile: DashboardTile = {
        widgetId,
        size,
        order: layout.tiles.length,
      };
      updateLayout({ ...layout, tiles: [...layout.tiles, newTile] });
      return true;
    },
    [layout, updateLayout]
  );

  const removeWidget = useCallback(
    (widgetId: WidgetId) => {
      const filtered = layout.tiles
        .filter((t) => t.widgetId !== widgetId)
        .map((t, i) => ({ ...t, order: i }));
      updateLayout({ ...layout, tiles: filtered });
    },
    [layout, updateLayout]
  );

  const resizeWidget = useCallback(
    (widgetId: WidgetId, size: WidgetSize) => {
      const updated = layout.tiles.map((t) =>
        t.widgetId === widgetId ? { ...t, size } : t
      );
      updateLayout({ ...layout, tiles: updated });
    },
    [layout, updateLayout]
  );

  const resetToDefault = useCallback(() => {
    updateLayout(DEFAULT_LAYOUT);
    setIsDirty(false);
  }, [updateLayout]);

  return {
    layout,
    isDirty,
    reorderTiles,
    addWidget,
    removeWidget,
    resizeWidget,
    resetToDefault,
    canAddMore: layout.tiles.length < MAX_DASHBOARD_TILES,
    activeWidgetIds: layout.tiles.map((t) => t.widgetId),
  };
}
