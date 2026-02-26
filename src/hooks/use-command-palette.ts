"use client";

import { useEffect } from "react";
import { useSentinelStore } from "@/lib/store";

export function useCommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useSentinelStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  return { open: commandPaletteOpen, setOpen: setCommandPaletteOpen };
}
