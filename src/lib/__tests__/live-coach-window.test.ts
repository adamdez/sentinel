import { describe, expect, it } from "vitest";

import {
  applyExplicitLiveCoachWindowMode,
  applyTemporaryLiveCoachWindowMinimize,
  clampLiveCoachWindowState,
  createDefaultLiveCoachWindowState,
  parseStoredLiveCoachWindowState,
} from "@/lib/live-coach-window";

const desktopViewport = { width: 1440, height: 900 };

describe("live coach window helpers", () => {
  it("returns the default window state when nothing is stored", () => {
    const state = parseStoredLiveCoachWindowState(null, desktopViewport);

    expect(state).toEqual(createDefaultLiveCoachWindowState(desktopViewport));
    expect(state.minimized).toBe(false);
    expect(state.lastExplicitMode).toBe("open");
  });

  it("clamps off-screen positions and oversized dimensions into the viewport", () => {
    const state = clampLiveCoachWindowState({
      x: 5000,
      y: -500,
      width: 2000,
      height: 2000,
      minimized: false,
      lastExplicitMode: "open",
    }, desktopViewport);

    expect(state.width).toBeLessThanOrEqual(desktopViewport.width - 32);
    expect(state.height).toBeLessThanOrEqual(desktopViewport.height - 108);
    expect(state.x).toBeGreaterThanOrEqual(16);
    expect(state.y).toBeGreaterThanOrEqual(92);
  });

  it("recovers from invalid stored json by falling back to defaults", () => {
    const state = parseStoredLiveCoachWindowState("{bad json", desktopViewport);

    expect(state).toEqual(createDefaultLiveCoachWindowState(desktopViewport));
  });

  it("updates explicit minimize state and remembers the last explicit mode", () => {
    const initial = createDefaultLiveCoachWindowState(desktopViewport);
    const minimized = applyExplicitLiveCoachWindowMode(initial, "minimized");
    const reopened = applyExplicitLiveCoachWindowMode(minimized, "open");

    expect(minimized.minimized).toBe(true);
    expect(minimized.lastExplicitMode).toBe("minimized");
    expect(reopened.minimized).toBe(false);
    expect(reopened.lastExplicitMode).toBe("open");
  });

  it("keeps the last explicit mode when auto-minimizing for the client file", () => {
    const initial = createDefaultLiveCoachWindowState(desktopViewport);
    const minimized = applyTemporaryLiveCoachWindowMinimize(initial);

    expect(minimized.minimized).toBe(true);
    expect(minimized.lastExplicitMode).toBe("open");
  });
});
