import { describe, expect, it } from "vitest";

import { runWithConcurrency } from "@/lib/async-batch";

describe("runWithConcurrency", () => {
  it("returns results in input order", async () => {
    const results = await runWithConcurrency([3, 1, 2], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value * 5));
      return value * 10;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  it("caps concurrent work", async () => {
    let active = 0;
    let peak = 0;

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return null;
    });

    expect(peak).toBe(2);
  });

  it("handles empty input", async () => {
    await expect(runWithConcurrency([], 4, async () => "x")).resolves.toEqual([]);
  });
});
