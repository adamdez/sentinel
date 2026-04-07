"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Brain,
  ExternalLink,
  GripHorizontal,
  Maximize2,
  Minimize2,
  MonitorUp,
  PanelsTopLeft,
} from "lucide-react";
import { toast } from "sonner";
import type { PreCallBrief } from "@/hooks/use-pre-call-brief";
import type { LiveCoachState } from "@/hooks/use-live-coach";
import type { LiveCoachMode } from "@/hooks/use-live-coach";
import { cn } from "@/lib/utils";
import {
  applyExplicitLiveCoachWindowMode,
  applyTemporaryLiveCoachWindowMinimize,
  clampLiveCoachWindowState,
  getLiveCoachViewport,
  isCompactLiveCoachViewport,
  loadStoredLiveCoachWindowState,
  saveStoredLiveCoachWindowState,
  type LiveCoachViewport,
  type LiveCoachWindowMode,
  type LiveCoachWindowState,
} from "@/lib/live-coach-window";
import { LiveAssistPanel } from "@/components/sentinel/live-assist-panel";

export const LIVE_COACH_POPOUT_CHANNEL = "sentinel-coach-popout";

interface LiveCoachWindowProps {
  active: boolean;
  brief: PreCallBrief | null;
  coach?: LiveCoachState | null;
  loading?: boolean;
  error?: string | null;
  fileModalOpen?: boolean;
  sessionId?: string | null;
  coachMode?: LiveCoachMode;
}

type InteractionType = "drag" | "resize-right" | "resize-bottom" | "resize-corner";

type ActiveInteraction = {
  type: InteractionType;
  startX: number;
  startY: number;
  startState: LiveCoachWindowState;
};

const STAGE_LABELS: Record<string, string> = {
  connection: "Connection",
  situation: "Situation",
  problem_awareness: "Problem",
  solution_awareness: "Relief",
  consequence: "Consequence",
  commitment: "Commitment",
};

function getStageLabel(
  brief: PreCallBrief | null,
  coach: LiveCoachState | null,
): string {
  const stage = coach?.currentStage ?? brief?.currentStage ?? "situation";
  return STAGE_LABELS[stage] ?? "Situation";
}

function getSourceLabel(coach: LiveCoachState | null): string | null {
  if (coach?.source === "gpt5") return "GPT-5";
  if (coach?.source === "rules") return "Rules First";
  return null;
}

function getCursorForInteraction(type: InteractionType): string {
  if (type === "drag") return "move";
  if (type === "resize-right") return "ew-resize";
  if (type === "resize-bottom") return "ns-resize";
  return "nwse-resize";
}

function clampForInteraction(
  type: InteractionType,
  interaction: ActiveInteraction,
  event: MouseEvent,
  viewport: LiveCoachViewport,
): LiveCoachWindowState {
  const deltaX = event.clientX - interaction.startX;
  const deltaY = event.clientY - interaction.startY;
  const nextState = { ...interaction.startState };

  if (type === "drag") {
    nextState.x = interaction.startState.x + deltaX;
    nextState.y = interaction.startState.y + deltaY;
  }

  if (type === "resize-right" || type === "resize-corner") {
    nextState.width = interaction.startState.width + deltaX;
  }

  if (type === "resize-bottom" || type === "resize-corner") {
    nextState.height = interaction.startState.height + deltaY;
  }

  return clampLiveCoachWindowState(nextState, viewport);
}

