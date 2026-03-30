import { describe, expect, it } from "vitest";
import { normalizeTinaChallengeShortList } from "@/tina/lib/research-challenger";

describe("normalizeTinaChallengeShortList", () => {
  it("trims long challenge bullets down to calm UI-sized lines", () => {
    const normalized = normalizeTinaChallengeShortList([
      `This warning keeps going and going until it is much longer than Tina should ever show in one small weak-spot chip, because the model decided to pour an entire reviewer paragraph into one item instead of splitting the point into a short warning that still fits the UI cleanly.`,
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.length).toBeLessThanOrEqual(220);
    expect(normalized[0]?.endsWith("...")).toBe(true);
  });

  it("collapses whitespace and removes duplicates after normalization", () => {
    const normalized = normalizeTinaChallengeShortList([
      "  Confirm   the service facts before using this.  ",
      "Confirm the service facts before using this.",
      "",
    ]);

    expect(normalized).toEqual(["Confirm the service facts before using this."]);
  });
});
