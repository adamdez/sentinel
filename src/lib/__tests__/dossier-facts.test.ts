import { describe, expect, it } from "vitest";
import { labelForFactType } from "@/lib/dossier-facts";

describe("labelForFactType", () => {
  it("uses curated labels for legacy dossier categories", () => {
    expect(labelForFactType("probate_status")).toBe("Probate status");
  });

  it("formats dynamic provider fact keys for display", () => {
    expect(labelForFactType("provider_bricked_arv_estimate")).toBe("Provider Bricked Arv Estimate");
  });
});
