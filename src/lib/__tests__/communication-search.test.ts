import { describe, expect, it } from "vitest";
import { matchesCommunicationSearch } from "@/lib/dialer/communication-search";

describe("matchesCommunicationSearch", () => {
  it("matches partial phone digits like an area code", () => {
    expect(matchesCommunicationSearch("509", ["+1 (509) 555-1234", "Melissa Donahue"])).toBe(true);
  });

  it("matches house numbers and zip codes inside address text", () => {
    expect(matchesCommunicationSearch("906", ["906 E Vicksburg Ave, Spokane, WA 99207"])).toBe(true);
    expect(matchesCommunicationSearch("99207", ["906 E Vicksburg Ave, Spokane, WA 99207"])).toBe(true);
  });

  it("matches freeform owner and message text without token order requirements", () => {
    expect(matchesCommunicationSearch("donahue callback", [
      "Melissa Donahue",
      "Asked for a callback next week",
    ])).toBe(true);
  });

  it("does not match unrelated records", () => {
    expect(matchesCommunicationSearch("631", ["+1 (509) 555-1234", "906 E Vicksburg Ave"])).toBe(false);
  });
});
