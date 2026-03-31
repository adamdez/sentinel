import { describe, expect, it } from "vitest";

import { runWithConcurrency } from "@/lib/async-batch";

describe("runWithConcurrency", () => {
  it("preserves input order in the returned results", async () => {
    const results = await runWithConcurrency([3, 1, 2], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value * 5));
      return value * 10;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  it("never exceeds the requested concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, value * 2));
      active -= 1;
      return value;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
