import { describe, expect, it } from "vitest";

import { inferCounty } from "@/lib/crawlers/craigslist-fsbo-crawler";

describe("inferCounty", () => {
  it("keeps in-market Idaho and Montana listings out of Spokane", () => {
    expect(inferCounty("Athol", "ID")).toBe("Kootenai");
    expect(inferCounty("Thompson Falls", "MT")).toBe("Sanders");
    expect(inferCounty("Spokane", "WA")).toBe("Spokane");
  });

  it("returns null for unknown locations instead of defaulting to Spokane", () => {
    expect(inferCounty("Boise", "ID")).toBeNull();
    expect(inferCounty("Unknown City", "WA")).toBeNull();
  });
});
