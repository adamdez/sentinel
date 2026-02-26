"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DEFAULT_LAYOUT,
  MAX_DASHBOARD_TILES,
  type DashboardLayout,
  type DashboardTile,
  type WidgetId,
  type WidgetSize,
} from "@/lib/dashboard-config";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
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

let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function saveToSupabase(userId: string, layout: DashboardLayout) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("user_profiles") as any)
        .update({ saved_dashboard_layout: layout })
        .eq("id", userId) as { error: { message: string } | null };

      if (error) {
        console.warn("[Dashboard] Supabase save failed (table may not exist yet):", error.message);
      }
    } catch {
      // Supabase not connected yet — localStorage persists
    }
  }, 1500);
}

async function loadFromSupabase(userId: string): Promise<DashboardLayout | null> {
  try {
    // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("user_profiles") as any)
      .select("saved_dashboard_layout")
      .eq("id", userId)
      .single() as {
        data: { saved_dashboard_layout: DashboardLayout | null } | null;
        error: unknown;
      };

    if (error || !data?.saved_dashboard_layout) return null;
    return data.saved_dashboard_layout;
  } catch {
    return null;
  }
}

export function useDashboardLayout() {
  const { currentUser } = useSentinelStore();
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [isDirty, setIsDirty] = useState(false);

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
      saveToSupabase(currentUser.id, stamped);

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
