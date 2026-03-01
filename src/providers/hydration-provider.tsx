"use client";

import { createContext, useContext, useState, useEffect } from "react";

const HydrationContext = createContext(false);

export function HydrationProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <HydrationContext.Provider value={hydrated}>
      {children}
    </HydrationContext.Provider>
  );
}

export function useHydrated(): boolean {
  return useContext(HydrationContext);
}
