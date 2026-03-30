import { describe, expect, it } from "vitest";
import {
  TINA_IRS_AUTHORITY_REGISTRY_VERIFIED_AT,
  TINA_IRS_AUTHORITY_SUPPORTED_TAX_YEAR,
  describeTinaIrsAuthorityRegistry,
  getTinaIrsAuthoritySource,
  getTinaIrsAuthorityRegistryStatus,
  listTinaIrsAnnualWatchSources,
  listTinaIrsAuthoritySources,
} from "@/tina/lib/irs-authority-registry";

describe("IRS authority registry", () => {
  it("covers the core supported Schedule C owner-return lane", () => {
    const sources = listTinaIrsAuthoritySources({
      laneId: "schedule_c_single_member_llc",
      includeSupportingReference: true,
    });
    const sourceIds = new Set(sources.map((source) => source.id));

    expect(sourceIds.has("irs-small-business-tax-center")).toBe(true);
    expect(sourceIds.has("irs-sole-proprietorships")).toBe(true);
    expect(sourceIds.has("irs-forms-for-sole-proprietorship")).toBe(true);
    expect(sourceIds.has("irs-schedule-c-instructions-2025")).toBe(true);
    expect(sourceIds.has("irs-schedule-se-instructions-2025")).toBe(true);
    expect(sourceIds.has("irs-form-4562-about")).toBe(true);
    expect(sourceIds.has("irs-form-4562-instructions-2025")).toBe(true);
    expect(sourceIds.has("irs-form-8829-about")).toBe(true);
    expect(sourceIds.has("irs-form-8829-instructions-2025")).toBe(true);
    expect(sourceIds.has("irs-form-8995-about")).toBe(true);
    expect(sourceIds.has("irs-form-8995-instructions-2025")).toBe(true);
    expect(sourceIds.has("irs-publication-334-about")).toBe(true);
  });

  it("keeps every registry entry on https://irs.gov", () => {
    const sources = listTinaIrsAuthoritySources({
      laneId: "schedule_c_single_member_llc",
      includeAnnualWatch: true,
      includeSupportingReference: true,
    });

    expect(sources.length).toBeGreaterThan(10);
    sources.forEach((source) => {
      const url = new URL(source.url);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("www.irs.gov");
    });
  });

  it("separates annual watch sources from runtime authorities", () => {
    const sources = listTinaIrsAnnualWatchSources();
    const sourceIds = sources.map((source) => source.id);

    expect(sourceIds).toEqual(
      expect.arrayContaining([
        "irs-post-release-changes",
        "irs-tax-calendar",
        "irs-e-news-subscriptions",
      ])
    );
    expect(sources.every((source) => source.use === "annual_watch")).toBe(true);
  });

  it("surfaces one authority by id with the current supported tax year", () => {
    const source = getTinaIrsAuthoritySource("irs-schedule-c-instructions-2025");

    expect(source?.taxYear).toBe(TINA_IRS_AUTHORITY_SUPPORTED_TAX_YEAR);
    expect(source?.title).toContain("Schedule C");
  });

  it("blocks tax years outside the current certified IRS registry year", () => {
    const status = getTinaIrsAuthorityRegistryStatus("schedule_c_single_member_llc", "2026");

    expect(status.level).toBe("blocked");
    expect(status.summary).toContain("2025");
    expect(status.summary).toContain("2026");
  });
});

describe("describeTinaIrsAuthorityRegistry", () => {
  it("explains the registry in plain language", () => {
    const lines = describeTinaIrsAuthorityRegistry();

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain(TINA_IRS_AUTHORITY_REGISTRY_VERIFIED_AT);
    expect(lines[1]).toContain("2025 Schedule C");
    expect(lines[2]).toContain("Annual watch sources");
  });
});
