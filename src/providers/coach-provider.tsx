"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CoachContext,
  CoachOutput,
  CoachSurface,
} from "@/lib/coach-types";
import { evaluateCoach } from "@/lib/coach-engine";

type CoachProviderState = {
  panelOpen: boolean;
  togglePanel: () => void;
  surface: CoachSurface;
  setSurface: (s: CoachSurface) => void;
  context: CoachContext;
  setContext: (ctx: CoachContext) => void;
  output: CoachOutput;
};

const EMPTY_OUTPUT: CoachOutput = {
  blockers: [],
  nextSteps: [],
  explainers: [],
  tips: [],
};

const CoachCtx = createContext<CoachProviderState>({
  panelOpen: false,
  togglePanel: () => {},
  surface: "lead_detail",
  setSurface: () => {},
  context: { surface: "lead_detail" },
  setContext: () => {},
  output: EMPTY_OUTPUT,
});

export function CoachProvider({ children }: { children: React.ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [surface, setSurface] = useState<CoachSurface>("lead_detail");
  const [context, setContext] = useState<CoachContext>({
    surface: "lead_detail",
  });

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem("sentinel-coach-open");
    if (stored === "true") setPanelOpen(true);
  }, []);

  const togglePanel = useCallback(() => {
    setPanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem("sentinel-coach-open", String(next));
      return next;
    });
  }, []);

  const output = useMemo(
    () => evaluateCoach(surface, context),
    [surface, context],
  );

  return (
    <CoachCtx.Provider
      value={{
        panelOpen,
        togglePanel,
        surface,
        setSurface,
        context,
        setContext,
        output,
      }}
    >
      {children}
    </CoachCtx.Provider>
  );
}

export function useCoach() {
  return useContext(CoachCtx);
}

/**
 * Hook for surfaces to push their context into the coach.
 * Call this in each surface component to register what the operator is looking at.
 */
export function useCoachSurface(
  surface: CoachSurface,
  ctx: Omit<CoachContext, "surface">,
) {
  const { setSurface, setContext } = useCoach();

  // Serialize context for stable dependency comparison
  const ctxKey = JSON.stringify(ctx);

  useEffect(() => {
    setSurface(surface);
    setContext({ ...JSON.parse(ctxKey), surface });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, ctxKey]);
}
