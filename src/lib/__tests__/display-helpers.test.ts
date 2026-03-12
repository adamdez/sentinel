import { describe, it, expect } from "vitest";
import {
  toTitleCase,
  formatSellerName,
  fmtPrice,
  spreadColor,
} from "@/lib/display-helpers";

// ── toTitleCase ──────────────────────────────────────────────────────
describe("toTitleCase", () => {
  it("capitalizes first letter of each word", () => {
    expect(toTitleCase("john doe")).toBe("John Doe");
  });

  it("lowercases everything first", () => {
    expect(toTitleCase("JOHN DOE")).toBe("John Doe");
  });

  it("handles single word", () => {
    expect(toTitleCase("SMITH")).toBe("Smith");
  });

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });
});

// ── formatSellerName ─────────────────────────────────────────────────
describe("formatSellerName", () => {
  it("returns null for null input", () => {
    expect(formatSellerName(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatSellerName(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatSellerName("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(formatSellerName("   ")).toBeNull();
  });

  it("passes through already-formatted mixed-case names", () => {
    expect(formatSellerName("John Doe")).toBe("John Doe");
  });

  it("passes through already-formatted lowercase names", () => {
    expect(formatSellerName("john doe")).toBe("john doe");
  });

  it("converts ALL CAPS simple name to title case", () => {
    expect(formatSellerName("JOHN DOE")).toBe("John Doe");
  });

  it("converts 'LAST, FIRST' county format to 'First Last'", () => {
    expect(formatSellerName("SMITH, JOHN")).toBe("John Smith");
  });

  it("strips trailing mailing address digits from county format", () => {
    expect(formatSellerName("SMITH, JOHN 123 MAIN ST SPOKANE WA")).toBe("John Smith");
  });

  it("handles 'LAST, FIRST MIDDLE' format", () => {
    expect(formatSellerName("DOE, JANE MARIE")).toBe("Jane Marie Doe");
  });

  it("handles last-name-only county format", () => {
    expect(formatSellerName("SMITH,")).toBe("Smith");
  });

  it("handles ALL CAPS name without comma", () => {
    expect(formatSellerName("SMITH")).toBe("Smith");
  });

  it("handles ALL CAPS with comma and trailing address", () => {
    expect(formatSellerName("JOHNSON, ROBERT 456 OAK AVE")).toBe("Robert Johnson");
  });
});

// ── fmtPrice ─────────────────────────────────────────────────────────
describe("fmtPrice", () => {
  it("returns dash for null", () => {
    expect(fmtPrice(null)).toBe("—");
  });

  it("returns dash for undefined", () => {
    expect(fmtPrice(undefined)).toBe("—");
  });

  it("formats standard price as $Xk", () => {
    expect(fmtPrice(150000)).toBe("$150k");
  });

  it("formats zero", () => {
    expect(fmtPrice(0)).toBe("$0k");
  });

  it("formats small price", () => {
    expect(fmtPrice(5000)).toBe("$5k");
  });

  it("formats negative spread", () => {
    expect(fmtPrice(-5000)).toBe("-$5k");
  });

  it("rounds to nearest thousand", () => {
    expect(fmtPrice(152500)).toBe("$153k");
  });
});

// ── spreadColor ──────────────────────────────────────────────────────
describe("spreadColor", () => {
  it("returns green for positive spread", () => {
    expect(spreadColor(5000)).toBe("text-emerald-400");
  });

  it("returns red for negative spread", () => {
    expect(spreadColor(-3000)).toBe("text-red-400");
  });

  it("returns muted for zero spread", () => {
    expect(spreadColor(0)).toBe("text-muted-foreground");
  });
});