export function LiveCoachWindow({
  active,
  brief,
  coach = null,
  loading = false,
  error = null,
  fileModalOpen = false,
  sessionId = null,
  coachMode = "outbound",
}: LiveCoachWindowProps) {
  const initialViewport = getLiveCoachViewport();
  const [viewport, setViewport] = useState<LiveCoachViewport>(initialViewport);
  const [windowState, setWindowState] = useState<LiveCoachWindowState>(() => (
    loadStoredLiveCoachWindowState(initialViewport)
  ));
  const [popoutActive, setPopoutActive] = useState(false);
  const windowStateRef = useRef(windowState);
  const interactionCleanupRef = useRef<(() => void) | null>(null);
  const wasActiveRef = useRef(active);
  const popoutRef = useRef<Window | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const lastSessionIdRef = useRef<string | null>(sessionId);

  useEffect(() => {
    try {
      broadcastRef.current = new BroadcastChannel(LIVE_COACH_POPOUT_CHANNEL);
    } catch {
      // BroadcastChannel not supported
    }
    return () => {
      broadcastRef.current?.close();
      broadcastRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sessionId) {
      lastSessionIdRef.current = sessionId;
    }
  }, [sessionId]);

  useEffect(() => {
    if (active) return;
    const closingSessionId = sessionId ?? lastSessionIdRef.current;
    if (closingSessionId) {
      broadcastRef.current?.postMessage({ type: "call-ended", sessionId: closingSessionId });
    }
    popoutRef.current = null;
    setPopoutActive(false);
  }, [active, sessionId]);

  useEffect(() => {
    if (!popoutActive) return;

    const timer = window.setInterval(() => {
      if (!popoutRef.current || popoutRef.current.closed) {
        popoutRef.current = null;
        setPopoutActive(false);
      }
    }, 500);

    return () => {
      window.clearInterval(timer);
    };
  }, [popoutActive]);

  const handlePopOut = useCallback(() => {
    if (!sessionId) return;

    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.focus();
      setPopoutActive(true);
      return;
    }

    const params = new URLSearchParams({ sessionId, mode: coachMode });
    const url = `/coach-popout?${params.toString()}`;
    const features = "width=520,height=700,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes";

    const opened = window.open(url, "sentinel-live-coach", features);
    if (opened) {
      popoutRef.current = opened;
      setPopoutActive(true);
      setWindowState((previous) => applyExplicitLiveCoachWindowMode(previous, "minimized"));
    } else {
      toast.error("Pop-out blocked — check your browser settings");
    }
  }, [sessionId, coachMode]);

  const handleReturnToDock = useCallback(() => {
    if (popoutRef.current && !popoutRef.current.closed) {
      popoutRef.current.close();
    }
    popoutRef.current = null;
    setPopoutActive(false);
    setWindowState((previous) => applyExplicitLiveCoachWindowMode(previous, "open"));
  }, []);

  const compactViewport = isCompactLiveCoachViewport(viewport);
  const stageLabel = useMemo(() => getStageLabel(brief, coach), [brief, coach]);
  const sourceLabel = useMemo(() => getSourceLabel(coach), [coach]);
  const shouldRenderContent = Boolean(brief || coach || loading || error);

  useEffect(() => {
    windowStateRef.current = windowState;
  }, [windowState]);

  useEffect(() => {
    const nextViewport = getLiveCoachViewport();
    setViewport(nextViewport);
    setWindowState(loadStoredLiveCoachWindowState(nextViewport));

    const handleResize = () => {
      const currentViewport = getLiveCoachViewport();
      setViewport(currentViewport);
      setWindowState((previous) => clampLiveCoachWindowState(previous, currentViewport));
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const persistedState: LiveCoachWindowState = {
      ...windowState,
      minimized: windowState.lastExplicitMode === "minimized",
    };
    const timer = window.setTimeout(() => {
      saveStoredLiveCoachWindowState(persistedState);
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [windowState]);

  useEffect(() => {
    if (active && !wasActiveRef.current) {
      const currentViewport = getLiveCoachViewport();
      const persisted = loadStoredLiveCoachWindowState(currentViewport);
      setViewport(currentViewport);
      setWindowState(clampLiveCoachWindowState({
        ...persisted,
        minimized: persisted.lastExplicitMode === "minimized",
      }, currentViewport));
    }

    if (!active && wasActiveRef.current) {
      interactionCleanupRef.current?.();
      interactionCleanupRef.current = null;
    }

    wasActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active || !fileModalOpen) return;
    setWindowState((previous) => (
      previous.minimized ? previous : applyTemporaryLiveCoachWindowMinimize(previous)
    ));
  }, [active, fileModalOpen]);

  const setExplicitMode = useCallback((mode: LiveCoachWindowMode) => {
    setWindowState((previous) => applyExplicitLiveCoachWindowMode(previous, mode));
  }, []);

  const beginInteraction = useCallback((type: InteractionType, event: ReactMouseEvent<HTMLDivElement>) => {
    if (compactViewport) return;

    event.preventDefault();
    event.stopPropagation();
    interactionCleanupRef.current?.();

    const interaction: ActiveInteraction = {
      type,
      startX: event.clientX,
      startY: event.clientY,
      startState: windowStateRef.current,
    };

    const cursor = getCursorForInteraction(type);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentViewport = getLiveCoachViewport();
      setViewport(currentViewport);
      setWindowState(clampForInteraction(type, interaction, moveEvent, currentViewport));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      interactionCleanupRef.current = null;
    };

    interactionCleanupRef.current = handleMouseUp;
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [compactViewport]);

  useEffect(() => {
    return () => {
      interactionCleanupRef.current?.();
      interactionCleanupRef.current = null;
    };
  }, []);

  if (!active) return null;

  if (popoutActive) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[60]">
        <div
          className={cn(
            "pointer-events-auto fixed flex items-center gap-2 rounded-full border border-primary/20 bg-card/95 px-4 py-2 text-sm shadow-[0_16px_40px_var(--shadow-heavy)] backdrop-blur-xl",
            compactViewport ? "left-3 right-3 bottom-3 justify-center" : "right-6 bottom-6",
          )}
        >
          <MonitorUp className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">Live Coach in pop-out</span>
          <button
            type="button"
            onClick={() => popoutRef.current?.focus()}
            className="inline-flex items-center gap-1 rounded-full border border-overlay-8 bg-overlay-3 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Focus
          </button>
          <button
            type="button"
            onClick={handleReturnToDock}
            className="inline-flex items-center gap-1 rounded-full border border-overlay-8 bg-overlay-3 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <PanelsTopLeft className="h-3 w-3" />
            Dock Here
          </button>
        </div>
      </div>
    );
  }

  const openWindowClasses = compactViewport
    ? "inset-x-3 bottom-3 top-auto max-h-[72vh] min-h-[320px] h-auto"
    : "top-0 left-0";

  const openWindowStyle = compactViewport
    ? undefined
      : {
        left: windowState.x,
        top: windowState.y,
        width: windowState.width,
        height: windowState.height,
      } satisfies CSSProperties;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {windowState.minimized ? (
        <button
          type="button"
          onClick={() => setExplicitMode("open")}
          className={cn(
            "pointer-events-auto fixed flex items-center gap-2 rounded-full border border-primary/20 bg-card/95 px-4 py-2 text-sm shadow-[0_16px_40px_var(--shadow-heavy)] backdrop-blur-xl",
            compactViewport ? "left-3 right-3 bottom-3 justify-center" : "right-6 bottom-6",
          )}
        >
          <Brain className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">Restore Live Coach</span>
          {sessionId && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handlePopOut();
              }}
              className="inline-flex items-center gap-1 rounded-full border border-overlay-8 bg-overlay-3 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Pop Out
            </button>
          )}
          <span className="rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {stageLabel}
          </span>
          <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ) : (
        <section
          className={cn(
            "pointer-events-auto fixed flex flex-col overflow-hidden rounded-[18px] border border-overlay-12 bg-card/95 shadow-[0_24px_80px_var(--shadow-heavy)] backdrop-blur-xl",
            openWindowClasses,
          )}
          style={openWindowStyle}
        >
          <div
            onMouseDown={(event) => beginInteraction("drag", event)}
            className={cn(
              "flex items-center gap-3 border-b border-overlay-8 px-4 py-3",
              compactViewport ? "cursor-default" : "cursor-move",
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-primary/20 bg-primary/10 text-primary">
              <Brain className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Live Coach
                </p>
                <span className="rounded-full border border-primary/15 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {stageLabel}
                </span>
                {sourceLabel && (
                  <span className="rounded-full border border-overlay-8 bg-overlay-3 px-2 py-0.5 text-xs text-muted-foreground/80">
                    {sourceLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/55">
                {loading ? "Refreshing guidance live." : "Drag to move. Resize from the edges."}
              </p>
            </div>
            {!compactViewport && (
              <GripHorizontal className="h-4 w-4 text-muted-foreground/45" />
            )}
            {sessionId && (
              <button
                type="button"
                aria-label="Pop out live coach"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={handlePopOut}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-overlay-8 bg-overlay-3 px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Pop Out
              </button>
            )}
            <button
              type="button"
              aria-label="Minimize live coach"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => setExplicitMode("minimized")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-overlay-8 bg-overlay-3 text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {shouldRenderContent ? (
              <LiveAssistPanel
                brief={brief}
                coach={coach}
                loading={loading}
                error={error}
                showHeader={false}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground/65">
                The coach is listening and will surface guidance as the live call fills in.
              </div>
            )}
          </div>

          {!compactViewport && (
            <>
              <div
                onMouseDown={(event) => beginInteraction("resize-right", event)}
                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
              />
              <div
                onMouseDown={(event) => beginInteraction("resize-bottom", event)}
                className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize"
              />
              <div
                onMouseDown={(event) => beginInteraction("resize-corner", event)}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
