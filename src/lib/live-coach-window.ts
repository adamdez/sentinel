export type LiveCoachWindowMode = "open" | "minimized";

export interface LiveCoachWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  lastExplicitMode: LiveCoachWindowMode;
}

export interface LiveCoachViewport {
  width: number;
  height: number;
}

export const LIVE_COACH_WINDOW_STORAGE_KEY = "sentinel_live_coach_window";
export const LIVE_COACH_WINDOW_MARGIN = 16;
export const LIVE_COACH_WINDOW_TOP_OFFSET = 92;
export const LIVE_COACH_WINDOW_DEFAULT_WIDTH = 540;
export const LIVE_COACH_WINDOW_DEFAULT_HEIGHT = 640;
export const LIVE_COACH_WINDOW_MIN_WIDTH = 420;
export const LIVE_COACH_WINDOW_MIN_HEIGHT = 320;
export const LIVE_COACH_WINDOW_COMPACT_BREAKPOINT = 1024;

const FALLBACK_VIEWPORT: LiveCoachViewport = {
  width: 1440,
  height: 900,
};

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function round(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

export function getLiveCoachViewport(): LiveCoachViewport {
  if (typeof window === "undefined") return FALLBACK_VIEWPORT;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function isCompactLiveCoachViewport(viewport: LiveCoachViewport): boolean {
  return viewport.width < LIVE_COACH_WINDOW_COMPACT_BREAKPOINT;
}

export function createDefaultLiveCoachWindowState(
  viewport: LiveCoachViewport,
): LiveCoachWindowState {
  const usableWidth = Math.max(280, viewport.width - (LIVE_COACH_WINDOW_MARGIN * 2));
  const usableHeight = Math.max(
    260,
    viewport.height - LIVE_COACH_WINDOW_TOP_OFFSET - LIVE_COACH_WINDOW_MARGIN,
  );
  const width = Math.min(LIVE_COACH_WINDOW_DEFAULT_WIDTH, usableWidth);
  const height = Math.min(LIVE_COACH_WINDOW_DEFAULT_HEIGHT, usableHeight);
  const x = Math.max(LIVE_COACH_WINDOW_MARGIN, viewport.width - width - LIVE_COACH_WINDOW_MARGIN);
  const y = clamp(
    LIVE_COACH_WINDOW_TOP_OFFSET,
    LIVE_COACH_WINDOW_MARGIN,
    Math.max(LIVE_COACH_WINDOW_TOP_OFFSET, viewport.height - height - LIVE_COACH_WINDOW_MARGIN),
  );

  return {
    x,
    y,
    width,
    height,
    minimized: false,
    lastExplicitMode: "open",
  };
}

export function clampLiveCoachWindowState(
  state: LiveCoachWindowState,
  viewport: LiveCoachViewport,
): LiveCoachWindowState {
  const usableWidth = Math.max(280, viewport.width - (LIVE_COACH_WINDOW_MARGIN * 2));
  const usableHeight = Math.max(
    260,
    viewport.height - LIVE_COACH_WINDOW_TOP_OFFSET - LIVE_COACH_WINDOW_MARGIN,
  );
  const minWidth = Math.min(LIVE_COACH_WINDOW_MIN_WIDTH, usableWidth);
  const minHeight = Math.min(LIVE_COACH_WINDOW_MIN_HEIGHT, usableHeight);
  const width = clamp(round(state.width, LIVE_COACH_WINDOW_DEFAULT_WIDTH), minWidth, usableWidth);
  const height = clamp(round(state.height, LIVE_COACH_WINDOW_DEFAULT_HEIGHT), minHeight, usableHeight);
  const maxX = Math.max(LIVE_COACH_WINDOW_MARGIN, viewport.width - width - LIVE_COACH_WINDOW_MARGIN);
  const maxY = Math.max(
    LIVE_COACH_WINDOW_TOP_OFFSET,
    viewport.height - height - LIVE_COACH_WINDOW_MARGIN,
  );

  return {
    x: clamp(round(state.x, LIVE_COACH_WINDOW_MARGIN), LIVE_COACH_WINDOW_MARGIN, maxX),
    y: clamp(round(state.y, LIVE_COACH_WINDOW_TOP_OFFSET), LIVE_COACH_WINDOW_TOP_OFFSET, maxY),
    width,
    height,
    minimized: Boolean(state.minimized),
    lastExplicitMode: state.lastExplicitMode === "minimized" ? "minimized" : "open",
  };
}

export function parseStoredLiveCoachWindowState(
  raw: string | null,
  viewport: LiveCoachViewport,
): LiveCoachWindowState {
  const fallback = createDefaultLiveCoachWindowState(viewport);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<LiveCoachWindowState>;
    return clampLiveCoachWindowState({
      ...fallback,
      ...parsed,
    }, viewport);
  } catch {
    return fallback;
  }
}

export function loadStoredLiveCoachWindowState(
  viewport: LiveCoachViewport,
): LiveCoachWindowState {
  if (typeof window === "undefined") return createDefaultLiveCoachWindowState(viewport);
  try {
    return parseStoredLiveCoachWindowState(
      window.localStorage.getItem(LIVE_COACH_WINDOW_STORAGE_KEY),
      viewport,
    );
  } catch {
    return createDefaultLiveCoachWindowState(viewport);
  }
}

export function saveStoredLiveCoachWindowState(state: LiveCoachWindowState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIVE_COACH_WINDOW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota and private mode errors.
  }
}

export function applyExplicitLiveCoachWindowMode(
  state: LiveCoachWindowState,
  mode: LiveCoachWindowMode,
): LiveCoachWindowState {
  return {
    ...state,
    minimized: mode === "minimized",
    lastExplicitMode: mode,
  };
}

export function applyTemporaryLiveCoachWindowMinimize(
  state: LiveCoachWindowState,
): LiveCoachWindowState {
  return {
    ...state,
    minimized: true,
  };
}
