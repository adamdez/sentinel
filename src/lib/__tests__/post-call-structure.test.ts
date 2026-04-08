import { describe, expect, it } from "vitest";

import {
  buildFallbackPostCallStructureInput,
  buildSellerMemoryBullets,
  hasPostCallStructureContent,
  mergePostCallStructureFields,
} from "@/lib/dialer/post-call-structure";

describe("post-call fallback structure", () => {
  it("builds a durable fallback from publish-time fields", () => {
    const fallback = buildFallbackPostCallStructureInput({
      disposition: "follow_up",
      summary: "",
      nextAction: "Send comps and call Thursday evening",
      callbackAt: "2026-04-10T02:30:00.000Z",
    });

    expect(fallback.summary_line).toBe("Follow Up call outcome recorded.");
    expect(fallback.next_task_suggestion).toBe("Send comps and call Thursday evening");
    expect(fallback.callback_timing_hint).toContain("Callback set for");
  });

  it("merges stronger values over fallback without dropping useful details", () => {
    const merged = mergePostCallStructureFields(
      {
        summary_line: "Seller wants to retire and review options this week.",
        objection: null,
      },
      {
        summary_line: "Follow Up call outcome recorded.",
        next_task_suggestion: "Call back Thursday evening",
        callback_timing_hint: "Callback set for Thu, Apr 9, 7:30 PM",
      },
    );

    expect(merged.summary_line).toBe("Seller wants to retire and review options this week.");
    expect(merged.next_task_suggestion).toBe("Call back Thursday evening");
    expect(merged.callback_timing_hint).toBe("Callback set for Thu, Apr 9, 7:30 PM");
  });

  it("detects whether a structure has any usable content", () => {
    expect(hasPostCallStructureContent({ summary_line: "Quick recap" })).toBe(true);
    expect(hasPostCallStructureContent({})).toBe(false);
  });
});

describe("seller memory bullets", () => {
  it("builds a short recap list for the next call", () => {
    const bullets = buildSellerMemoryBullets({
      summaryLine: "Seller wants to retire and sell within 30 days.",
      promisesMade: "We will send a cash offer after reviewing repairs.",
      objection: "Wants near full value before deciding.",
      callbackTimingHint: "Thursday evening",
      dealTemperature: "warm",
    });

    expect(bullets).toEqual([
      "Seller wants to retire and sell within 30 days.",
      "Promise: We will send a cash offer after reviewing repairs.",
      "Blocker: Wants near full value before deciding.",
      "Callback: Thursday evening",
    ]);
  });

  it("falls back to raw call text when no structured summary exists", () => {
    const bullets = buildSellerMemoryBullets({
      fallbackText: "Left voicemail and asked them to call back after work.",
      dealTemperature: "cool",
    });

    expect(bullets).toEqual([
      "Left voicemail and asked them to call back after work.",
      "Temperature: Cool",
    ]);
  });
});
