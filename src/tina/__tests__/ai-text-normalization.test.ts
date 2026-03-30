import { describe, expect, it } from "vitest";
import {
  sanitizeTinaAiText,
  sanitizeTinaAiTextList,
} from "@/tina/lib/ai-text-normalization";

describe("sanitizeTinaAiText", () => {
  it("normalizes actual smart punctuation that shows up in Tina's saved research text", () => {
    expect(
      sanitizeTinaAiText(
        "Blue Cedar’s memo cites IRC §164 and calls this a “small equipment write-off.”"
      )
    ).toBe(`Blue Cedar's memo cites IRC §164 and calls this a "small equipment write-off."`);
  });

  it("repairs the mojibake patterns Tina is currently seeing in live research text", () => {
    expect(
      sanitizeTinaAiText(
        "Blue Cedarâ€™s memo cites IRC Â§164 and calls this a â€œsmall equipment write-off.â€"
      )
    ).toBe(`Blue Cedar's memo cites IRC §164 and calls this a "small equipment write-off."`);
  });

  it("replaces stray non-english service fragments inside english sentences", () => {
    expect(sanitizeTinaAiText("The item was placed in服务 in 2025.")).toBe(
      "The item was placed in service in 2025."
    );
    expect(sanitizeTinaAiText("The item was placed inæœåŠ¡ in 2025.")).toBe(
      "The item was placed in service in 2025."
    );
  });

  it("sanitizes lists and removes duplicates after cleanup", () => {
    expect(
      sanitizeTinaAiTextList([
        "Blue Cedarâ€™s memo",
        "Blue Cedar's memo",
        "IRC Â§164",
      ])
    ).toEqual(["Blue Cedar's memo", "IRC §164"]);
  });
});
