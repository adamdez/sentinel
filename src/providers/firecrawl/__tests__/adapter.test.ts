import { describe, expect, it } from "vitest";
import { selectBestZillowResult, toNumberOrNull } from "../adapter";

describe("firecrawl Zillow helpers", () => {
  it("normalizes Zillow estimate strings into rounded numbers", () => {
    expect(toNumberOrNull("$512,345")).toBe(512345);
    expect(toNumberOrNull("512345.49")).toBe(512345);
    expect(toNumberOrNull(null)).toBeNull();
  });

  it("prefers the strongest Zillow homedetails result for the property", () => {
    const result = selectBestZillowResult(
      [
        {
          url: "https://www.zillow.com/homes/Spokane,-WA_rb/",
          title: "Spokane WA Homes For Sale",
        },
        {
          url: "https://www.zillow.com/homedetails/1234-N-Monroe-St-Spokane-WA-99201/23595959_zpid/",
          title: "1234 N Monroe St, Spokane, WA 99201",
        },
        {
          url: "https://www.zillow.com/b/1234-n-monroe-st-spokane-wa-abc123/",
          title: "1234 N Monroe St, Spokane WA",
        },
      ],
      ["1234 N Monroe St", "Spokane", "WA", "99201"],
    );

    expect(result?.url).toContain("/homedetails/");
  });
});
