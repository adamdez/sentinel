import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaEntityReturnPackagePlan } from "@/tina/lib/entity-return-package-plan";

describe("entity-return-package-plan", () => {
  it("maps a partnership return family into explicit package deliverables", () => {
    const snapshot = buildTinaEntityReturnPackagePlan(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );

    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.items.some((item) => item.formId === "f1065")).toBe(true);
    expect(
      snapshot.items.some((item) => /schedule k partnership activity package/i.test(item.title))
    ).toBe(true);
    expect(snapshot.items.some((item) => /schedule k-1/i.test(item.title))).toBe(true);
    expect(snapshot.items.some((item) => item.kind === "supporting_workpaper")).toBe(true);
  });

  it("maps an s-corp return family into explicit primary, k-1, and compensation deliverables", () => {
    const snapshot = buildTinaEntityReturnPackagePlan(
      TINA_SKILL_REVIEW_DRAFTS["s-corp-election"]
    );

    expect(snapshot.laneId).toBe("1120_s");
    expect(snapshot.items.some((item) => item.formId === "f1120s")).toBe(true);
    expect(snapshot.items.some((item) => /schedule k-1/i.test(item.title))).toBe(true);
    expect(
      snapshot.items.some((item) => /officer compensation and distribution workpaper/i.test(item.title))
    ).toBe(true);
  });
});
